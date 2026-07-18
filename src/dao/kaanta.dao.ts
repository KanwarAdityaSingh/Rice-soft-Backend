import type { PoolClient } from 'pg';
import { db } from '../database/connection';
import { Kaanta, CreateKaantaDTO, UpdateKaantaDTO, type BagType } from '../models/kaanta.model';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/errors';
import { resolveLotRiceFromSauda } from '../utils/lot-rice-from-sauda';
import { saudaDAO } from './sauda.dao';
import { inwardSlipPassDAO } from './inward-slip-pass.dao';
import { CreateInwardSlipLotDTO } from '../models/inward-slip-lot.model';

function toNumber(value: unknown): number {
  return parseFloat(String(value ?? 0));
}

/**
 * Apply a delta to filled_bags for one (godown, bag_type, bag_capacity) bucket.
 *
 * Uses UPDATE-first so a negative delta never hits INSERT (which would create a "new row" with
 * negative filled_bags and fail `bags_inventory_filled_bags_check` before ON CONFLICT UPDATE runs).
 */
async function applyBagsFilledDelta(
  client: PoolClient,
  godownId: string,
  bagType: BagType,
  bagCapacity: number,
  filledDelta: number,
  updatedBy: string | null
): Promise<void> {
  if (filledDelta === 0) {
    return;
  }

  const updated = await client.query(
    `
    UPDATE bags_inventory SET
      filled_bags = filled_bags + $1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = COALESCE($5, updated_by)
    WHERE godown_id = $2 AND bag_type = $3 AND bag_capacity = $4
      AND ($1 >= 0 OR filled_bags + $1 >= 0)
    `,
    [filledDelta, godownId, bagType, bagCapacity, updatedBy]
  );

  if ((updated.rowCount ?? 0) > 0) {
    return;
  }

  if (filledDelta < 0) {
    throw new BadRequestError(
      `Cannot change kaanta bags: would remove ${Math.abs(filledDelta)} filled bag(s) from inventory ` +
        `for godown ${godownId}, type ${bagType}, capacity ${bagCapacity} kg, but not enough (or no) ` +
        `filled bags are recorded in bags_inventory. Reduce counts only as far as inventory allows, ` +
        `or fix bags_inventory if it is out of sync.`
    );
  }

  await client.query(
    `
    INSERT INTO bags_inventory (godown_id, bag_type, bag_capacity, filled_bags, empty_bags, created_by, updated_by)
    VALUES ($1, $2, $3, $4, 0, $5, $5)
    ON CONFLICT (godown_id, bag_type, bag_capacity)
    DO UPDATE SET
      filled_bags = bags_inventory.filled_bags + EXCLUDED.filled_bags,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = COALESCE(EXCLUDED.updated_by, bags_inventory.updated_by)
    `,
    [godownId, bagType, bagCapacity, filledDelta, updatedBy]
  );
}

/**
 * Same net effect as create: undo what this kaanta’s prior row added to bags_inventory, then add the
 * updated row’s bag count (two steps even when bag_type/capacity unchanged — equivalent to one delta).
 */
async function reconcileBagsInventoryOnKaantaEdit(
  client: PoolClient,
  previous: Kaanta,
  updated: Kaanta,
  updatedBy: string | null
): Promise<void> {
  const godownId = updated.godown_id;
  await applyBagsFilledDelta(
    client,
    godownId,
    previous.bag_type,
    toNumber(previous.bag_weight),
    -previous.no_of_bags,
    updatedBy
  );
  await applyBagsFilledDelta(
    client,
    godownId,
    updated.bag_type,
    toNumber(updated.bag_weight),
    updated.no_of_bags,
    updatedBy
  );
}

