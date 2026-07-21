import { db } from '../database/connection';
import { salesmanDAO } from '../dao/salesman.dao';
import { salesmanCommissionEntryDAO } from '../dao/salesman-commission-entry.dao';
import { NotFoundError, ValidationError } from '../utils/errors';

export interface MonthlySalespersonReport {
  salesman_id: string;
  salesman_name: string;
  from: string | null;
  to: string | null;
  customer_count: number;
  order_count: number;
  total_bags: number;
  total_quantity: number;
  total_sale_amount: number;
  new_customers_added: number;
  by_rice_quality: Array<{
    rice_type: string | null;
    bags: number;
    quantity: number;
    sale_amount: number;
  }>;
}

export interface SalesReturnReportRow {
  credit_note_id: string;
  credit_note_number: string;
  return_date: string | null;
  sale_invoice: string | null;
  customer: string | null;
  rice_type: string | null;
  product_id: string;
  bags: number | null;
  quantity: number;
  return_amount: number;
  reason: string | null;
}

export interface OutstandingReportRow {
  salesman_id: string;
  salesman_name: string | null;
  party_name: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: number | null;
  outstanding_amount: number;
  ageing_days: number;
  ageing_bucket: string;
}

function requireSalesmanId(salesmanId?: string): string {
  if (!salesmanId) throw new ValidationError('salesman_id is required');
  return salesmanId;
}

