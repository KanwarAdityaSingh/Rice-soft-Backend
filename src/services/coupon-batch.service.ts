import { db } from '../database/connection';
import { PoolClient } from 'pg';
import { CouponBatchDAO } from '../dao/coupon-batch.dao';
import { CouponDAO } from '../dao/coupon.dao';
import { CouponStatusHistoryDAO } from '../dao/coupon-status-history.dao';
import { CreateCouponBatchDTO, CouponBatch } from '../models/coupon.model';
import { BadRequestError, NotFoundError } from '../utils/errors';
import {
  generateCouponCodeChunk,
  COUPON_CODE_GENERATION_CHUNK_SIZE,
} from './coupon-code.generator';
import { CouponStateMachine } from './coupon-state.machine';
import { resolveRedeemBaseUrl } from '../utils/coupon.helpers';

const ZERO_INSERT_MAX_ATTEMPTS = 3;

export class CouponBatchService {
  constructor(
    private batchDAO = new CouponBatchDAO(),
    private couponDAO = new CouponDAO(),
    private historyDAO = new CouponStatusHistoryDAO(),
    private stateMachine = new CouponStateMachine()
  ) {}

  async createBatch(data: CreateCouponBatchDTO): Promise<CouponBatch> {
    const redeemBaseUrl = resolveRedeemBaseUrl(data.redeem_base_url);
    return this.batchDAO.create({
      ...data,
      redeem_base_url: redeemBaseUrl || undefined,
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
          const { insertedCount, couponIds } = await this.insertCodeChunk(
            batchId,
            locked,
            chunkSize,
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
    client: PoolClient
  ): Promise<{ insertedCount: number; couponIds: string[] }> {
    for (let attempt = 0; attempt < ZERO_INSERT_MAX_ATTEMPTS; attempt++) {
      const codes = generateCouponCodeChunk(chunkSize);
      const result = await this.couponDAO.bulkInsert(
        codes.map((code) => ({
          code,
          coupon_batch_id: batchId,
          face_value_paise: batch.face_value_paise,
          expires_at: batch.expires_at,
        })),
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

  async markBatchAllotted(batchId: string, userId?: string) {
    return db.transaction(async (client) => {
      const batch = await this.batchDAO.findById(batchId, client);
      if (!batch) throw new NotFoundError('Coupon batch not found');

      const result = await client.query(
        `SELECT * FROM coupons WHERE coupon_batch_id = $1 AND status = 'printed' FOR UPDATE`,
        [batchId]
      );

      for (const coupon of result.rows) {
        await this.stateMachine.transition(
          coupon,
          'allotted',
          { changedBy: userId, reason: 'batch marked allotted' },
          client
        );
      }

      return { updated: result.rows.length };
    });
  }

  async archiveBatch(batchId: string) {
    const batch = await this.batchDAO.findById(batchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');
    return this.batchDAO.updateStatus(batchId, 'archived');
  }

  async voidBatch(batchId: string, userId?: string) {
    return db.transaction(async (client) => {
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
      const batch = await this.batchDAO.findById(batchId, client);
      if (!batch) throw new NotFoundError('Coupon batch not found');

      const redemptionCount = await this.batchDAO.countRedemptions(batchId, client);
      if (redemptionCount > 0) {
        throw new BadRequestError(
          `Cannot delete batch with ${redemptionCount} redemption(s). Archive or void instead.`
        );
      }

      const deleted = await this.batchDAO.delete(batchId, client);
      if (!deleted) throw new NotFoundError('Coupon batch not found');

      return { coupon_batch_id: batchId, deleted: true };
    });
  }
}

export const couponBatchService = new CouponBatchService();
