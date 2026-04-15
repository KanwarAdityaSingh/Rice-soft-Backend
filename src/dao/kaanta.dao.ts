import { db } from '../database/connection';
import { Kaanta, CreateKaantaDTO, UpdateKaantaDTO } from '../models/kaanta.model';
import { logger } from '../utils/logger';
import { saudaDAO } from './sauda.dao';
import { inwardSlipPassDAO } from './inward-slip-pass.dao';
import { CreateInwardSlipLotDTO } from '../models/inward-slip-lot.model';

export class KaantaDAO {
  async findAll(saudaId?: string, ispId?: string, godownId?: string): Promise<Kaanta[]> {
    let query = `
      SELECT id, kaanta_id, godown_id, sauda_id, inward_slip_pass_id, full_truck_weight, 
             empty_truck_weight, kaanta_weight, said_sent_weight, bag_weight, no_of_bags, bag_type,
             khaali_kaanta_parchi_url, bhara_kaanta_parchi_url,
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
             khaali_kaanta_parchi_url, bhara_kaanta_parchi_url,
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
                            empty_truck_weight, said_sent_weight, bag_weight, no_of_bags, bag_type, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, kaanta_id, godown_id, sauda_id, inward_slip_pass_id, full_truck_weight, 
                  empty_truck_weight, kaanta_weight, said_sent_weight, bag_weight, no_of_bags, bag_type,
                  khaali_kaanta_parchi_url, bhara_kaanta_parchi_url,
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
      const lotData: CreateInwardSlipLotDTO = {
        sauda_id: createdKaanta.sauda_id,
        godown_id: createdKaanta.godown_id,
        lot_number: `LOT-${createdKaanta.kaanta_id}`,
        rice_code_id: sauda.rice_code_id || undefined,
        rice_type: sauda.rice_type,
        no_of_bags: createdKaanta.no_of_bags,
        bag_weight: createdKaanta.bag_weight,
        bill_weight: sauda.quantity || 0, // Expected weight from sauda
        received_weight: createdKaanta.kaanta_weight || 0, // Actual weight from kaanta
        rate: sauda.rate,
        inward_slip_pass_created_at: isp.created_at,
        created_by: createdKaanta.created_by || undefined,
      };

      // Create lot using the existing DAO method (within same transaction)
      const lotQuery = `
        INSERT INTO inward_slip_lots (sauda_id, godown_id, lot_number, rice_code_id, rice_type, 
                                     no_of_bags, bag_weight, bill_weight, received_weight, 
                                     rate, inward_slip_pass_created_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, sauda_id, godown_id, lot_number, rice_code_id, rice_type, no_of_bags, 
                  bag_weight, total_weight, bill_weight, received_weight, rate, amount, 
                  inward_slip_pass_created_at, created_at, updated_at, created_by, updated_by
      `;
      
      const lotValues = [
        lotData.sauda_id,
        lotData.godown_id,
        lotData.lot_number,
        lotData.rice_code_id || null,
        lotData.rice_type || null,
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
                khaali_kaanta_parchi_url, bhara_kaanta_parchi_url,
                created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<Kaanta>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      
      const updatedKaanta = result.rows[0];
      logger.info('Kaanta updated', { id, kaanta_weight: updatedKaanta.kaanta_weight });
      
      // Recalculate sauda's received_until_now and completion_percentage
      // Always recalculate since kaanta_weight is auto-calculated by trigger and may have changed
      await saudaDAO.recalculateReceivedWeight(updatedKaanta.sauda_id);
      
      return updatedKaanta;
    } catch (error) {
      logger.error('Error updating kaanta', { error, id });
      throw error;
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

