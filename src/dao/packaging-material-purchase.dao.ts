import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  PackagingMaterialPurchase,
  CreatePackagingMaterialPurchaseDTO,
} from '../models/packaging-material-purchase.model';
import { logger } from '../utils/logger';
import { buildNormalizedSearchClause } from '../utils/search';

const SELECT = `
  id, vendor_id, packaging_id, serial_number, purchase_date, invoice_number, invoice_date,
  quantity_kg, empty_bag_weight_kg, gsm, rate_per_kg, gst_percent,
  bag_count, rate_per_bag, taxable_amount, gst_amount, total_amount,
  godown_id, batch_lot_number, invoice_document_url, notes,
  created_at, updated_at, created_by, updated_by
`;

export interface PackagingMaterialPurchaseInsert
  extends CreatePackagingMaterialPurchaseDTO {
  bag_count: number;
  rate_per_bag: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
}

export class PackagingMaterialPurchaseDAO {
  async findAll(
    filters?: {
      packaging_id?: string;
      vendor_id?: string;
      search?: string;
    },
    pagination?: { limit: number; offset: number }
  ): Promise<{ rows: PackagingMaterialPurchase[]; total: number }> {
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (filters?.packaging_id) {
      params.push(filters.packaging_id);
      where.push(`pmp.packaging_id = $${params.length}`);
    }
    if (filters?.vendor_id) {
      params.push(filters.vendor_id);
      where.push(`pmp.vendor_id = $${params.length}`);
    }
    let whereSql = `WHERE ${where.join(' AND ')}`;
    const searchClause = buildNormalizedSearchClause(
      [
        'pmp.invoice_number',
        'pmp.serial_number',
        'pmp.batch_lot_number',
        'pv.business_name',
        'pv.name',
      ],
      filters?.search,
      params.length + 1
    );
    whereSql += searchClause.sql;
    params.push(...searchClause.params);

    const from = `
      FROM packaging_material_purchases pmp
      LEFT JOIN packaging_vendors pv ON pv.id = pmp.vendor_id
    `;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${from} ${whereSql}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    let query = `
      SELECT
        pmp.id, pmp.vendor_id, pmp.packaging_id, pmp.serial_number, pmp.purchase_date, pmp.invoice_number, pmp.invoice_date,
        pmp.quantity_kg, pmp.empty_bag_weight_kg, pmp.gsm, pmp.rate_per_kg, pmp.gst_percent,
        pmp.bag_count, pmp.rate_per_bag, pmp.taxable_amount, pmp.gst_amount, pmp.total_amount,
        pmp.godown_id, pmp.batch_lot_number, pmp.invoice_document_url, pmp.notes,
        pmp.created_at, pmp.updated_at, pmp.created_by, pmp.updated_by
      ${from}
      ${whereSql}
      ORDER BY pmp.serial_number DESC, pmp.purchase_date DESC, pmp.created_at DESC`;
    if (pagination) {
      params.push(pagination.limit, pagination.offset);
      query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }
    const result = await db.query<PackagingMaterialPurchase>(query, params);
    return { rows: result.rows, total };
  }

  async findById(id: string): Promise<PackagingMaterialPurchase | null> {
    const result = await db.query<PackagingMaterialPurchase>(
      `SELECT ${SELECT} FROM packaging_material_purchases WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findByVendorInvoice(
    vendorId: string,
    invoiceNumber: string,
    excludeId?: string
  ): Promise<PackagingMaterialPurchase | null> {
    const result = await db.query<PackagingMaterialPurchase>(
      `SELECT ${SELECT} FROM packaging_material_purchases
       WHERE vendor_id = $1 AND LOWER(invoice_number) = LOWER($2)
         AND ($3::uuid IS NULL OR id <> $3)`,
      [vendorId, invoiceNumber.trim(), excludeId ?? null]
    );
    return result.rows[0] || null;
  }

  async findLatestByPackagingId(packagingId: string): Promise<PackagingMaterialPurchase | null> {
    const result = await db.query<PackagingMaterialPurchase>(
      `SELECT ${SELECT} FROM packaging_material_purchases
       WHERE packaging_id = $1
       ORDER BY purchase_date DESC, created_at DESC
       LIMIT 1`,
      [packagingId]
    );
    return result.rows[0] || null;
  }

  async createWithClient(
    client: PoolClient,
    data: PackagingMaterialPurchaseInsert
  ): Promise<PackagingMaterialPurchase> {
    const result = await client.query<PackagingMaterialPurchase>(
      `INSERT INTO packaging_material_purchases (
        vendor_id, packaging_id, purchase_date, invoice_number, invoice_date,
        quantity_kg, empty_bag_weight_kg, gsm, rate_per_kg, gst_percent,
        bag_count, rate_per_bag, taxable_amount, gst_amount, total_amount,
        godown_id, batch_lot_number, invoice_document_url, notes, created_by
      ) VALUES (
        $1,$2,$3::date,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      ) RETURNING ${SELECT}`,
      [
        data.vendor_id,
        data.packaging_id,
        data.purchase_date,
        data.invoice_number.trim(),
        data.invoice_date,
        data.quantity_kg,
        data.empty_bag_weight_kg,
        data.gsm ?? null,
        data.rate_per_kg,
        data.gst_percent,
        data.bag_count,
        data.rate_per_bag,
        data.taxable_amount,
        data.gst_amount,
        data.total_amount,
        data.godown_id,
        data.batch_lot_number?.trim() || null,
        data.invoice_document_url || null,
        data.notes || null,
        data.created_by || null,
      ]
    );
    return result.rows[0];
  }

  async create(data: PackagingMaterialPurchaseInsert): Promise<PackagingMaterialPurchase> {
    const row = await db.transaction(async (client) => this.createWithClient(client, data));
    logger.info('Packaging material purchase created', { id: row.id });
    return row;
  }

  async updateWithClient(
    client: PoolClient,
    id: string,
    data: PackagingMaterialPurchaseInsert & { updated_by?: string | null }
  ): Promise<PackagingMaterialPurchase | null> {
    const result = await client.query<PackagingMaterialPurchase>(
      `UPDATE packaging_material_purchases SET
        vendor_id = $1,
        packaging_id = $2,
        purchase_date = $3::date,
        invoice_number = $4,
        invoice_date = $5::date,
        quantity_kg = $6,
        empty_bag_weight_kg = $7,
        gsm = $8,
        rate_per_kg = $9,
        gst_percent = $10,
        bag_count = $11,
        rate_per_bag = $12,
        taxable_amount = $13,
        gst_amount = $14,
        total_amount = $15,
        godown_id = $16,
        batch_lot_number = $17,
        invoice_document_url = $18,
        notes = $19,
        updated_by = $20,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $21
       RETURNING ${SELECT}`,
      [
        data.vendor_id,
        data.packaging_id,
        data.purchase_date,
        data.invoice_number.trim(),
        data.invoice_date,
        data.quantity_kg,
        data.empty_bag_weight_kg,
        data.gsm ?? null,
        data.rate_per_kg,
        data.gst_percent,
        data.bag_count,
        data.rate_per_bag,
        data.taxable_amount,
        data.gst_amount,
        data.total_amount,
        data.godown_id,
        data.batch_lot_number?.trim() || null,
        data.invoice_document_url || null,
        data.notes || null,
        data.updated_by || null,
        id,
      ]
    );
    return result.rows[0] || null;
  }
}

export const packagingMaterialPurchaseDAO = new PackagingMaterialPurchaseDAO();
