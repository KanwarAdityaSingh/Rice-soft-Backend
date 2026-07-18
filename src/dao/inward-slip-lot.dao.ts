import { db } from '../database/connection';
import { InwardSlipLot, CreateInwardSlipLotDTO, UpdateInwardSlipLotDTO } from '../models/inward-slip-lot.model';
import { logger } from '../utils/logger';

const LOT_COLUMNS = `
  id, sauda_id, godown_id, lot_number, rice_category, rice_code_id, rice_type, rice_length_id,
  no_of_bags, bag_weight, total_weight, bill_weight, received_weight, rate, amount,
  inward_slip_pass_created_at, created_at, updated_at, created_by, updated_by
`;

export class InwardSlipLotDAO {
  async countBySaudaId(saudaId: string): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM inward_slip_lots WHERE sauda_id = $1`,
      [saudaId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async findAll(saudaId?: string, godownId?: string): Promise<InwardSlipLot[]> {
    let query = `
      SELECT ${LOT_COLUMNS}
      FROM inward_slip_lots
      WHERE 1=1
    `;

    const params: unknown[] = [];
    let paramCount = 1;

    if (saudaId) {
      query += ` AND sauda_id = $${paramCount++}`;
      params.push(saudaId);
    }
    if (godownId) {
      query += ` AND godown_id = $${paramCount++}`;
      params.push(godownId);
    }

    query += ` ORDER BY lot_number ASC`;

    const result = await db.query<InwardSlipLot>(query, params);
    return result.rows;
  }

  async findBySaudaId(saudaId: string, godownId?: string): Promise<InwardSlipLot[]> {
    return this.findAll(saudaId, godownId);
  }

  async findById(id: string): Promise<InwardSlipLot | null> {
    const query = `
      SELECT ${LOT_COLUMNS}
      FROM inward_slip_lots
      WHERE id = $1
    `;
    const result = await db.query<InwardSlipLot>(query, [id]);
    return result.rows[0] || null;
  }

  async findByIds(ids: string[]): Promise<InwardSlipLot[]> {
    if (ids.length === 0) {
      return [];
    }
    const query = `
      SELECT ${LOT_COLUMNS}
      FROM inward_slip_lots
      WHERE id = ANY($1::uuid[])
    `;
    const result = await db.query<InwardSlipLot>(query, [ids]);
    return result.rows;
  }

  async findBySaudaIdAndLotNumber(saudaId: string, lotNumber: string): Promise<InwardSlipLot | null> {
    const query = `
      SELECT ${LOT_COLUMNS}
      FROM inward_slip_lots
      WHERE sauda_id = $1 AND lot_number = $2
    `;
    const result = await db.query<InwardSlipLot>(query, [saudaId, lotNumber]);
    return result.rows[0] || null;
  }

  async create(inwardSlipLotData: CreateInwardSlipLotDTO): Promise<InwardSlipLot> {
    const query = `
      INSERT INTO inward_slip_lots (
        sauda_id, godown_id, lot_number, rice_category, rice_code_id, rice_type, rice_length_id,
        no_of_bags, bag_weight, bill_weight, received_weight, rate, inward_slip_pass_created_at, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING ${LOT_COLUMNS}
    `;

    const values = [
      inwardSlipLotData.sauda_id,
      inwardSlipLotData.godown_id,
      inwardSlipLotData.lot_number,
      inwardSlipLotData.rice_category,
      inwardSlipLotData.rice_code_id,
      inwardSlipLotData.rice_type,
      inwardSlipLotData.rice_length_id,
      inwardSlipLotData.no_of_bags,
      inwardSlipLotData.bag_weight || null,
      inwardSlipLotData.bill_weight,
      inwardSlipLotData.received_weight,
      inwardSlipLotData.rate,
      inwardSlipLotData.inward_slip_pass_created_at ?? null,
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
    const values: unknown[] = [];
    let paramCount = 1;

    if (inwardSlipLotData.godown_id !== undefined) {
      fields.push(`godown_id = $${paramCount++}`);
      values.push(inwardSlipLotData.godown_id);
    }
    if (inwardSlipLotData.lot_number !== undefined) {
      fields.push(`lot_number = $${paramCount++}`);
      values.push(inwardSlipLotData.lot_number);
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
      RETURNING ${LOT_COLUMNS}
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

  async sumBillWeightForSauda(saudaId: string, godownId?: string): Promise<number> {
    let query = `
      SELECT COALESCE(SUM(bill_weight::numeric), 0)::text AS total
      FROM inward_slip_lots
      WHERE sauda_id = $1
    `;
    const params: unknown[] = [saudaId];
    if (godownId) {
      query += ` AND godown_id = $2`;
      params.push(godownId);
    }
    const result = await db.query<{ total: string }>(query, params);
    return parseFloat(result.rows[0]?.total || '0');
  }
}

export const inwardSlipLotDAO = new InwardSlipLotDAO();
