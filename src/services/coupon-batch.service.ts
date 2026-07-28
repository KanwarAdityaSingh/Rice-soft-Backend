import { db } from '../database/connection';
import { PoolClient } from 'pg';
import { CouponBatchDAO } from '../dao/coupon-batch.dao';
import { CouponDAO } from '../dao/coupon.dao';
import { CouponStatusHistoryDAO } from '../dao/coupon-status-history.dao';
import { CreateCouponBatchDTO, CouponBatch } from '../models/coupon.model';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import {
  generateCouponCodeChunk,
  COUPON_CODE_GENERATION_CHUNK_SIZE,
} from './coupon-code.generator';
import { CouponStateMachine } from './coupon-state.machine';
import {
  resolveRedeemBaseUrl,
  formatCouponSerial,
  parseCouponSerialSequence,
} from '../utils/coupon.helpers';

const ZERO_INSERT_MAX_ATTEMPTS = 3;

export const COUPON_BATCH_LOCKED_MESSAGE =
  'This coupon batch is locked. Only viewing is allowed.';

export type MarkBatchAllottedSelection =
  | { mode?: undefined }
  | { mode: 'next_available'; count: number }
  | { mode: 'serial_range'; from_serial: string; to_serial: string };

export type MarkBatchAllottedResult = {
  updated: number;
  from_serial: string | null;
  to_serial: string | null;
  from_sequence: number | null;
  to_sequence: number | null;
};

export class CouponBatchService {
  constructor(
    private batchDAO = new CouponBatchDAO(),
    private couponDAO = new CouponDAO(),
    private historyDAO = new CouponStatusHistoryDAO(),
    private stateMachine = new CouponStateMachine()
  ) {}

  /** Throws ConflictError when batch is locked (mutations blocked). */
  assertBatchNotLocked(batch: CouponBatch): void {
    if (batch.is_locked) {
      throw new ConflictError(COUPON_BATCH_LOCKED_MESSAGE);
    }
  }