function ageingBucket(days: number): string {
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export class SalesmanReportService {
  async monthly(filters: {
    salesmanId?: string;
    from?: string;
    to?: string;
  }): Promise<MonthlySalespersonReport> {
    const salesmanId = requireSalesmanId(filters.salesmanId);
    const salesman = await salesmanDAO.findById(salesmanId);
    if (!salesman) throw new NotFoundError('Salesman not found');

    const params: unknown[] = [salesmanId];
    let dateFilter = '';
    let i = 2;
    if (filters.from) {
      dateFilter += ` AND COALESCE(d.dispatch_date, d.created_at::date) >= $${i++}::date`;
      params.push(filters.from);
    }
    if (filters.to) {
      dateFilter += ` AND COALESCE(d.dispatch_date, d.created_at::date) <= $${i++}::date`;
      params.push(filters.to);
    }

    const summary = await db.query<{
      customer_count: string;
      order_count: string;
      total_bags: string;
      total_quantity: string;
      total_sale_amount: string;
    }>(
      `SELECT
         COUNT(DISTINCT ss.sales_party_id)::text AS customer_count,
         COUNT(DISTINCT ss.id)::text AS order_count,
         COALESCE(SUM(dl.packet_count), 0)::text AS total_bags,
         COALESCE(SUM(dl.quantity), 0)::text AS total_quantity,
         COALESCE(SUM(dl.amount), 0)::text AS total_sale_amount
       FROM invoice_dispatches d
       JOIN sales_saudas ss ON ss.id = d.sales_sauda_id
       JOIN invoice_dispatch_lines dl ON dl.invoice_dispatch_id = d.id
       WHERE d.status = 'confirmed'
         AND ss.salesman_id = $1
         AND ss.movement_type = 'sale'
         ${dateFilter}`,
      params
    );

    const byQuality = await db.query<{
      rice_type: string | null;
      bags: string;
      quantity: string;
      sale_amount: string;
    }>(
      `SELECT
         p.rice_type,
         COALESCE(SUM(dl.packet_count), 0)::text AS bags,
         COALESCE(SUM(dl.quantity), 0)::text AS quantity,
         COALESCE(SUM(dl.amount), 0)::text AS sale_amount
       FROM invoice_dispatches d
       JOIN sales_saudas ss ON ss.id = d.sales_sauda_id
       JOIN invoice_dispatch_lines dl ON dl.invoice_dispatch_id = d.id
       JOIN products p ON p.id = dl.product_id
       WHERE d.status = 'confirmed'
         AND ss.salesman_id = $1
         AND ss.movement_type = 'sale'
         ${dateFilter}
       GROUP BY p.rice_type
       ORDER BY p.rice_type NULLS LAST`,
      params
    );

    // New customers: first confirmed sale for this salesman falls in period
    const newCustParams: unknown[] = [salesmanId];
    let newCustFilter = '';
    let j = 2;
    if (filters.from) {
      newCustFilter += ` AND first_sale >= $${j++}::date`;
      newCustParams.push(filters.from);
    }
    if (filters.to) {
      newCustFilter += ` AND first_sale <= $${j++}::date`;
      newCustParams.push(filters.to);
    }

    const newCustomers = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM (
         SELECT
           ss.sales_party_id,
           MIN(COALESCE(d.dispatch_date, d.created_at::date)) AS first_sale
         FROM invoice_dispatches d
         JOIN sales_saudas ss ON ss.id = d.sales_sauda_id
         WHERE d.status = 'confirmed'
           AND ss.salesman_id = $1
           AND ss.movement_type = 'sale'
         GROUP BY ss.sales_party_id
       ) x
       WHERE 1=1 ${newCustFilter}`,
      newCustParams
    );

    const row = summary.rows[0];
    return {
      salesman_id: salesmanId,
      salesman_name: salesman.name,
      from: filters.from ?? null,
      to: filters.to ?? null,
      customer_count: Number(row?.customer_count ?? 0),
      order_count: Number(row?.order_count ?? 0),
      total_bags: Number(row?.total_bags ?? 0),
      total_quantity: Number(row?.total_quantity ?? 0),
      total_sale_amount: Number(row?.total_sale_amount ?? 0),
      new_customers_added: Number(newCustomers.rows[0]?.count ?? 0),
      by_rice_quality: byQuality.rows.map((r) => ({
        rice_type: r.rice_type,
        bags: Number(r.bags),
        quantity: Number(r.quantity),
        sale_amount: Number(r.sale_amount),
      })),
    };
  }

  async returns(filters: {
    salesmanId?: string;
    from?: string;
    to?: string;
  }): Promise<SalesReturnReportRow[]> {
    const salesmanId = requireSalesmanId(filters.salesmanId);
    const salesman = await salesmanDAO.findById(salesmanId);
    if (!salesman) throw new NotFoundError('Salesman not found');

    const params: unknown[] = [salesmanId];
    let dateFilter = '';
    let i = 2;
    if (filters.from) {
      dateFilter += ` AND COALESCE(cn.credit_note_date, cn.created_at::date) >= $${i++}::date`;
      params.push(filters.from);
    }
    if (filters.to) {
      dateFilter += ` AND COALESCE(cn.credit_note_date, cn.created_at::date) <= $${i++}::date`;
      params.push(filters.to);
    }

    const result = await db.query<{
      credit_note_id: string;
      credit_note_number: string;
      return_date: string | null;
      sale_invoice: string | null;
      customer: string | null;
      rice_type: string | null;
      product_id: string;
      bags: string | null;
      quantity: string;
      return_amount: string;
      reason: string | null;
    }>(
      `SELECT
         cn.id AS credit_note_id,
         cn.credit_note_number,
         TO_CHAR(COALESCE(cn.credit_note_date, cn.created_at::date), 'YYYY-MM-DD') AS return_date,
         d.internal_invoice_number AS sale_invoice,
         COALESCE(d.party_name, sp.business_name) AS customer,
         p.rice_type,
         cnl.product_id,
         CASE
           WHEN pkg.holding_capacity IS NOT NULL AND pkg.holding_capacity > 0
             THEN ROUND(cnl.quantity_returned / pkg.holding_capacity)::text
           ELSE NULL
         END AS bags,
         cnl.quantity_returned::text AS quantity,
         ROUND((cnl.quantity_returned * COALESCE(dl.rate, 0))::numeric, 2)::text AS return_amount,
         cn.reason
       FROM credit_notes cn
       JOIN sales_saudas ss ON ss.id = cn.sales_sauda_id
       JOIN invoice_dispatches d ON d.id = cn.invoice_dispatch_id
       LEFT JOIN sales_parties sp ON sp.id = ss.sales_party_id
       JOIN credit_note_lines cnl ON cnl.credit_note_id = cn.id
       JOIN products p ON p.id = cnl.product_id
       LEFT JOIN invoice_dispatch_lines dl ON dl.id = cnl.invoice_dispatch_line_id
       LEFT JOIN packaging pkg ON pkg.id = dl.packaging_id
       WHERE cn.status = 'confirmed'
         AND ss.salesman_id = $1
         AND ss.movement_type = 'sale'
         ${dateFilter}
       ORDER BY COALESCE(cn.credit_note_date, cn.created_at::date) DESC, cn.credit_note_number`,
      params
    );

    return result.rows.map((r) => ({
      credit_note_id: r.credit_note_id,
      credit_note_number: r.credit_note_number,
      return_date: r.return_date,
      sale_invoice: r.sale_invoice,
      customer: r.customer,
      rice_type: r.rice_type,
      product_id: r.product_id,
      bags: r.bags != null ? Number(r.bags) : null,
      quantity: Number(r.quantity),
      return_amount: Number(r.return_amount),
      reason: r.reason,
    }));
  }

  async commission(filters: {
    salesmanId?: string;
    status?: 'pending' | 'approved' | 'paid';
    from?: string;
    to?: string;
    view?: 'transaction' | 'monthly';
  }) {
    if (filters.view === 'monthly') {
      return {
        view: 'monthly' as const,
        rows: await salesmanCommissionEntryDAO.monthlyTotals({
          salesmanId: filters.salesmanId,
          from: filters.from,
          to: filters.to,
        }),
      };
    }
    const entries = await salesmanCommissionEntryDAO.list({
      salesmanId: filters.salesmanId,
      status: filters.status,
      from: filters.from,
      to: filters.to,
    });
    return {
      view: 'transaction' as const,
      rows: entries,
      totals: {
        pending: entries
          .filter((e) => e.status === 'pending')
          .reduce((s, e) => s + e.commission_amount, 0),
        approved: entries
          .filter((e) => e.status === 'approved')
          .reduce((s, e) => s + e.commission_amount, 0),
        paid: entries
          .filter((e) => e.status === 'paid')
          .reduce((s, e) => s + e.commission_amount, 0),
        net: entries.reduce((s, e) => s + e.commission_amount, 0),
      },
    };
  }

  async outstanding(filters: {
    salesmanId?: string;
  }): Promise<OutstandingReportRow[]> {
    const salesmanId = requireSalesmanId(filters.salesmanId);
    const salesman = await salesmanDAO.findById(salesmanId);
    if (!salesman) throw new NotFoundError('Salesman not found');

    const result = await db.query<{
      salesman_id: string;
      salesman_name: string | null;
      party_name: string;
      invoice_number: string;
      invoice_date: string | null;
      due_date: string | null;
      payment_terms: string | null;
      outstanding_amount: string;
      ageing_days: string;
    }>(
      `SELECT
         ss.salesman_id,
         sm.name AS salesman_name,
         COALESCE(d.party_name, sp.business_name) AS party_name,
         d.internal_invoice_number AS invoice_number,
         TO_CHAR(COALESCE(d.dispatch_date, d.created_at::date), 'YYYY-MM-DD') AS invoice_date,
         TO_CHAR(
           COALESCE(d.dispatch_date, d.created_at::date)
             + (COALESCE(ss.payment_terms, 0) || ' days')::interval,
           'YYYY-MM-DD'
         ) AS due_date,
         ss.payment_terms::text AS payment_terms,
         COALESCE(SUM(dl.amount), 0)::text AS outstanding_amount,
         (
           CURRENT_DATE
           - (
             COALESCE(d.dispatch_date, d.created_at::date)
               + (COALESCE(ss.payment_terms, 0) || ' days')::interval
           )::date
         )::text AS ageing_days
       FROM invoice_dispatches d
       JOIN sales_saudas ss ON ss.id = d.sales_sauda_id
       LEFT JOIN salesmen sm ON sm.id = ss.salesman_id
       LEFT JOIN sales_parties sp ON sp.id = ss.sales_party_id
       JOIN invoice_dispatch_lines dl ON dl.invoice_dispatch_id = d.id
       WHERE d.status = 'confirmed'
         AND ss.salesman_id = $1
         AND ss.movement_type = 'sale'
       GROUP BY
         ss.salesman_id, sm.name, d.party_name, sp.business_name,
         d.internal_invoice_number, d.dispatch_date, d.created_at, ss.payment_terms
       ORDER BY due_date ASC NULLS LAST, d.internal_invoice_number`,
      [salesmanId]
    );

    return result.rows.map((r) => {
      const ageingDays = Number(r.ageing_days);
      return {
        salesman_id: r.salesman_id,
        salesman_name: r.salesman_name,
        party_name: r.party_name,
        invoice_number: r.invoice_number,
        invoice_date: r.invoice_date,
        due_date: r.due_date,
        payment_terms: r.payment_terms != null ? Number(r.payment_terms) : null,
        outstanding_amount: Number(r.outstanding_amount),
        ageing_days: ageingDays,
        ageing_bucket: ageingBucket(ageingDays),
      };
    });
  }
}

export const salesmanReportService = new SalesmanReportService();
