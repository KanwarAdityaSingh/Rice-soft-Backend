import { db } from '../database/connection';
import {
  Expense,
  CreateExpenseDTO,
  UpdateExpenseDTO,
  ExpenseStatus,
  PayeeType,
} from '../models/expense.model';
import { buildNormalizedSearchClause } from '../utils/search';

export interface ExpenseListFilters {
  expense_category_id?: string;
  status?: ExpenseStatus;
  payee_type?: PayeeType;
  payee_id?: string;
  date_from?: string;
  date_to?: string;
  financial_year?: string;
  search?: string;
  limit: number;
  offset: number;
}

export class ExpenseDAO {
  async findAll(filters: ExpenseListFilters): Promise<{ rows: Expense[]; total: number }> {
    const {
      expense_category_id,
      status,
      payee_type,
      payee_id,
      date_from,
      date_to,
      financial_year,
      search,
      limit,
      offset,
    } = filters;

    let where = `WHERE 1=1`;
    const params: unknown[] = [];
    let paramCount = 1;

    if (expense_category_id) {
      where += ` AND e.expense_category_id = $${paramCount++}`;
      params.push(expense_category_id);
    }

    if (status) {
      where += ` AND e.status = $${paramCount++}`;
      params.push(status);
    }

    if (payee_type) {
      where += ` AND e.payee_type = $${paramCount++}`;
      params.push(payee_type);
    }

    if (payee_id) {
      where += ` AND e.payee_id = $${paramCount++}`;
      params.push(payee_id);
    }

    if (date_from) {
      where += ` AND e.expense_date >= $${paramCount++}`;
      params.push(date_from);
    }

    if (date_to) {
      where += ` AND e.expense_date <= $${paramCount++}`;
      params.push(date_to);
    }

    if (financial_year) {
      where += ` AND e.financial_year = $${paramCount++}`;
      params.push(financial_year);
    }

    const searchClause = buildNormalizedSearchClause(
      [
        'e.expense_number',
        'e.payee_name',
        'e.payee_gst_number',
        'e.notes',
        'ec.name',
        'ec.code',
      ],
      search,
      paramCount
    );
    where += searchClause.sql;
    params.push(...searchClause.params);
    paramCount = searchClause.nextParamIndex;

    const countQuery = `
      SELECT COUNT(*) as count 
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.expense_category_id = ec.id
      ${where}
    `;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const query = `
      SELECT e.*
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.expense_category_id = ec.id
      ${where}
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;

    const result = await db.query(query, params);
    return { rows: result.rows, total };
  }

  async findById(id: string): Promise<Expense | null> {
    const query = 'SELECT * FROM expenses WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByExpenseNumber(expenseNumber: string): Promise<Expense | null> {
    const query = 'SELECT * FROM expenses WHERE expense_number = $1';
    const result = await db.query(query, [expenseNumber]);
    return result.rows[0] || null;
  }

  async create(data: CreateExpenseDTO): Promise<Expense> {
    const query = `
      INSERT INTO expenses (
        expense_category_id, financial_year, expense_date,
        payee_type, payee_id, payee_name, payee_gst_number,
        payee_bank_name, payee_account_number, payee_ifsc, payee_branch,
        subtotal, overhead_total, taxable_amount,
        cgst_amount, sgst_amount, igst_amount, tax_amount, total_amount,
        status, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `;

    const values = [
      data.expense_category_id,
      data.financial_year || this.getFinancialYearFromDate(data.expense_date),
      data.expense_date,
      data.payee_type,
      data.payee_id || null,
      data.payee_name,
      data.payee_gst_number || null,
      data.payee_bank_name || null,
      data.payee_account_number || null,
      data.payee_ifsc || null,
      data.payee_branch || null,
      0, // subtotal - calculated later
      0, // overhead_total - calculated later
      data.taxable_amount || null,
      data.cgst_amount || 0,
      data.sgst_amount || 0,
      data.igst_amount || 0,
      0, // tax_amount - calculated later
      0, // total_amount - calculated later
      'draft',
      data.notes || null,
      data.created_by || null,
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  async update(id: string, data: UpdateExpenseDTO): Promise<Expense | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (data.expense_category_id !== undefined) {
      fields.push(`expense_category_id = $${paramCount++}`);
      values.push(data.expense_category_id);
    }

    if (data.expense_date !== undefined) {
      fields.push(`expense_date = $${paramCount++}`);
      values.push(data.expense_date);
    }

    if (data.payee_type !== undefined) {
      fields.push(`payee_type = $${paramCount++}`);
      values.push(data.payee_type);
    }

    if (data.payee_id !== undefined) {
      fields.push(`payee_id = $${paramCount++}`);
      values.push(data.payee_id);
    }

    if (data.payee_name !== undefined) {
      fields.push(`payee_name = $${paramCount++}`);
      values.push(data.payee_name);
    }

    if (data.payee_gst_number !== undefined) {
      fields.push(`payee_gst_number = $${paramCount++}`);
      values.push(data.payee_gst_number);
    }

    if (data.payee_bank_name !== undefined) {
      fields.push(`payee_bank_name = $${paramCount++}`);
      values.push(data.payee_bank_name);
    }

    if (data.payee_account_number !== undefined) {
      fields.push(`payee_account_number = $${paramCount++}`);
      values.push(data.payee_account_number);
    }

    if (data.payee_ifsc !== undefined) {
      fields.push(`payee_ifsc = $${paramCount++}`);
      values.push(data.payee_ifsc);
    }

    if (data.payee_branch !== undefined) {
      fields.push(`payee_branch = $${paramCount++}`);
      values.push(data.payee_branch);
    }

    if (data.taxable_amount !== undefined) {
      fields.push(`taxable_amount = $${paramCount++}`);
      values.push(data.taxable_amount);
    }

    if (data.cgst_amount !== undefined) {
      fields.push(`cgst_amount = $${paramCount++}`);
      values.push(data.cgst_amount);
    }

    if (data.sgst_amount !== undefined) {
      fields.push(`sgst_amount = $${paramCount++}`);
      values.push(data.sgst_amount);
    }

    if (data.igst_amount !== undefined) {
      fields.push(`igst_amount = $${paramCount++}`);
      values.push(data.igst_amount);
    }

    if (data.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(data.notes);
    }

    if (data.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(data.updated_by);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    if (fields.length === 1) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE expenses
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  async updateStatus(id: string, status: ExpenseStatus): Promise<Expense | null> {
    const query = `
      UPDATE expenses
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await db.query(query, [status, id]);
    return result.rows[0] || null;
  }

  async updatePaymentProof(id: string, paymentProofUrl: string): Promise<Expense | null> {
    const query = `
      UPDATE expenses
      SET payment_proof_url = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await db.query(query, [paymentProofUrl, id]);
    return result.rows[0] || null;
  }

  async updateBillPdf(id: string, billPdfUrl: string): Promise<Expense | null> {
    const query = `
      UPDATE expenses
      SET bill_pdf_url = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await db.query(query, [billPdfUrl, id]);
    return result.rows[0] || null;
  }

  async updateTotals(
    id: string,
    subtotal: number,
    overheadTotal: number,
    taxAmount: number,
    totalAmount: number
  ): Promise<Expense | null> {
    const query = `
      UPDATE expenses
      SET 
        subtotal = $1,
        overhead_total = $2,
        tax_amount = $3,
        total_amount = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    const result = await db.query(query, [subtotal, overheadTotal, taxAmount, totalAmount, id]);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM expenses WHERE id = $1';
    const result = await db.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private getFinancialYearFromDate(dateString: string): string {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 0-indexed

    // Financial year runs April-March
    if (month >= 4) {
      return `${year}-${year + 1}`;
    } else {
      return `${year - 1}-${year}`;
    }
  }
}

export const expenseDAO = new ExpenseDAO();
