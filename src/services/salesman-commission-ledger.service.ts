import { PoolClient } from 'pg';
import { salesSaudaDAO } from '../dao/sales-sauda.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { creditNoteDAO } from '../dao/credit-note.dao';
import { creditNoteLineDAO } from '../dao/credit-note-line.dao';
import { productDAO } from '../dao/product.dao';
import { salesmanCommissionEntryDAO } from '../dao/salesman-commission-entry.dao';
import {
  SalesmanCommissionEntry,
  SalesmanCommissionEntryStatus,
} from '../models/salesman-commission-entry.model';
import type { SalesmanCommissionConfig } from '../constants/salesman-commission-types';
import { computeSalesmanCommission } from './salesman-commission';
import { NotFoundError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

/**
 * Accrue / reverse salesman commission against the Phase-1 sauda snapshot.
 * Called from invoice-dispatch confirm and credit-note confirm (same DB transaction).
 */
export class SalesmanCommissionLedgerService {
  /**
   * Create accrual on dispatch confirm.
   * Skips: godown_transfer, no salesman, no commission snapshot, already accrued.
   * fixed_per_transaction: only on the first accrual for that sauda.
   */
  async accrueOnDispatchConfirm(
    invoiceDispatchId: string,
    userId?: string,
    client?: PoolClient
  ): Promise<SalesmanCommissionEntry | null> {
    const existing = await salesmanCommissionEntryDAO.findAccrualByDispatchId(
      invoiceDispatchId,
      client
    );
    if (existing) return existing;

    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');

    const sauda = await salesSaudaDAO.findById(dispatch.sales_sauda_id);
    if (!sauda) throw new NotFoundError('Sales sauda not found');

    if (sauda.movement_type === 'godown_transfer') return null;
    if (!sauda.salesman_id || !sauda.salesman_commission_type || !sauda.salesman_commission_config) {
      return null;
    }

    const lines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (lines.length === 0) return null;

    const basisLines = [];
    let quantityKg = 0;
    let saleAmount = 0;
    for (const line of lines) {
      const qty = Number(line.quantity) || 0;
      const amount = Number(line.amount) || 0;
      quantityKg += qty;
      saleAmount += amount;
      const product = await productDAO.findById(line.product_id);
      basisLines.push({
        rice_type: product?.rice_type ?? null,
        quantity_kg: qty,
        sale_amount: amount,
      });
    }
    quantityKg = round3(quantityKg);
    saleAmount = round2(saleAmount);

    let commissionAmount = 0;
    if (sauda.salesman_commission_type === 'fixed_per_transaction') {
      const alreadyAccrued = await salesmanCommissionEntryDAO.hasAccrualForSauda(
        sauda.id,
        client
      );
      if (alreadyAccrued) {
        logger.info('Skipping fixed_per_transaction commission; sauda already accrued', {
          salesSaudaId: sauda.id,
          invoiceDispatchId,
        });
        return null;
      }
      commissionAmount = computeSalesmanCommission({
        type: 'fixed_per_transaction',
        config: sauda.salesman_commission_config,
        quantity_kg: quantityKg,
        sale_amount: saleAmount,
      });
    } else {
      commissionAmount = computeSalesmanCommission({
        type: sauda.salesman_commission_type,
        config: sauda.salesman_commission_config,
        quantity_kg: quantityKg,
        sale_amount: saleAmount,
        lines: basisLines,
      });
    }

    if (commissionAmount === 0) {
      logger.info('Commission accrual amount is 0; skipping entry', { invoiceDispatchId });
      return null;
    }

    return salesmanCommissionEntryDAO.create(
      {
        salesman_id: sauda.salesman_id,
        sales_sauda_id: sauda.id,
        invoice_dispatch_id: invoiceDispatchId,
        credit_note_id: null,
        entry_type: 'accrual',
        commission_type: sauda.salesman_commission_type,
        commission_config: sauda.salesman_commission_config as SalesmanCommissionConfig,
        basis_quantity: quantityKg,
        basis_sale_amount: saleAmount,
        commission_amount: commissionAmount,
        status: 'pending',
        created_by: userId ?? null,
      },
      client
    );
  }

  /**
   * Reverse commission for returned qty on credit note confirm.
   * Uses same snapshot rates; amount is negative.
   */
  async reverseOnCreditNoteConfirm(
    creditNoteId: string,
    userId?: string,
    client?: PoolClient
  ): Promise<SalesmanCommissionEntry | null> {
    const existing = await salesmanCommissionEntryDAO.findReversalByCreditNoteId(
      creditNoteId,
      client
    );
    if (existing) return existing;

    const cn = await creditNoteDAO.findById(creditNoteId);
    if (!cn) throw new NotFoundError('Credit note not found');

    const sauda = await salesSaudaDAO.findById(cn.sales_sauda_id);
    if (!sauda) throw new NotFoundError('Sales sauda not found');

    if (sauda.movement_type === 'godown_transfer') return null;
    if (!sauda.salesman_id || !sauda.salesman_commission_type || !sauda.salesman_commission_config) {
      return null;
    }

    const accrual = await salesmanCommissionEntryDAO.findAccrualByDispatchId(
      cn.invoice_dispatch_id,
      client
    );
    // If never accrued (e.g. no commission on sauda), nothing to reverse
    if (!accrual && sauda.salesman_commission_type === 'fixed_per_transaction') {
      // Fixed was possibly on another dispatch of same sauda — still reverse proportional? 
      // For fixed, reverse is 0 unless we choose to claw back — skip if no dispatch accrual.
      return null;
    }

    const cnLines = await creditNoteLineDAO.findByCreditNoteId(creditNoteId);
    if (cnLines.length === 0) return null;

    const dispatchLines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(
      cn.invoice_dispatch_id
    );
    const dispatchLineById = new Map(dispatchLines.map((l) => [l.id, l]));

    const basisLines = [];
    let quantityKg = 0;
    let saleAmount = 0;

    for (const cnLine of cnLines) {
      const returned = Number(cnLine.quantity_returned) || 0;
      if (returned <= 0) continue;
      const dLine = dispatchLineById.get(cnLine.invoice_dispatch_line_id);
      const rate = dLine ? Number(dLine.rate) || 0 : 0;
      const amount = round2(returned * rate);
      quantityKg += returned;
      saleAmount += amount;
      const product = await productDAO.findById(cnLine.product_id);
      basisLines.push({
        rice_type: product?.rice_type ?? null,
        quantity_kg: returned,
        sale_amount: amount,
      });
    }

    quantityKg = round3(quantityKg);
    saleAmount = round2(saleAmount);
    if (quantityKg <= 0) return null;

    // fixed_per_transaction: no automatic clawback on partial returns (only qty-based types)
    if (sauda.salesman_commission_type === 'fixed_per_transaction') {
      logger.info('Skipping fixed_per_transaction reversal on credit note', {
        creditNoteId,
      });
      return null;
    }

    const positive = computeSalesmanCommission({
      type: sauda.salesman_commission_type,
      config: sauda.salesman_commission_config,
      quantity_kg: quantityKg,
      sale_amount: saleAmount,
      lines: basisLines,
    });

    if (positive === 0) return null;

    return salesmanCommissionEntryDAO.create(
      {
        salesman_id: sauda.salesman_id,
        sales_sauda_id: sauda.id,
        invoice_dispatch_id: cn.invoice_dispatch_id,
        credit_note_id: creditNoteId,
        entry_type: 'reversal',
        commission_type: sauda.salesman_commission_type,
        commission_config: sauda.salesman_commission_config as SalesmanCommissionConfig,
        basis_quantity: quantityKg,
        basis_sale_amount: saleAmount,
        commission_amount: -Math.abs(positive),
        status: 'pending',
        created_by: userId ?? null,
      },
      client
    );
  }

  async list(filters: {
    salesmanId?: string;
    status?: SalesmanCommissionEntryStatus;
    from?: string;
    to?: string;
  }): Promise<SalesmanCommissionEntry[]> {
    return salesmanCommissionEntryDAO.list(filters);
  }

  async approve(id: string, userId?: string): Promise<SalesmanCommissionEntry> {
    const existing = await salesmanCommissionEntryDAO.findById(id);
    if (!existing) throw new NotFoundError('Commission entry not found');
    if (existing.status !== 'pending') {
      throw new ConflictError(`Cannot approve entry in status '${existing.status}'`);
    }
    const updated = await salesmanCommissionEntryDAO.setStatus(id, 'approved', userId);
    if (!updated) throw new ConflictError('Commission entry could not be approved');
    return updated;
  }

  async markPaid(id: string, userId?: string): Promise<SalesmanCommissionEntry> {
    const existing = await salesmanCommissionEntryDAO.findById(id);
    if (!existing) throw new NotFoundError('Commission entry not found');
    if (existing.status === 'paid') return existing;
    if (existing.status !== 'pending' && existing.status !== 'approved') {
      throw new ConflictError(`Cannot mark paid from status '${existing.status}'`);
    }
    const updated = await salesmanCommissionEntryDAO.setStatus(id, 'paid', userId);
    if (!updated) throw new ConflictError('Commission entry could not be marked paid');
    return updated;
  }

  async getById(id: string): Promise<SalesmanCommissionEntry> {
    const entry = await salesmanCommissionEntryDAO.findById(id);
    if (!entry) throw new NotFoundError('Commission entry not found');
    return entry;
  }
}

export const salesmanCommissionLedgerService = new SalesmanCommissionLedgerService();
