import { db } from '../database/connection';
import { expenseDAO } from '../dao/expense.dao';
import { expenseLineDAO } from '../dao/expense-line.dao';
import { expenseOverheadDAO } from '../dao/expense-overhead.dao';
import { expenseEntityLinkDAO } from '../dao/expense-entity-link.dao';
import { expenseCategoryDAO } from '../dao/expense-category.dao';
import {
  Expense,
  CreateExpenseDTO,
  UpdateExpenseDTO,
  ExpenseResponse,
  ExpenseLineResponse,
  ExpenseOverheadResponse,
  ExpenseEntityLinkResponse,
  ExpenseStatus,
} from '../models/expense.model';
import { NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { expenseLinkingService } from './expense-linking.service';

export function toExpenseLineResponse(line: any): ExpenseLineResponse {
  return {
    id: line.id,
    line_number: line.line_number,
    description: line.description,
    quantity: line.quantity ? parseFloat(line.quantity) : null,
    unit: line.unit,
    rate: line.rate ? parseFloat(line.rate) : null,
    amount: parseFloat(line.amount),
    reference_number: line.reference_number,
    reference_date: line.reference_date ? line.reference_date.toISOString().split('T')[0] : null,
    vehicle_number: line.vehicle_number,
    from_location: line.from_location,
    to_location: line.to_location,
  };
}

export function toExpenseOverheadResponse(overhead: any): ExpenseOverheadResponse {
  return {
    id: overhead.id,
    charge_name: overhead.charge_name,
    charge_amount: parseFloat(overhead.charge_amount),
  };
}

export async function toExpenseEntityLinkResponse(link: any): Promise<ExpenseEntityLinkResponse> {
  const displayName = await expenseLinkingService.resolveEntityDisplayName(
    link.entity_type,
    link.entity_id
  );

  return {
    id: link.id,
    entity_type: link.entity_type,
    entity_id: link.entity_id,
    entity_display: displayName,
  };
}

export async function toExpenseResponse(
  expense: Expense,
  lines: any[],
  overheads: any[],
  links: any[],
  categoryName?: string,
  categoryCode?: string
): Promise<ExpenseResponse> {
  const entityLinkResponses = await Promise.all(
    links.map((link) => toExpenseEntityLinkResponse(link))
  );

  return {
    id: expense.id,
    expense_category_id: expense.expense_category_id,
    expense_category_name: categoryName,
    expense_category_code: categoryCode,
    expense_number: expense.expense_number,
    financial_year: expense.financial_year,
    serial_number: expense.serial_number,
    expense_date: expense.expense_date.toISOString().split('T')[0],
    payee_type: expense.payee_type,
    payee_id: expense.payee_id,
    payee_name: expense.payee_name,
    payee_gst_number: expense.payee_gst_number,
    payee_bank_name: expense.payee_bank_name,
    payee_account_number: expense.payee_account_number,
    payee_ifsc: expense.payee_ifsc,
    payee_branch: expense.payee_branch,
    subtotal: parseFloat(expense.subtotal.toString()),
    overhead_total: parseFloat(expense.overhead_total.toString()),
    taxable_amount: expense.taxable_amount ? parseFloat(expense.taxable_amount.toString()) : null,
    cgst_amount: parseFloat(expense.cgst_amount.toString()),
    sgst_amount: parseFloat(expense.sgst_amount.toString()),
    igst_amount: parseFloat(expense.igst_amount.toString()),
    tax_amount: parseFloat(expense.tax_amount.toString()),
    total_amount: parseFloat(expense.total_amount.toString()),
    status: expense.status,
    bill_pdf_url: expense.bill_pdf_url,
    payment_proof_url: expense.payment_proof_url,
    notes: expense.notes,
    created_at: expense.created_at.toISOString(),
    updated_at: expense.updated_at.toISOString(),
    lines: lines.map(toExpenseLineResponse),
    overheads: overheads.map(toExpenseOverheadResponse),
    entity_links: entityLinkResponses,
  };
}

export class ExpenseService {
  async createExpense(data: CreateExpenseDTO): Promise<ExpenseResponse> {
    // Validate category exists
    const category = await expenseCategoryDAO.findById(data.expense_category_id);
    if (!category) {
      throw new NotFoundError('Expense category not found');
    }

    if (!category.is_active) {
      throw new ValidationError('Cannot create expense for inactive category');
    }

    // Validate entity links
    if (data.entity_links && data.entity_links.length > 0) {
      await expenseLinkingService.validateEntityLinks(data.entity_links, {
        transporter_id:
          data.payee_type === 'transporter' ? data.payee_id || undefined : undefined,
      });
    }

    // Begin transaction
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Create expense header
      const expense = await expenseDAO.create(data);

      // Create lines if provided
      let lines: any[] = [];
      if (data.lines && data.lines.length > 0) {
        lines = await expenseLineDAO.createMany(expense.id, data.lines);
      }

      // Create overheads if provided
      let overheads: any[] = [];
      if (data.overheads && data.overheads.length > 0) {
        overheads = await expenseOverheadDAO.createMany(expense.id, data.overheads);
      }

      // Create entity links if provided
      let entityLinks: any[] = [];
      if (data.entity_links && data.entity_links.length > 0) {
        entityLinks = await expenseEntityLinkDAO.createMany(expense.id, data.entity_links);
      }

      // Calculate and update totals
      const subtotal = await expenseLineDAO.calculateSubtotal(expense.id);
      const overheadTotal = await expenseOverheadDAO.calculateTotal(expense.id);
      const taxAmount =
        (data.cgst_amount || 0) + (data.sgst_amount || 0) + (data.igst_amount || 0);
      const totalAmount = subtotal + overheadTotal + taxAmount;

      const updatedExpense = await expenseDAO.updateTotals(
        expense.id,
        subtotal,
        overheadTotal,
        taxAmount,
        totalAmount
      );

      if (!updatedExpense) {
        throw new Error('Failed to update expense totals');
      }

      await client.query('COMMIT');

      logger.info('Expense created', {
        expense_id: updatedExpense.id,
        expense_number: updatedExpense.expense_number,
        category: category.name,
        total_amount: totalAmount,
      });

      return await toExpenseResponse(
        updatedExpense,
        lines,
        overheads,
        entityLinks,
        category.name,
        category.code
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateExpense(id: string, data: UpdateExpenseDTO): Promise<ExpenseResponse> {
    const existing = await expenseDAO.findById(id);
    if (!existing) {
      throw new NotFoundError('Expense not found');
    }

    if (existing.status !== 'draft') {
      throw new ValidationError('Can only update expenses in draft status');
    }

    // Validate category if changing
    let category = await expenseCategoryDAO.findById(existing.expense_category_id);
    if (data.expense_category_id && data.expense_category_id !== existing.expense_category_id) {
      category = await expenseCategoryDAO.findById(data.expense_category_id);
      if (!category) {
        throw new NotFoundError('Expense category not found');
      }
      if (!category.is_active) {
        throw new ValidationError('Cannot update to inactive category');
      }
    }

    // Validate entity links if provided
    if (data.entity_links && data.entity_links.length > 0) {
      const payeeType = data.payee_type ?? existing.payee_type;
      const payeeId = data.payee_id !== undefined ? data.payee_id : existing.payee_id;
      await expenseLinkingService.validateEntityLinks(data.entity_links, {
        transporter_id:
          payeeType === 'transporter' ? payeeId || undefined : undefined,
      });
    }

    // Begin transaction
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Update expense header
      const updatedExpense = await expenseDAO.update(id, data);
      if (!updatedExpense) {
        throw new NotFoundError('Expense not found after update');
      }

      // Replace lines if provided
      let lines: any[] = [];
      if (data.lines !== undefined) {
        await expenseLineDAO.deleteByExpenseId(id);
        if (data.lines.length > 0) {
          lines = await expenseLineDAO.createMany(id, data.lines);
        }
      } else {
        lines = await expenseLineDAO.findByExpenseId(id);
      }

      // Replace overheads if provided
      let overheads: any[] = [];
      if (data.overheads !== undefined) {
        await expenseOverheadDAO.deleteByExpenseId(id);
        if (data.overheads.length > 0) {
          overheads = await expenseOverheadDAO.createMany(id, data.overheads);
        }
      } else {
        overheads = await expenseOverheadDAO.findByExpenseId(id);
      }

      // Replace entity links if provided
      let entityLinks: any[] = [];
      if (data.entity_links !== undefined) {
        await expenseEntityLinkDAO.deleteByExpenseId(id);
        if (data.entity_links.length > 0) {
          entityLinks = await expenseEntityLinkDAO.createMany(id, data.entity_links);
        }
      } else {
        entityLinks = await expenseEntityLinkDAO.findByExpenseId(id);
      }

      // Recalculate totals
      const subtotal = await expenseLineDAO.calculateSubtotal(id);
      const overheadTotal = await expenseOverheadDAO.calculateTotal(id);
      const cgst = data.cgst_amount !== undefined ? data.cgst_amount : parseFloat(updatedExpense.cgst_amount.toString());
      const sgst = data.sgst_amount !== undefined ? data.sgst_amount : parseFloat(updatedExpense.sgst_amount.toString());
      const igst = data.igst_amount !== undefined ? data.igst_amount : parseFloat(updatedExpense.igst_amount.toString());
      const taxAmount = cgst + sgst + igst;
      const totalAmount = subtotal + overheadTotal + taxAmount;

      const finalExpense = await expenseDAO.updateTotals(
        id,
        subtotal,
        overheadTotal,
        taxAmount,
        totalAmount
      );

      if (!finalExpense) {
        throw new Error('Failed to update expense totals');
      }

      await client.query('COMMIT');

      logger.info('Expense updated', {
        expense_id: finalExpense.id,
        expense_number: finalExpense.expense_number,
      });

      return await toExpenseResponse(
        finalExpense,
        lines,
        overheads,
        entityLinks,
        category?.name,
        category?.code
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getExpenseById(id: string): Promise<ExpenseResponse> {
    const expense = await expenseDAO.findById(id);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    const category = await expenseCategoryDAO.findById(expense.expense_category_id);
    const lines = await expenseLineDAO.findByExpenseId(id);
    const overheads = await expenseOverheadDAO.findByExpenseId(id);
    const entityLinks = await expenseEntityLinkDAO.findByExpenseId(id);

    return await toExpenseResponse(
      expense,
      lines,
      overheads,
      entityLinks,
      category?.name,
      category?.code
    );
  }

  async updateStatus(id: string, status: ExpenseStatus): Promise<ExpenseResponse> {
    const expense = await expenseDAO.findById(id);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    const updated = await expenseDAO.updateStatus(id, status);
    if (!updated) {
      throw new NotFoundError('Expense not found after status update');
    }

    logger.info('Expense status updated', {
      expense_id: updated.id,
      expense_number: updated.expense_number,
      old_status: expense.status,
      new_status: status,
    });

    return await this.getExpenseById(id);
  }

  async confirmExpense(id: string): Promise<ExpenseResponse> {
    const expense = await expenseDAO.findById(id);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    if (expense.status !== 'draft') {
      throw new ValidationError('Can only confirm expenses in draft status');
    }

    if (expense.total_amount <= 0) {
      throw new ValidationError('Cannot confirm expense with zero or negative total');
    }

    const updated = await expenseDAO.updateStatus(id, 'approved');
    if (!updated) {
      throw new NotFoundError('Expense not found after status update');
    }

    logger.info('Expense confirmed', {
      expense_id: updated.id,
      expense_number: updated.expense_number,
    });

    return await this.getExpenseById(id);
  }

  async markAsPaid(id: string, paymentProofUrl: string): Promise<ExpenseResponse> {
    const expense = await expenseDAO.findById(id);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    if (expense.status !== 'approved') {
      throw new ValidationError('Can only mark approved expenses as paid');
    }

    const updated = await expenseDAO.updatePaymentProof(id, paymentProofUrl);
    if (!updated) {
      throw new NotFoundError('Expense not found after update');
    }

    const finalExpense = await expenseDAO.updateStatus(id, 'paid');
    if (!finalExpense) {
      throw new NotFoundError('Expense not found after status update');
    }

    logger.info('Expense marked as paid', {
      expense_id: finalExpense.id,
      expense_number: finalExpense.expense_number,
    });

    return await this.getExpenseById(id);
  }

  async cancelExpense(id: string, reason?: string): Promise<ExpenseResponse> {
    const expense = await expenseDAO.findById(id);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    if (expense.status === 'rejected') {
      throw new ValidationError('Expense is already rejected');
    }

    const updated = await expenseDAO.updateStatus(id, 'rejected');
    if (!updated) {
      throw new NotFoundError('Expense not found after status update');
    }

    if (reason) {
      await expenseDAO.update(id, { notes: reason });
    }

    logger.info('Expense cancelled', {
      expense_id: updated.id,
      expense_number: updated.expense_number,
      reason,
    });

    return await this.getExpenseById(id);
  }

  async deleteExpense(id: string): Promise<void> {
    const expense = await expenseDAO.findById(id);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    if (expense.status !== 'draft') {
      throw new ValidationError('Can only delete expenses in draft status');
    }

    const deleted = await expenseDAO.delete(id);
    if (!deleted) {
      throw new NotFoundError('Expense not found or could not be deleted');
    }

    logger.info('Expense deleted', {
      expense_id: id,
      expense_number: expense.expense_number,
    });
  }
}

export const expenseService = new ExpenseService();