/** Keeps `LOT-{kaanta_id}` inward slip lot and lot_inventory aligned with kaanta + current sauda (same as create). */
async function syncKaantaLinkedLotAndInventory(
  client: PoolClient,
  updated: Kaanta,
  saudaRow: {
    quantity: unknown;
    rate: unknown;
    rice_category: string;
    rice_code_id: string | null;
    rice_type: string;
    rice_length_id: string | null;
  },
  updatedBy: string | null
): Promise<void> {
  const lotNumber = `LOT-${updated.kaanta_id}`;
  const lotRes = await client.query<{ id: string; received_weight: string }>(
    `SELECT id, received_weight FROM inward_slip_lots WHERE sauda_id = $1 AND lot_number = $2 FOR UPDATE`,
    [updated.sauda_id, lotNumber]
  );
  if (lotRes.rows.length === 0) {
    logger.warn('Kaanta updated but no kaanta-linked inward_slip_lots row', {
      sauda_id: updated.sauda_id,
      lotNumber,
    });
    return;
  }

  const lotId = lotRes.rows[0].id;
  const oldReceived = toNumber(lotRes.rows[0].received_weight);
  const newReceived = toNumber(updated.kaanta_weight);
  const billWeight = toNumber(saudaRow.quantity);
  const rate = toNumber(saudaRow.rate);
  const weightDelta = newReceived - oldReceived;

  await client.query(
    `
    UPDATE inward_slip_lots SET
      no_of_bags = $1,
      bag_weight = $2,
      bill_weight = $3,
      received_weight = $4,
      rate = $5,
      rice_category = $6,
      rice_code_id = $7,
      rice_type = $8,
      rice_length_id = $9,
      godown_id = $10,
      updated_by = $11,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $12
    `,
    [
      updated.no_of_bags,
      updated.bag_weight,
      billWeight,
      newReceived,
      rate,
      saudaRow.rice_category,
      saudaRow.rice_code_id,
      saudaRow.rice_type,
      saudaRow.rice_length_id,
      updated.godown_id,
      updatedBy,
      lotId,
    ]
  );

  const liRes = await client.query<{ id: string; available_quantity: string }>(
    `SELECT id, available_quantity FROM lot_inventory WHERE lot_id = $1 FOR UPDATE`,
    [lotId]
  );

  if (liRes.rows.length === 0) {
    await client.query(
      `
      INSERT INTO lot_inventory (lot_id, godown_id, available_quantity, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $4)
      `,
      [lotId, updated.godown_id, newReceived, updatedBy]
    );
    return;
  }

  const liId = liRes.rows[0].id;
  const quantityBefore = toNumber(liRes.rows[0].available_quantity);
  // Re-state receipt like create, but keep kg already consumed by production: same as
  // new_received - (old_received - available) === available + (new_received - old_received).
  const rawUsedKg = oldReceived - quantityBefore;
  const usedFromLotKg = Math.max(0, Math.min(oldReceived, rawUsedKg));
  const quantityAfter = newReceived - usedFromLotKg;
  if (quantityAfter < -0.0001) {
    throw new BadRequestError(
      `Cannot update kaanta: linked lot stock would become negative (${quantityAfter.toFixed(3)} kg). ` +
        'Reduce batch usage or correct weighments in smaller steps.'
    );
  }

  await client.query(
    `
    UPDATE lot_inventory SET
      available_quantity = $1,
      godown_id = $2,
      updated_by = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    `,
    [quantityAfter, updated.godown_id, updatedBy, liId]
  );

  if (Math.abs(weightDelta) > 0.0001) {
    await client.query(
      `
      INSERT INTO lot_inventory_audit (
        lot_inventory_id, lot_id, operation_type, quantity_change,
        quantity_before, quantity_after, reason, reference_type,
        reference_id, batch_id, batch_number, notes, created_by
      )
      VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, 'kaanta', $7, NULL, NULL, $8, $9)
      `,
      [
        liId,
        lotId,
        weightDelta,
        quantityBefore,
        quantityAfter,
        'Kaanta update: lot receipt re-stated; consumed quantity preserved',
        updated.id,
        `Lot ${lotNumber} | received ${oldReceived} → ${newReceived} kg, available ${quantityBefore.toFixed(3)} → ${quantityAfter.toFixed(3)} kg (used from lot ${usedFromLotKg.toFixed(3)} kg)`,
        updatedBy,
      ]
    );
  }
}

