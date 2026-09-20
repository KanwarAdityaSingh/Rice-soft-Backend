import { PoolClient } from 'pg';
import { brokerCommissionEntryDAO } from '../dao/broker-commission-entry.dao';
import { creditNoteDAO } from '../dao/credit-note.dao';
import { creditNoteLineDAO } from '../dao/credit-note-line.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { invoiceDispatchSaudaDAO } from '../dao/invoice-dispatch-sauda.dao';
import { salesSaudaDAO } from '../dao/sales-sauda.dao';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import type { BrokerCommissionEntry } from '../models/broker-commission-entry.model';
import type { BrokerCommissionType } from '../models/sauda.model';
import { NotFoundError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';
import { computeSalesBrokerCommission } from './sales-broker-commission';

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

export class BrokerCommissionLedgerService {
  async accrueOnDispatchConfirm(
    invoiceDispatchId: string,
    userId?: string,
    client?: PoolClient
  ): Promise<BrokerCommissionEntry[]> {
    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');

    let saudaIds = await invoiceDispatchSaudaDAO.getLinkedSaudaIds(invoiceDispatchId, client);
    if (saudaIds.length === 0) {
      saudaIds = [dispatch.sales_sauda_id];
    }

    const dispatchLines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (dispatchLines.length === 0) return [];

    const lineToSauda = new Map<string, string>();
    for (const saudaId of saudaIds) {
      const saudaLines = await salesSaudaLineDAO.findBySalesSaudaId(saudaId, client);
      for (const sl of saudaLines) {
        lineToSauda.set(sl.id, saudaId);
      }
    }

    const linesBySauda = new Map<string, typeof dispatchLines>();
    for (const line of dispatchLines) {
      const saudaId = line.sales_sauda_line_id
        ? lineToSauda.get(line.sales_sauda_line_id)
        : undefined;
      const owner = saudaId ?? dispatch.sales_sauda_id;
      const list = linesBySauda.get(owner) ?? [];
      list.push(line);
      linesBySauda.set(owner, list);
    }

    const created: BrokerCommissionEntry[] = [];

    for (const saudaId of saudaIds) {
      const existing = await brokerCommissionEntryDAO.findAccrualByDispatchAndSauda(
        invoiceDispatchId,
        saudaId,
        client
      );
      if (existing) {
        created.push(existing);
        continue;
      }

      const sauda = await salesSaudaDAO.findById(saudaId);
      if (!sauda) throw new NotFoundError(`Sales sauda not found: ${saudaId}`);

      if (sauda.movement_type === 'godown_transfer') continue;
      if (
        !sauda.broker_id ||
        sauda.broker_commission == null ||
        !sauda.broker_commission_type
      ) {
        continue;
      }

      const lines = linesBySauda.get(saudaId) ?? [];
      if (lines.length === 0) continue;

      let quantityKg = 0;
      let saleAmount = 0;
      for (const line of lines) {
        quantityKg += Number(line.quantity) || 0;
        saleAmount += Number(line.amount) || 0;
      }
      quantityKg = round3(quantityKg);
      saleAmount = round2(saleAmount);

      const commissionType = sauda.broker_commission_type as BrokerCommissionType;
      const rate = Number(sauda.broker_commission);

      if (commissionType === 'rupees') {
        const alreadyAccrued = await brokerCommissionEntryDAO.hasAccrualForSauda(
          sauda.id,
          client
        );
        if (alreadyAccrued) {
          logger.info('Skipping rupees broker commission; sauda already accrued', {
            salesSaudaId: sauda.id,
            invoiceDispatchId,
          });
          continue;
        }
      }

      const commissionAmount = computeSalesBrokerCommission({
        type: commissionType,
        rate,
        quantity_kg: quantityKg,
        sale_amount: saleAmount,
      });

      if (commissionAmount === 0) {
        logger.info('Broker commission accrual amount is 0; skipping', {
          invoiceDispatchId,
          salesSaudaId: sauda.id,
        });
        continue;
      }

      const entry = await brokerCommissionEntryDAO.create(
        {
          broker_id: sauda.broker_id,
          sales_sauda_id: sauda.id,
          invoice_dispatch_id: invoiceDispatchId,
          credit_note_id: null,
          entry_type: 'accrual',
          commission_type: commissionType,
          commission_rate: rate,
          basis_quantity: quantityKg,
          basis_sale_amount: saleAmount,
          commission_amount: commissionAmount,
          status: 'pending',
          created_by: userId ?? null,
        },
        client
      );
      created.push(entry);
    }

    return created;
  }

  async reverseOnCreditNoteConfirm(
    creditNoteId: string,
    userId?: string,
    client?: PoolClient
  ): Promise<BrokerCommissionEntry | null> {
    const existing = await brokerCommissionEntryDAO.findReversalByCreditNoteId(
      creditNoteId,
      client
    );
    if (existing) return existing;

    const cn = await creditNoteDAO.findById(creditNoteId);
    if (!cn) throw new NotFoundError('Credit note not found');

    const sauda = await salesSaudaDAO.findById(cn.sales_sauda_id);
    if (!sauda) throw new NotFoundError('Sales sauda not found');

    if (sauda.movement_type === 'godown_transfer') return null;
    if (
      !sauda.broker_id ||
      sauda.broker_commission == null ||
      !sauda.broker_commission_type
    ) {
      return null;
    }

    const commissionType = sauda.broker_commission_type as BrokerCommissionType;
    if (commissionType === 'rupees') {
      logger.info('Skipping rupees broker commission reversal on credit note', {
        creditNoteId,
      });
      return null;
    }

    const cnLines = await creditNoteLineDAO.findByCreditNoteId(creditNoteId);
    if (cnLines.length === 0) return null;

    const dispatchLines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(
      cn.invoice_dispatch_id
    );
    const dispatchLineById = new Map(dispatchLines.map((l) => [l.id, l]));

    let quantityKg = 0;
    let saleAmount = 0;
    for (const cnLine of cnLines) {
      const returned =
        Number(cnLine.quantity_credited) || Number(cnLine.quantity_returned) || 0;
      const dLine = dispatchLineById.get(cnLine.invoice_dispatch_line_id);
      const rate = dLine ? Number(dLine.rate) || 0 : 0;
      const stored = Number(cnLine.taxable_amount) || 0;
      quantityKg += returned;
      saleAmount += stored > 0 ? stored : round2(returned * rate);
    }
    quantityKg = round3(quantityKg);
    saleAmount = round2(saleAmount);
    if (quantityKg <= 0 && saleAmount <= 0) return null;

    const positive = computeSalesBrokerCommission({
      type: commissionType,
      rate: Number(sauda.broker_commission),
      quantity_kg: quantityKg,
      sale_amount: saleAmount,
    });
    if (positive === 0) return null;

    return brokerCommissionEntryDAO.create(
      {
        broker_id: sauda.broker_id,
        sales_sauda_id: sauda.id,
        invoice_dispatch_id: cn.invoice_dispatch_id,
        credit_note_id: creditNoteId,
        entry_type: 'reversal',
        commission_type: commissionType,
        commission_rate: Number(sauda.broker_commission),
        basis_quantity: quantityKg,
        basis_sale_amount: saleAmount,
        commission_amount: -Math.abs(positive),
        status: 'pending',
        created_by: userId ?? null,
      },
      client
    );
  }

  async voidPendingReversalOnCreditNoteCancel(
    creditNoteId: string,
    client?: PoolClient
  ): Promise<void> {
    const existing = await brokerCommissionEntryDAO.findReversalByCreditNoteId(
      creditNoteId,
      client
    );
    if (!existing) return;
    if (existing.status !== 'pending') {
      throw new ConflictError(
        `Cannot cancel credit note: broker commission reversal is ${existing.status}`
      );
    }
    await brokerCommissionEntryDAO.deletePendingReversalByCreditNoteId(creditNoteId, client);
  }
}

export const brokerCommissionLedgerService = new BrokerCommissionLedgerService();