  async assertBatchIdNotLocked(batchId: string, client?: PoolClient): Promise<CouponBatch> {
    const batch = client
      ? await this.batchDAO.findById(batchId, client)
      : await this.batchDAO.findById(batchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');
    this.assertBatchNotLocked(batch);
    return batch;
  }

  async lockBatch(batchId: string, userId?: string): Promise<CouponBatch> {
    const batch = await this.batchDAO.findById(batchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');
    if (batch.is_locked) return batch;
    const updated = await this.batchDAO.setLocked(batchId, true, userId ?? null);
    if (!updated) throw new NotFoundError('Coupon batch not found');
    return updated;
  }

  async unlockBatch(batchId: string): Promise<CouponBatch> {
    const batch = await this.batchDAO.findById(batchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');
    if (!batch.is_locked) return batch;
    const updated = await this.batchDAO.setLocked(batchId, false);
    if (!updated) throw new NotFoundError('Coupon batch not found');
    return updated;
  }

  async createBatch(data: CreateCouponBatchDTO): Promise<CouponBatch> {
    const redeemBaseUrl = resolveRedeemBaseUrl(data.redeem_base_url);
    return db.transaction(async (client) => {
      const batch_code = await this.batchDAO.allocateBatchCode(client);
      return this.batchDAO.create(
        {
          ...data,
          batch_code,
          redeem_base_url: redeemBaseUrl || undefined,
        },
        client
      );
    });
  }

  async getBatchById(batchId: string) {
    const batch = await this.batchDAO.findById(batchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');
    const stats = await this.batchDAO.getStats(batchId);
    return { batch, stats };
  }

  async getAllBatches(page = 1, limit = 50) {
    return this.batchDAO.findAll(page, limit);
  }

  async generateCodes(batchId: string): Promise<{ generated: number; batch: CouponBatch }> {
    const batch = await this.batchDAO.findById(batchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');
    if (batch.status === 'archived') {
      throw new BadRequestError('Cannot generate codes for archived batch');
    }

    const existingCount = await this.couponDAO.countByBatchId(batchId);
    if (existingCount >= batch.total_count) {
      await this.batchDAO.updateStatus(batchId, 'ready', existingCount);
      throw new BadRequestError('Batch already fully generated');
    }

    try {
      while (true) {
        const chunk = await db.transaction(async (client) => {
          const locked = await this.batchDAO.findByIdForUpdate(batchId, client);
          if (!locked) throw new NotFoundError('Coupon batch not found');
          if (locked.status === 'archived') {
            throw new BadRequestError('Cannot generate codes for archived batch');
          }

          const currentCount = await this.couponDAO.countByBatchId(batchId, client);
          if (currentCount >= locked.total_count) {
            const updated = await this.batchDAO.updateStatus(
              batchId,
              'ready',
              currentCount,
              client
            );
            return { complete: true as const, count: currentCount, batch: updated! };
          }

          const remaining = locked.total_count - currentCount;
          const chunkSize = Math.min(COUPON_CODE_GENERATION_CHUNK_SIZE, remaining);
          const maxSequence = await this.couponDAO.maxBatchSequence(batchId, client);
          const { insertedCount, couponIds } = await this.insertCodeChunk(
            batchId,
            locked,
            chunkSize,
            maxSequence,
            client
          );

          if (couponIds.length > 0) {
            await this.historyDAO.bulkInsert(
              couponIds.map((couponId) => ({
                coupon_id: couponId,
                from_status: null,
                to_status: 'created' as const,
                reason: 'batch generation',
              })),
              client
            );
          }

          const newCount = currentCount + insertedCount;
          const nextStatus = newCount >= locked.total_count ? 'ready' : 'generating';
          const updated = await this.batchDAO.updateStatus(
            batchId,
            nextStatus,
            newCount,
            client
          );

          return {
            complete: newCount >= locked.total_count,
            count: newCount,
            batch: updated!,
          };
        });

        if (chunk.complete) {
          return { generated: chunk.count, batch: chunk.batch };
        }
      }
    } catch (error) {
      await this.revertBatchToDraft(batchId);
      throw error;
    }
  }

  private async insertCodeChunk(
    batchId: string,
    batch: CouponBatch,
    chunkSize: number,
    maxSequence: number,
    client: PoolClient
  ): Promise<{ insertedCount: number; couponIds: string[] }> {
    for (let attempt = 0; attempt < ZERO_INSERT_MAX_ATTEMPTS; attempt++) {
      const codes = generateCouponCodeChunk(chunkSize);
      // Start after max existing sequence so rare ON CONFLICT skips never reuse numbers.
      const result = await this.couponDAO.bulkInsert(
        codes.map((code, index) => {
          const batch_sequence = maxSequence + index + 1;
          return {
            code,
            coupon_batch_id: batchId,
            face_value_paise: batch.face_value_paise,
            expires_at: batch.expires_at,
            batch_sequence,
            serial_number: formatCouponSerial(batch.batch_code, batch_sequence),
          };
        }),
        client
      );

      if (result.insertedCount > 0) {
        return result;
      }
    }

    throw new BadRequestError(
      'Failed to insert coupon codes after multiple attempts (code collision)'
    );
  }

  private async revertBatchToDraft(batchId: string): Promise<void> {
    try {
      const count = await this.couponDAO.countByBatchId(batchId);
      await this.batchDAO.updateStatus(batchId, 'draft', count);
    } catch {
      // Best-effort — original error is more important to the caller.
    }
  }

  async markBatchPrinted(batchId: string, userId?: string) {
    return db.transaction(async (client) => {
      const batch = await this.batchDAO.findById(batchId, client);
      if (!batch) throw new NotFoundError('Coupon batch not found');
      this.assertBatchNotLocked(batch);

      const result = await client.query(
        `SELECT * FROM coupons WHERE coupon_batch_id = $1 AND status = 'created' FOR UPDATE`,
        [batchId]
      );

      for (const coupon of result.rows) {
        await this.stateMachine.transition(
          coupon,
          'printed',
          { changedBy: userId, reason: 'batch marked printed' },
          client
        );
      }

      return { updated: result.rows.length };
    });
  }

  async markBatchAllotted(
    batchId: string,
    userId?: string,
    selection: MarkBatchAllottedSelection = {}
  ): Promise<MarkBatchAllottedResult> {
    return db.transaction(async (client) => {
      const batch = await this.batchDAO.findById(batchId, client);
      if (!batch) throw new NotFoundError('Coupon batch not found');
      this.assertBatchNotLocked(batch);

      let result: { rows: Array<{ batch_sequence: number; serial_number: string; [key: string]: unknown }> };

      if (!selection.mode) {
        result = await client.query(
          `SELECT * FROM coupons
           WHERE coupon_batch_id = $1 AND status = 'printed'
           ORDER BY batch_sequence ASC
           FOR UPDATE`,
          [batchId]
        );
      } else if (selection.mode === 'next_available') {
        result = await client.query(
          `SELECT * FROM coupons
           WHERE coupon_batch_id = $1 AND status = 'printed'
           ORDER BY batch_sequence ASC
           LIMIT $2
           FOR UPDATE`,
          [batchId, selection.count]
        );
      } else {
        const fromSeq = parseCouponSerialSequence(selection.from_serial, batch.batch_code);
        const toSeq = parseCouponSerialSequence(selection.to_serial, batch.batch_code);
        if (fromSeq == null || toSeq == null) {
          throw new ValidationError(
            `Serial numbers must belong to this batch (${batch.batch_code}-NNNNNN)`
          );
        }
        if (fromSeq > toSeq) {
          throw new ValidationError('from_serial must be less than or equal to to_serial');
        }

        result = await client.query(
          `SELECT * FROM coupons
           WHERE coupon_batch_id = $1
             AND status = 'printed'
             AND batch_sequence BETWEEN $2 AND $3
           ORDER BY batch_sequence ASC
           FOR UPDATE`,
          [batchId, fromSeq, toSeq]
        );
      }

      if (result.rows.length === 0) {
        throw new BadRequestError(
          selection.mode
            ? 'No printed coupons matched the selection to allot'
            : 'No printed coupons available to allot'
        );
      }

      for (const coupon of result.rows) {
        await this.stateMachine.transition(
          coupon as any,
          'allotted',
          { changedBy: userId, reason: 'batch marked allotted' },
          client
        );
      }

      const first = result.rows[0];
      const last = result.rows[result.rows.length - 1];
      return {
        updated: result.rows.length,
        from_serial: first.serial_number ?? null,
        to_serial: last.serial_number ?? null,
        from_sequence: first.batch_sequence ?? null,
        to_sequence: last.batch_sequence ?? null,
      };
    });
  }

  async archiveBatch(batchId: string) {
    const batch = await this.batchDAO.findById(batchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');
    return this.batchDAO.updateStatus(batchId, 'archived');
  }

  async voidBatch(batchId: string, userId?: string) {
    return db.transaction(async (client) => {
      const batch = await this.batchDAO.findById(batchId, client);
      if (!batch) throw new NotFoundError('Coupon batch not found');
      this.assertBatchNotLocked(batch);

      const coupons = await db.query<{ coupon_id: string; status: string }>(
        `SELECT coupon_id, status FROM coupons
         WHERE coupon_batch_id = $1 AND status NOT IN ('redeemed', 'void', 'expired')`,
        [batchId]
      );

      await this.couponDAO.voidByBatch(batchId, client);

      await this.historyDAO.bulkInsert(
        coupons.rows.map((c) => ({
          coupon_id: c.coupon_id,
          from_status: c.status as any,
          to_status: 'void' as const,
          changed_by: userId ?? null,
          reason: 'batch voided',
        })),
        client
      );

      return { voided: coupons.rowCount ?? 0 };
    });
  }

  async deleteBatch(batchId: string) {
    return db.transaction(async (client) => {
      const batch = await this.batchDAO.findByIdForUpdate(batchId, client);
      if (!batch) throw new NotFoundError('Coupon batch not found');
      this.assertBatchNotLocked(batch);

      const redemptionCount = await this.batchDAO.countRedemptions(batchId, client);
      if (redemptionCount > 0) {
        throw new BadRequestError(
          `Cannot delete batch with ${redemptionCount} redemption(s). Archive instead.`
        );
      }

      // Allow delete only while inventory is still pre-print (no coupons, or all `created`).
      const nonCreatedCount = await this.couponDAO.countNonCreatedByBatchId(batchId, client);
      if (nonCreatedCount > 0) {
        throw new BadRequestError(
          'Cannot delete batch: one or more coupons are printed, allotted, redeemed, expired, or void. Archive instead.'
        );
      }

      const deleted = await this.batchDAO.delete(batchId, client);
      if (!deleted) throw new NotFoundError('Coupon batch not found');

      // Day series counter is intentionally not decremented (no reuse).
      return { coupon_batch_id: batchId, batch_code: batch.batch_code, deleted: true };
    });
  }
}

export const couponBatchService = new CouponBatchService();
