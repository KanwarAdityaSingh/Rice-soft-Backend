import { db } from '../database/connection';
import type { InventoryLedgerSourceType } from '../models/inventory-ledger.model';
import type {
  ReplenishmentDraftAllocation,
  ReplenishmentLedgerEntry,
  ReplenishmentStockRow,
  ReplenishmentTrendRow,
  TruckSizeConfig,
  TruckSizeConfigInput,
} from '../models/replenishment.model';
import { quantityToKg, round3, packetsFromKg } from '../services/replenishment-engine';

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseFloat(v);
}

export class ReplenishmentDAO {
  async listTruckSizes(activeOnly = true): Promise<TruckSizeConfig[]> {
    const where = activeOnly ? 'WHERE is_active = true' : '';
    const result = await db.query<TruckSizeConfig>(
      `SELECT id, tonnes, label, sort_order, is_active, created_at, updated_at
       FROM truck_size_configs
       ${where}
       ORDER BY sort_order ASC, tonnes ASC`
    );
    return result.rows.map((r) => ({
      ...r,
      tonnes: toNum(r.tonnes),
    }));
  }

  async replaceTruckSizes(sizes: TruckSizeConfigInput[]): Promise<TruckSizeConfig[]> {
    await db.transaction(async (client) => {
      await client.query('DELETE FROM truck_size_configs');
      for (let i = 0; i < sizes.length; i++) {
        const s = sizes[i];
        const tonnes = toNum(s.tonnes);
        const label = (s.label && s.label.trim()) || `${tonnes} T`;
        const sortOrder = s.sort_order ?? i + 1;
        const isActive = s.is_active !== false;
        await client.query(
          `INSERT INTO truck_size_configs (tonnes, label, sort_order, is_active)
           VALUES ($1, $2, $3, $4)`,
          [tonnes, label, sortOrder, isActive]
        );
      }
    });
    return this.listTruckSizes(false);
  }

  async getStock(godownId: string): Promise<ReplenishmentStockRow[]> {
    const result = await db.query<{
      product_id: string;
      product_name: string;
      packaging_id: string;
      holding_capacity: string | number;
      packet_type: string | null;
      fgi_kg: string | number;
      fgi_packets: string | number;
    }>(
      `SELECT fgi.product_id,
              COALESCE(p.name, '') AS product_name,
              fgi.packaging_id,
              pkg.holding_capacity,
              COALESCE(pm.name, pkg.packet_type) AS packet_type,
              COALESCE(SUM(fgi.total_weight), 0) AS fgi_kg,
              COALESCE(SUM(fgi.no_of_packets), 0) AS fgi_packets
       FROM finished_goods_inventory fgi
       INNER JOIN products p ON p.id = fgi.product_id
       INNER JOIN packaging pkg ON pkg.id = fgi.packaging_id
       LEFT JOIN packaging_materials pm ON pm.id = pkg.packaging_material_id
       WHERE fgi.godown_id = $1
       GROUP BY fgi.product_id, p.name, fgi.packaging_id, pkg.holding_capacity, pm.name, pkg.packet_type
       HAVING COALESCE(SUM(fgi.total_weight), 0) > 0 OR COALESCE(SUM(fgi.no_of_packets), 0) > 0
       ORDER BY p.name ASC, pkg.holding_capacity ASC`,
      [godownId]
    );
    return result.rows.map((r) => ({
      product_id: r.product_id,
      product_name: r.product_name,
      packaging_id: r.packaging_id,
      holding_capacity: toNum(r.holding_capacity),
      packet_type: r.packet_type,
      fgi_kg: toNum(r.fgi_kg),
      fgi_packets: toNum(r.fgi_packets),
    }));
  }