export class KaantaDAO {
  async findAll(saudaId?: string, ispId?: string, godownId?: string): Promise<Kaanta[]> {
    let query = `
      SELECT id, kaanta_id, godown_id, sauda_id, inward_slip_pass_id, full_truck_weight, 
             empty_truck_weight, kaanta_weight, said_sent_weight, bag_weight, no_of_bags, bag_type,
             khaali_kaanta_parchi_url, bhara_kaanta_parchi_url, combined_kaanta_parchi_url,
             ticket_number, parchi_vehicle_number, vehicle_number_mismatch,
             created_at, updated_at, created_by, updated_by
      FROM kaantas
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (saudaId) {
      query += ` AND sauda_id = $${paramCount++}`;
      params.push(saudaId);
    }

    if (ispId) {
      query += ` AND inward_slip_pass_id = $${paramCount++}`;
      params.push(ispId);
    }
    if (godownId) {
      query += ` AND godown_id = $${paramCount++}`;
      params.push(godownId);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query<Kaanta>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Kaanta | null> {
    const query = `
      SELECT id, kaanta_id, godown_id, sauda_id, inward_slip_pass_id, full_truck_weight, 
             empty_truck_weight, kaanta_weight, said_sent_weight, bag_weight, no_of_bags, bag_type,
             khaali_kaanta_parchi_url, bhara_kaanta_parchi_url, combined_kaanta_parchi_url,
             ticket_number, parchi_vehicle_number, vehicle_number_mismatch,
             created_at, updated_at, created_by, updated_by
      FROM kaantas
      WHERE id = $1
    `;
    const result = await db.query<Kaanta>(query, [id]);
    return result.rows[0] || null;
  }

  async create(kaantaData: CreateKaantaDTO): Promise<Kaanta> {
    // Start a transaction for atomic operations
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Validate sauda exists
      const sauda = await saudaDAO.findById(kaantaData.sauda_id);
      if (!sauda) {
        throw new Error('Sauda not found');
      }

      // Validate inward slip pass exists
      const isp = await inwardSlipPassDAO.findById(kaantaData.inward_slip_pass_id);
      if (!isp) {
        throw new Error('Inward slip pass not found');
      }
      if (kaantaData.godown_id !== isp.godown_id) {
        throw new Error('Kaanta godown must match inward slip pass godown');
      }

      // Insert kaanta (triggers will calculate kaanta_weight and generate kaanta_id)
      const kaantaQuery = `
        INSERT INTO kaantas (godown_id, sauda_id, inward_slip_pass_id, full_truck_weight, 
                            empty_truck_weight, said_sent_weight, bag_weight, no_of_bags, bag_type,
                            ticket_number, parchi_vehicle_number, vehicle_number_mismatch, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, kaanta_id, godown_id, sauda_id, inward_slip_pass_id, full_truck_weight, 
                  empty_truck_weight, kaanta_weight, said_sent_weight, bag_weight, no_of_bags, bag_type,
                  khaali_kaanta_parchi_url, bhara_kaanta_parchi_url, combined_kaanta_parchi_url,
                  ticket_number, parchi_vehicle_number, vehicle_number_mismatch,
                  created_at, updated_at, created_by, updated_by
      `;
      
      const kaantaValues = [
        kaantaData.godown_id,
        kaantaData.sauda_id,
        kaantaData.inward_slip_pass_id,
        kaantaData.full_truck_weight,
        kaantaData.empty_truck_weight,
        kaantaData.said_sent_weight || null,
        kaantaData.bag_weight,
        kaantaData.no_of_bags,
        kaantaData.bag_type,
        kaantaData.ticket_number?.trim() || null,
        kaantaData.parchi_vehicle_number?.trim() || null,
        kaantaData.vehicle_number_mismatch ?? false,
        kaantaData.created_by || null,
      ];

      const kaantaResult = await client.query<Kaanta>(kaantaQuery, kaantaValues);
      const createdKaanta = kaantaResult.rows[0];

      logger.info('Kaanta created', { 
        id: createdKaanta.id, 
        kaanta_id: createdKaanta.kaanta_id,
        kaanta_weight: createdKaanta.kaanta_weight 
      });

      // Auto-create lot with data from kaanta and sauda
      const riceSnapshot = resolveLotRiceFromSauda(sauda);

      const lotData: CreateInwardSlipLotDTO = {
        sauda_id: createdKaanta.sauda_id,
        godown_id: createdKaanta.godown_id,
        lot_number: `LOT-${createdKaanta.kaanta_id}`,
        ...riceSnapshot,
        no_of_bags: createdKaanta.no_of_bags,
        bag_weight: createdKaanta.bag_weight,
        bill_weight: sauda.quantity || 0,
        received_weight: createdKaanta.kaanta_weight || 0,
        rate: sauda.rate,
        inward_slip_pass_created_at: isp.created_at,
        created_by: createdKaanta.created_by || undefined,
      };

      const lotQuery = `
        INSERT INTO inward_slip_lots (sauda_id, godown_id, lot_number, rice_category, rice_code_id, rice_type, rice_length_id,
                                     no_of_bags, bag_weight, bill_weight, received_weight,
                                     rate, inward_slip_pass_created_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, sauda_id, godown_id, lot_number, rice_category, rice_code_id, rice_type, rice_length_id,
                  no_of_bags, bag_weight, total_weight, bill_weight, received_weight, rate, amount,
                  inward_slip_pass_created_at, created_at, updated_at, created_by, updated_by
      `;

      const lotValues = [
        lotData.sauda_id,
        lotData.godown_id,
        lotData.lot_number,
        lotData.rice_category,
        lotData.rice_code_id,
        lotData.rice_type,
        lotData.rice_length_id,
        lotData.no_of_bags,
        lotData.bag_weight || null,
        lotData.bill_weight,
        lotData.received_weight,
        lotData.rate,
        lotData.inward_slip_pass_created_at ?? null,
        lotData.created_by || null,
      ];

      const lotResult = await client.query(lotQuery, lotValues);
      const createdLot = lotResult.rows[0];

      logger.info('Lot auto-created from kaanta', { 
        lot_id: createdLot.id, 
        lot_number: createdLot.lot_number,
        kaanta_id: createdKaanta.kaanta_id,
        amount: createdLot.amount
      });

      await client.query('COMMIT');
      
      // Recalculate sauda's received_until_now and completion_percentage
      // This must be done AFTER commit so the new kaanta is visible to the query
      await saudaDAO.recalculateReceivedWeight(kaantaData.sauda_id);
      
      return createdKaanta;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating kaanta and lot', { error, kaantaData });
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: string, kaantaData: UpdateKaantaDTO): Promise<Kaanta | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (kaantaData.full_truck_weight !== undefined) {
      fields.push(`full_truck_weight = $${paramCount++}`);
      values.push(kaantaData.full_truck_weight);
    }
    if (kaantaData.empty_truck_weight !== undefined) {
      fields.push(`empty_truck_weight = $${paramCount++}`);
      values.push(kaantaData.empty_truck_weight);
    }
    if (kaantaData.said_sent_weight !== undefined) {
      fields.push(`said_sent_weight = $${paramCount++}`);
      values.push(kaantaData.said_sent_weight || null);
    }
    if (kaantaData.bag_weight !== undefined) {
      fields.push(`bag_weight = $${paramCount++}`);
      values.push(kaantaData.bag_weight);
    }
    if (kaantaData.no_of_bags !== undefined) {
      fields.push(`no_of_bags = $${paramCount++}`);
      values.push(kaantaData.no_of_bags);
    }
    if (kaantaData.bag_type !== undefined) {
      fields.push(`bag_type = $${paramCount++}`);
      values.push(kaantaData.bag_type);
    }
    if (kaantaData.khaali_kaanta_parchi_url !== undefined) {
      fields.push(`khaali_kaanta_parchi_url = $${paramCount++}`);
      values.push(kaantaData.khaali_kaanta_parchi_url);
    }
    if (kaantaData.bhara_kaanta_parchi_url !== undefined) {
      fields.push(`bhara_kaanta_parchi_url = $${paramCount++}`);
      values.push(kaantaData.bhara_kaanta_parchi_url);
    }
    if (kaantaData.combined_kaanta_parchi_url !== undefined) {
      fields.push(`combined_kaanta_parchi_url = $${paramCount++}`);
      values.push(kaantaData.combined_kaanta_parchi_url);
    }
    if (kaantaData.ticket_number !== undefined) {
      fields.push(`ticket_number = $${paramCount++}`);
      values.push(kaantaData.ticket_number?.trim() || null);
    }
    if (kaantaData.parchi_vehicle_number !== undefined) {
      fields.push(`parchi_vehicle_number = $${paramCount++}`);
      values.push(kaantaData.parchi_vehicle_number?.trim() || null);
    }
    if (kaantaData.vehicle_number_mismatch !== undefined) {
      fields.push(`vehicle_number_mismatch = $${paramCount++}`);
      values.push(kaantaData.vehicle_number_mismatch);
    }
    if (kaantaData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(kaantaData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE kaantas
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, kaanta_id, godown_id, sauda_id, inward_slip_pass_id, full_truck_weight, 
                empty_truck_weight, kaanta_weight, said_sent_weight, bag_weight, no_of_bags, bag_type,
                khaali_kaanta_parchi_url, bhara_kaanta_parchi_url, combined_kaanta_parchi_url,
             ticket_number, parchi_vehicle_number, vehicle_number_mismatch,
                created_at, updated_at, created_by, updated_by
    `;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const prevRes = await client.query<Kaanta>(
        `SELECT id, kaanta_id, godown_id, sauda_id, inward_slip_pass_id, full_truck_weight,
                empty_truck_weight, kaanta_weight, said_sent_weight, bag_weight, no_of_bags, bag_type,
                khaali_kaanta_parchi_url, bhara_kaanta_parchi_url, combined_kaanta_parchi_url,
             ticket_number, parchi_vehicle_number, vehicle_number_mismatch,
                created_at, updated_at, created_by, updated_by
         FROM kaantas WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (prevRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const previous = prevRes.rows[0];

      const result = await client.query<Kaanta>(query, values);
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const updatedKaanta = result.rows[0];

      const saudaRes = await client.query<{
        quantity: unknown;
        rate: unknown;
        rice_category: string;
        rice_code_id: string | null;
        rice_type: string;
        rice_length_id: string | null;
      }>(
        `SELECT quantity, rate, rice_category, rice_code_id, rice_type, rice_length_id FROM saudas WHERE id = $1`,
        [updatedKaanta.sauda_id]
      );
      if (saudaRes.rows.length === 0) {
        throw new Error(`Sauda not found for kaanta: ${updatedKaanta.sauda_id}`);
      }

      const syncUserId = (kaantaData.updated_by ?? updatedKaanta.updated_by) || null;

      await syncKaantaLinkedLotAndInventory(client, updatedKaanta, saudaRes.rows[0], syncUserId);
      await reconcileBagsInventoryOnKaantaEdit(client, previous, updatedKaanta, syncUserId);

      await client.query('COMMIT');

      logger.info('Kaanta updated (linked lot + inventory reconciled)', {
        id,
        kaanta_weight: updatedKaanta.kaanta_weight,
      });

      await saudaDAO.recalculateReceivedWeight(updatedKaanta.sauda_id);
      return updatedKaanta;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore rollback errors (e.g. if BEGIN never completed) */
      }
      logger.error('Error updating kaanta', { error, id });
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<boolean> {
    // Get kaanta details before deletion for logging and recalculation
    const kaanta = await this.findById(id);
    
    if (!kaanta) {
      return false;
    }
    
    const saudaId = kaanta.sauda_id;
    
    const query = `DELETE FROM kaantas WHERE id = $1`;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    
    if (deleted) {
      logger.info('Kaanta deleted (cascade deletes associated lot)', { 
        id, 
        kaanta_id: kaanta.kaanta_id,
        sauda_id: saudaId 
      });
      
      // Recalculate sauda's received_until_now and completion_percentage
      await saudaDAO.recalculateReceivedWeight(saudaId);
    }
    
    return deleted;
  }
}

export const kaantaDAO = new KaantaDAO();

