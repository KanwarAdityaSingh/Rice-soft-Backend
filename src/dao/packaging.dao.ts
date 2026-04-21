import { db } from '../database/connection';
import { Packaging, CreatePackagingDTO, UpdatePackagingDTO, PackagingWeight } from '../models/packaging.model';
import { logger } from '../utils/logger';
import type { EmptyBagReceiptSnapshot } from '../utils/empty-bag-cost';

const PACKAGING_SELECT_COLUMNS = `
      id, packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight,
      empty_bag_weight_kg, empty_bag_rate_per_kg, empty_bag_gst_percent,
      empty_bags_total_weight_kg, empty_bags_taxable_amount, empty_bags_gst_amount, empty_bags_total_amount,
      bill_number, bill_date, packaging_bill_url,
      created_at, updated_at, created_by, updated_by`;

/** Row passed to INSERT; `packaging_number` is optional (DB trigger fills if omitted). */
export type CreatePackagingRow = CreatePackagingDTO &
  Partial<EmptyBagReceiptSnapshot> & { packaging_number?: string | null };

export class PackagingDAO {
  async findAll(productId?: string): Promise<Packaging[]> {
    let query = `
      SELECT ${PACKAGING_SELECT_COLUMNS}
      FROM packaging
    `;
    const params: any[] = [];
    
    if (productId) {
      query += ` WHERE product_id = $1`;
      params.push(productId);
    }
    
    query += ` ORDER BY holding_capacity ASC, packet_type ASC`;
    
    const result = await db.query<Packaging>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Packaging | null> {
    const query = `
      SELECT ${PACKAGING_SELECT_COLUMNS}
      FROM packaging
      WHERE id = $1
    `;
    const result = await db.query<Packaging>(query, [id]);
    return result.rows[0] || null;
  }

  async findByProductId(productId: string): Promise<Packaging[]> {
    const query = `
      SELECT ${PACKAGING_SELECT_COLUMNS}
      FROM packaging
      WHERE product_id = $1
      ORDER BY packaging_number ASC, holding_capacity ASC
    `;
    const result = await db.query<Packaging>(query, [productId]);
    return result.rows;
  }

  async findByProductAndWeight(productId: string, weight: PackagingWeight): Promise<Packaging | null> {
    const query = `
      SELECT ${PACKAGING_SELECT_COLUMNS}
      FROM packaging
      WHERE product_id = $1 AND holding_capacity = $2
      ORDER BY packaging_number ASC
      LIMIT 1
    `;
    const result = await db.query<Packaging>(query, [productId, weight]);
    return result.rows[0] || null;
  }

  async findByCapacityAndType(holdingCapacity: number, packetType: string): Promise<Packaging | null> {
    const query = `
      SELECT ${PACKAGING_SELECT_COLUMNS}
      FROM packaging
      WHERE holding_capacity = $1 AND packet_type = $2
      ORDER BY packaging_number ASC
      LIMIT 1
    `;
    const result = await db.query<Packaging>(query, [holdingCapacity, packetType]);
    return result.rows[0] || null;
  }

  async create(packagingData: CreatePackagingRow): Promise<Packaging> {
    const {
      initial_packets: _initialPackets,
      godown_id: _godownId,
      packaging_number: packagingNumberIn,
      product_id,
      holding_capacity,
      packet_type,
      packaging_vendor_id,
      ordered_weight,
      empty_bag_weight_kg,
      empty_bag_rate_per_kg,
      empty_bag_gst_percent,
      empty_bags_total_weight_kg,
      empty_bags_taxable_amount,
      empty_bags_gst_amount,
      empty_bags_total_amount,
      bill_number,
      bill_date,
      packaging_bill_url,
      created_by,
    } = packagingData;

    const query = `
      INSERT INTO packaging (
        packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight,
        empty_bag_weight_kg, empty_bag_rate_per_kg, empty_bag_gst_percent,
        empty_bags_total_weight_kg, empty_bags_taxable_amount, empty_bags_gst_amount, empty_bags_total_amount,
        bill_number, bill_date, packaging_bill_url,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING ${PACKAGING_SELECT_COLUMNS}
    `;

    const values = [
      packagingNumberIn || null,
      product_id,
      holding_capacity,
      packet_type,
      packaging_vendor_id || null,
      ordered_weight ?? null,
      empty_bag_weight_kg ?? null,
      empty_bag_rate_per_kg ?? null,
      empty_bag_gst_percent ?? null,
      empty_bags_total_weight_kg ?? null,
      empty_bags_taxable_amount ?? null,
      empty_bags_gst_amount ?? null,
      empty_bags_total_amount ?? null,
      bill_number && String(bill_number).trim() !== '' ? String(bill_number).trim() : null,
      bill_date && String(bill_date).trim() !== '' ? String(bill_date).trim() : null,
      packaging_bill_url && String(packaging_bill_url).trim() !== ''
        ? String(packaging_bill_url).trim()
        : null,
      created_by || null,
    ];
    
    try {
      const result = await db.query<Packaging>(query, values);
      logger.info('Packaging created', { id: result.rows[0].id, packaging_number: result.rows[0].packaging_number, product_id: result.rows[0].product_id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating packaging', { error, packagingData });
      throw error;
    }
  }

  async update(id: string, packagingData: UpdatePackagingDTO): Promise<Packaging | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (packagingData.holding_capacity !== undefined) {
      fields.push(`holding_capacity = $${paramCount++}`);
      values.push(packagingData.holding_capacity);
    }
    if (packagingData.packet_type !== undefined) {
      fields.push(`packet_type = $${paramCount++}`);
      values.push(packagingData.packet_type);
    }
    if (packagingData.packaging_vendor_id !== undefined) {
      fields.push(`packaging_vendor_id = $${paramCount++}`);
      values.push(packagingData.packaging_vendor_id || null);
    }
    if (packagingData.ordered_weight !== undefined) {
      fields.push(`ordered_weight = $${paramCount++}`);
      values.push(packagingData.ordered_weight || null);
    }
    if (packagingData.empty_bag_weight_kg !== undefined) {
      fields.push(`empty_bag_weight_kg = $${paramCount++}`);
      values.push(packagingData.empty_bag_weight_kg);
    }
    if (packagingData.empty_bag_rate_per_kg !== undefined) {
      fields.push(`empty_bag_rate_per_kg = $${paramCount++}`);
      values.push(packagingData.empty_bag_rate_per_kg);
    }
    if (packagingData.empty_bag_gst_percent !== undefined) {
      fields.push(`empty_bag_gst_percent = $${paramCount++}`);
      values.push(packagingData.empty_bag_gst_percent);
    }
    if (packagingData.bill_number !== undefined) {
      fields.push(`bill_number = $${paramCount++}`);
      values.push(packagingData.bill_number || null);
    }
    if (packagingData.bill_date !== undefined) {
      fields.push(`bill_date = $${paramCount++}`);
      values.push(packagingData.bill_date || null);
    }
    if (packagingData.packaging_bill_url !== undefined) {
      fields.push(`packaging_bill_url = $${paramCount++}`);
      values.push(packagingData.packaging_bill_url || null);
    }
    if (packagingData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(packagingData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE packaging
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING ${PACKAGING_SELECT_COLUMNS}
    `;

    try {
      const result = await db.query<Packaging>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Packaging updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating packaging', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM packaging WHERE id = $1';
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Packaging deleted', { id });
    }
    return deleted;
  }
}

export const packagingDAO = new PackagingDAO();