  async getDraftAllocations(godownId: string): Promise<ReplenishmentDraftAllocation[]> {
    const result = await db.query<{
      invoice_dispatch_id: string;
      invoice_dispatch_line_id: string;
      internal_invoice_number: string;
      serial_number: number | null;
      party_name: string;
      sales_sauda_id: string | null;
      order_number: string | null;
      product_id: string;
      product_name: string;
      packaging_id: string;
      holding_capacity: string | number | null;
      quantity: string | number;
      quantity_unit: string;
      packet_count: string | number | null;
    }>(
      `SELECT d.id AS invoice_dispatch_id,
              idl.id AS invoice_dispatch_line_id,
              d.internal_invoice_number,
              d.serial_number,
              d.party_name,
              COALESCE(ssl.sales_sauda_id, d.sales_sauda_id) AS sales_sauda_id,
              ss.order_number,
              idl.product_id,
              COALESCE(p.name, '') AS product_name,
              idl.packaging_id,
              pkg.holding_capacity,
              idl.quantity,
              idl.quantity_unit,
              idl.packet_count
       FROM invoice_dispatch_lines idl
       INNER JOIN invoice_dispatches d ON d.id = idl.invoice_dispatch_id
       LEFT JOIN sales_sauda_lines ssl ON ssl.id = idl.sales_sauda_line_id
       LEFT JOIN sales_saudas ss ON ss.id = COALESCE(ssl.sales_sauda_id, d.sales_sauda_id)
       LEFT JOIN packaging pkg ON pkg.id = idl.packaging_id
       LEFT JOIN products p ON p.id = idl.product_id
       WHERE d.godown_id = $1
         AND d.status = 'draft'
         AND idl.product_id IS NOT NULL
         AND idl.packaging_id IS NOT NULL
       ORDER BY d.internal_invoice_number ASC, idl.created_at ASC`,
      [godownId]
    );

    return result.rows.map((r) => {
      const cap = toNum(r.holding_capacity);
      const kg = quantityToKg(toNum(r.quantity), r.quantity_unit, cap, r.packet_count != null ? toNum(r.packet_count) : null);
      return {
        invoice_dispatch_id: r.invoice_dispatch_id,
        invoice_dispatch_line_id: r.invoice_dispatch_line_id,
        internal_invoice_number: r.internal_invoice_number,
        serial_number: r.serial_number,
        party_name: r.party_name,
        sales_sauda_id: r.sales_sauda_id,
        order_number: r.order_number,
        product_id: r.product_id,
        product_name: r.product_name,
        packaging_id: r.packaging_id,
        holding_capacity: cap,
        quantity_kg: kg,
        packets: packetsFromKg(kg, cap),
        status: 'draft' as const,
      };
    });
  }

  async getTrendSales(godownId: string, windowDays: number): Promise<ReplenishmentTrendRow[]> {
    const result = await db.query<{
      product_id: string;
      product_name: string;
      packaging_id: string;
      holding_capacity: string | number | null;
      quantity: string | number;
      quantity_unit: string;
      packet_count: string | number | null;
    }>(
      `SELECT idl.product_id,
              COALESCE(p.name, '') AS product_name,
              idl.packaging_id,
              pkg.holding_capacity,
              idl.quantity,
              idl.quantity_unit,
              idl.packet_count
       FROM invoice_dispatch_lines idl
       INNER JOIN invoice_dispatches d ON d.id = idl.invoice_dispatch_id
       LEFT JOIN products p ON p.id = idl.product_id
       LEFT JOIN packaging pkg ON pkg.id = idl.packaging_id
       WHERE d.godown_id = $1
         AND d.status = 'confirmed'
         AND d.to_godown_id IS NULL
         AND idl.product_id IS NOT NULL
         AND idl.packaging_id IS NOT NULL
         AND COALESCE(d.dispatch_date::timestamptz, d.updated_at) >= (CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 day'))`,
      [godownId, windowDays]
    );

    const bySku = new Map<string, ReplenishmentTrendRow>();
    for (const r of result.rows) {
      const cap = toNum(r.holding_capacity);
      const kg = quantityToKg(toNum(r.quantity), r.quantity_unit, cap, r.packet_count != null ? toNum(r.packet_count) : null);
      const key = `${r.product_id}::${r.packaging_id}`;
      const existing = bySku.get(key);
      if (existing) {
        existing.sold_kg = round3(existing.sold_kg + kg);
      } else {
        bySku.set(key, {
          product_id: r.product_id,
          product_name: r.product_name,
          packaging_id: r.packaging_id,
          holding_capacity: cap,
          sold_kg: kg,
        });
      }
    }
    return [...bySku.values()];
  }

