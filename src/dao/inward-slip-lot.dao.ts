import { db } from '../database/connection';
import { InwardSlipLot, CreateInwardSlipLotDTO, UpdateInwardSlipLotDTO } from '../models/inward-slip-lot.model';
import { logger } from '../utils/logger';

export class InwardSlipLotDAO {
  async findAll(saudaId?: string): Promise<InwardSlipLot[]> {
    let query = `
      SELECT id, sauda_id, lot_number, item_name, no_of_bags, bag_weight, total_weight,
             bill_weight, received_weight, bardana, rate, amount, created_at, updated_at, created_by, updated_by
      FROM inward_slip_lots
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (saudaId) {
      query += ` AND sauda_id = $${paramCount++}`;
      params.push(saudaId);
    }

    query += ` ORDER BY lot_number ASC`;

    const result = await db.query<InwardSlipLot>(query, params);
    return result.rows;
  }

  async findBySaudaId(saudaId: string): Promise<InwardSlipLot[]> {
    return this.findAll(saudaId);
  }

  async findById(id: string): Promise<InwardSlipLot | null> {
    const query = `
      SELECT id, sauda_id, lot_number, item_name, no_of_bags, bag_weight, total_weight,
             bill_weight, received_weight, bardana, rate, amount, created_at, updated_at, created_by, updated_by
      FROM inward_slip_lots
      WHERE id = $1
    `;
    const result = await db.query<InwardSlipLot>(query, [id]);
    return result.rows[0] || null;
  }

  async create(inwardSlipLotData: CreateInwardSlipLotDTO): Promise<InwardSlipLot> {
    const query = `
      INSERT INTO inward_slip_lots (sauda_id, lot_number, item_name, no_of_bags, bag_weight,
                                   bill_weight, received_weight, bardana, rate, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, sauda_id, lot_number, item_name, no_of_bags, bag_weight, total_weight,
                bill_weight, received_weight, bardana, rate, amount, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      inwardSlipLotData.sauda_id,
      inwardSlipLotData.lot_number,
      inwardSlipLotData.item_name,
      inwardSlipLotData.no_of_bags,
      inwardSlipLotData.bag_weight || null,
      inwardSlipLotData.bill_weight,
      inwardSlipLotData.received_weight,
      inwardSlipLotData.bardana || null,
      inwardSlipLotData.rate,
      inwardSlipLotData.created_by || null,
    ];

    try {
      const result = await db.query<InwardSlipLot>(query, values);
      logger.info('Inward slip lot created', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating inward slip lot', { error, inwardSlipLotData });
      throw error;
    }
  }

  async createMany(lots: CreateInwardSlipLotDTO[]): Promise<InwardSlipLot[]> {
    if (lots.length === 0) {
      return [];
    }

    const createdLots: InwardSlipLot[] = [];
    for (const lot of lots) {
      const created = await this.create(lot);
      createdLots.push(created);
    }
    return createdLots;
  }

  async update(id: string, inwardSlipLotData: UpdateInwardSlipLotDTO): Promise<InwardSlipLot | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (inwardSlipLotData.lot_number !== undefined) {
      fields.push(`lot_number = $${paramCount++}`);
      values.push(inwardSlipLotData.lot_number);
    }
    if (inwardSlipLotData.item_name !== undefined) {
      fields.push(`item_name = $${paramCount++}`);
      values.push(inwardSlipLotData.item_name);
    }
    if (inwardSlipLotData.no_of_bags !== undefined) {
      fields.push(`no_of_bags = $${paramCount++}`);
      values.push(inwardSlipLotData.no_of_bags);
    }
    if (inwardSlipLotData.bag_weight !== undefined) {
      fields.push(`bag_weight = $${paramCount++}`);
      values.push(inwardSlipLotData.bag_weight || null);
    }
    if (inwardSlipLotData.bill_weight !== undefined) {
      fields.push(`bill_weight = $${paramCount++}`);
      values.push(inwardSlipLotData.bill_weight);
    }
    if (inwardSlipLotData.received_weight !== undefined) {
      fields.push(`received_weight = $${paramCount++}`);
      values.push(inwardSlipLotData.received_weight);
    }
    if (inwardSlipLotData.bardana !== undefined) {
      fields.push(`bardana = $${paramCount++}`);
      values.push(inwardSlipLotData.bardana || null);
    }
    if (inwardSlipLotData.rate !== undefined) {
      fields.push(`rate = $${paramCount++}`);
      values.push(inwardSlipLotData.rate);
    }
    if (inwardSlipLotData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(inwardSlipLotData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE inward_slip_lots
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, sauda_id, lot_number, item_name, no_of_bags, bag_weight, total_weight,
                bill_weight, received_weight, bardana, rate, amount, created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<InwardSlipLot>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Inward slip lot updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating inward slip lot', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM inward_slip_lots WHERE id = $1`;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Inward slip lot deleted', { id });
    }
    return deleted;
  }
}

export const inwardSlipLotDAO = new InwardSlipLotDAO();
