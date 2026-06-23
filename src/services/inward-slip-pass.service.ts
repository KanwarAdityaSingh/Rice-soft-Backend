import type { PoolClient } from 'pg';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';

/** Matches auto-generated slips (ISP-001, ISP-002, …); same pattern as delete guard. */
function parseIspSequence(slipNumber: string): number | null {
  const m = slipNumber.match(/^ISP-(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

type KaantaRow = {
  id: string;
  sauda_id: string;
  kaanta_id: string;
  godown_id: string;
  bag_type: string;
  bag_weight: string | number;
  no_of_bags: number;
};

/**
 * Deletes an inward slip pass (ISP) while keeping linked saudas.
 * Removes kaanta-linked lots, reconciles bags inventory, deletes kaantas,
 * updates sauda aggregates, then deletes the ISP row.
 */
export class InwardSlipPassService {
  /**
   * For slips ISP-002 and above: kaanta on ISP-N may only be created/updated if at least one
   * kaanta already exists on ISP-(N-1) (any sauda — different ISPs can link to different saudas).
   * Non-ISP slip numbers are ignored.
   */
  async assertPriorKaantaExistsForSequentialIsp(slipNumber: string | null | undefined): Promise<void> {
    if (!slipNumber) return;
    const seq = parseIspSequence(slipNumber);
    if (seq === null || seq <= 1) return;

    const priorSeq = seq - 1;
    const priorLabel = `ISP-${String(priorSeq).padStart(3, '0')}`;

    const r = await db.query<{ ok: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM kaantas k
         INNER JOIN inward_slip_passes isp ON isp.id = k.inward_slip_pass_id
         WHERE (regexp_match(isp.slip_number, '^ISP-(\\d+)$', 'i'))[1]::int = $1
       ) AS ok`,
      [priorSeq]
    );
    if (!r.rows[0]?.ok) {
      throw new ValidationError(
        `Cannot add or update kaanta for ${slipNumber} until kaanta exists for ${priorLabel}.`
      );
    }
  }

  async deleteById(inwardSlipPassId: string): Promise<void> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const ispRes = await client.query<{ id: string }>(
        `SELECT id FROM inward_slip_passes WHERE id = $1 FOR UPDATE`,
        [inwardSlipPassId]
      );
      if (ispRes.rows.length === 0) {
        throw new NotFoundError('Inward slip pass not found');
      }

      await this.assertNoHigherNumberedSlipExists(client, inwardSlipPassId);

      const kaantasRes = await client.query<KaantaRow>(
        `SELECT id, sauda_id, kaanta_id, godown_id, bag_type, bag_weight, no_of_bags
         FROM kaantas WHERE inward_slip_pass_id = $1`,
        [inwardSlipPassId]
      );
      const kaantas = kaantasRes.rows;

      const junctionRes = await client.query<{ sauda_id: string }>(
        `SELECT sauda_id FROM inward_slip_pass_saudas WHERE inward_slip_pass_id = $1`,
        [inwardSlipPassId]
      );

      const affectedSaudaIds = new Set<string>();
      for (const k of kaantas) {
        affectedSaudaIds.add(k.sauda_id);
      }
      for (const r of junctionRes.rows) {
        affectedSaudaIds.add(r.sauda_id);
      }

      let lotIds: string[] = [];
      if (kaantas.length > 0) {
        const lotsRes = await client.query<{ id: string }>(
          `SELECT l.id
           FROM inward_slip_lots l
           INNER JOIN kaantas k
             ON k.sauda_id = l.sauda_id AND l.lot_number = 'LOT-' || k.kaanta_id
           WHERE k.inward_slip_pass_id = $1`,
          [inwardSlipPassId]
        );
        lotIds = lotsRes.rows.map((r) => r.id);
      }

      if (lotIds.length > 0) {
        const batchUsage = await client.query(
          `SELECT lot_id FROM batch_lot_usage WHERE lot_id = ANY($1::uuid[]) LIMIT 1`,
          [lotIds]
        );
        if (batchUsage.rows.length > 0) {
          throw new ConflictError(
            'Cannot delete inward slip pass: one or more kaanta-linked lots are referenced in production (batch).'
          );
        }

        const hasPurchaseLots = await this.tableExists(client, 'purchase_lots');
        if (hasPurchaseLots) {
          const purchaseLots = await client.query(
            `SELECT lot_id FROM purchase_lots WHERE lot_id = ANY($1::uuid[]) LIMIT 1`,
            [lotIds]
          );
          if (purchaseLots.rows.length > 0) {
            throw new ConflictError(
              'Cannot delete inward slip pass: one or more kaanta-linked lots are linked to a purchase record.'
            );
          }
        }
      }

      const hasPurchaseIspJunction = await this.tableExists(client, 'purchase_inward_slip_passes');
      if (hasPurchaseIspJunction) {
        await client.query(`DELETE FROM purchase_inward_slip_passes WHERE inward_slip_pass_id = $1`, [
          inwardSlipPassId,
        ]);
      }

      if (lotIds.length > 0) {
        await client.query(`DELETE FROM inward_slip_lots WHERE id = ANY($1::uuid[])`, [lotIds]);
      }

      for (const k of kaantas) {
        const bagWeight = typeof k.bag_weight === 'string' ? parseFloat(k.bag_weight) : Number(k.bag_weight);
        const bags = await client.query(
          `UPDATE bags_inventory
           SET filled_bags = filled_bags - $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE godown_id = $1 AND bag_type = $2 AND bag_capacity = $3
             AND filled_bags >= $4
           RETURNING id`,
          [k.godown_id, k.bag_type, bagWeight, k.no_of_bags]
        );
        if ((bags.rowCount ?? 0) === 0) {
          throw new ConflictError(
            'Cannot delete inward slip pass: bags inventory could not be reconciled (missing row or insufficient filled bags).'
          );
        }
      }

      await client.query(`DELETE FROM kaantas WHERE inward_slip_pass_id = $1`, [inwardSlipPassId]);

      for (const saudaId of affectedSaudaIds) {
        await client.query(
          `UPDATE saudas
           SET received_until_now = COALESCE((
             SELECT SUM(COALESCE(kaanta_weight, 0))
             FROM kaantas
             WHERE sauda_id = $1
           ), 0)
           WHERE id = $1`,
          [saudaId]
        );
      }

      await client.query(`DELETE FROM inward_slip_passes WHERE id = $1`, [inwardSlipPassId]);

      await client.query('COMMIT');
      logger.info('Inward slip pass deleted with downstream cleanup', {
        inwardSlipPassId,
        kaantasRemoved: kaantas.length,
        lotsRemoved: lotIds.length,
        saudasTouched: affectedSaudaIds.size,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sequential slip rule: ISP-003 may be deleted only if no ISP-004 (or higher) exists.
   * Applies only when slip_number matches /^ISP-\d+$/i (auto-generated style).
   */
  private async assertNoHigherNumberedSlipExists(
    client: PoolClient,
    inwardSlipPassId: string
  ): Promise<void> {
    const r = await client.query<{ example: string | null }>(
      `WITH target AS (
         SELECT id,
                (regexp_match(slip_number, '^ISP-(\\d+)$', 'i'))[1]::int AS seq
         FROM inward_slip_passes
         WHERE id = $1
       )
       SELECT isp.slip_number AS example
       FROM inward_slip_passes isp
       CROSS JOIN target t
       WHERE isp.id <> t.id
         AND t.seq IS NOT NULL
         AND (regexp_match(isp.slip_number, '^ISP-(\\d+)$', 'i'))[1]::int > t.seq
       ORDER BY (regexp_match(isp.slip_number, '^ISP-(\\d+)$', 'i'))[1]::int ASC
       LIMIT 1`,
      [inwardSlipPassId]
    );
    if (r.rows.length > 0 && r.rows[0].example) {
      throw new ConflictError(
        `Cannot delete this inward slip pass: a higher-numbered slip still exists (${r.rows[0].example}). Delete newer slips first.`
      );
    }
  }

  private async tableExists(client: PoolClient, tableName: string): Promise<boolean> {
    const r = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists`,
      [tableName]
    );
    return Boolean(r.rows[0]?.exists);
  }
}

export const inwardSlipPassService = new InwardSlipPassService();