  async getSalesSaudasMeta(ids: string[]): Promise<
    Array<{
      id: string;
      order_number: string | null;
      sales_party_id: string;
      party_name: string;
      movement_type: string;
      status: string;
    }>
  > {
    if (ids.length === 0) return [];
    const result = await db.query<{
      id: string;
      order_number: string | null;
      sales_party_id: string;
      party_name: string;
      movement_type: string;
      status: string;
    }>(
      `SELECT ss.id, ss.order_number, ss.sales_party_id,
              COALESCE(sp.business_name, '') AS party_name,
              ss.movement_type, ss.status
       FROM sales_saudas ss
       LEFT JOIN sales_parties sp ON sp.id = ss.sales_party_id
       WHERE ss.id = ANY($1::uuid[])`,
      [ids]
    );
    return result.rows;
  }

  async getLedger(
    filters: {
      godown_id: string;
      product_id?: string;
      source_type?: InventoryLedgerSourceType;
      from_date?: string;
      to_date?: string;
      limit: number;
      offset: number;
    }
  ): Promise<{ rows: ReplenishmentLedgerEntry[]; total: number }> {
    let where = ' WHERE il.godown_id = $1';
    const params: unknown[] = [filters.godown_id];
    let n = 2;
    if (filters.product_id) {
      where += ` AND il.product_id = $${n++}`;
      params.push(filters.product_id);
    }
    if (filters.source_type) {
      where += ` AND il.source_type = $${n++}`;
      params.push(filters.source_type);
    }
    if (filters.from_date) {
      where += ` AND il.created_at >= $${n++}::timestamptz`;
      params.push(filters.from_date);
    }
    if (filters.to_date) {
      where += ` AND il.created_at <= $${n++}::timestamptz`;
      params.push(filters.to_date);
    }

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM inventory_ledger il${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const result = await db.query<{
      id: string;
      godown_id: string;
      product_id: string;
      product_name: string | null;
      packaging_id: string | null;
      holding_capacity: string | number | null;
      quantity_change: string | number;
      source_type: string;
      source_id: string | null;
      stock_before: string | number;
      stock_after: string | number;
      reference_type: string | null;
      reference_id: string | null;
      batch_id: string | null;
      created_at: Date;
      created_by: string | null;
    }>(
      `SELECT il.id, il.godown_id, il.product_id, p.name AS product_name,
              il.packaging_id, pkg.holding_capacity, il.quantity_change,
              il.source_type, il.source_id, il.stock_before, il.stock_after,
              il.reference_type, il.reference_id, il.batch_id,
              il.created_at, il.created_by
       FROM inventory_ledger il
       LEFT JOIN products p ON p.id = il.product_id
       LEFT JOIN packaging pkg ON pkg.id = il.packaging_id
       ${where}
       ORDER BY il.created_at DESC
       LIMIT $${n++} OFFSET $${n}`,
      [...params, filters.limit, filters.offset]
    );

    const rows: ReplenishmentLedgerEntry[] = result.rows.map((r) => {
      const kg = toNum(r.quantity_change);
      const cap = r.holding_capacity != null ? toNum(r.holding_capacity) : null;
      return {
        id: r.id,
        godown_id: r.godown_id,
        product_id: r.product_id,
        product_name: r.product_name,
        packaging_id: r.packaging_id,
        holding_capacity: cap,
        quantity_change: kg,
        packets_change: cap && cap > 0 ? round3(kg / cap) : null,
        source_type: r.source_type,
        source_id: r.source_id,
        stock_before: toNum(r.stock_before),
        stock_after: toNum(r.stock_after),
        reference_type: r.reference_type,
        reference_id: r.reference_id,
        batch_id: r.batch_id,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        created_by: r.created_by,
      };
    });

    return { rows, total };
  }
}

export const replenishmentDAO = new ReplenishmentDAO();
