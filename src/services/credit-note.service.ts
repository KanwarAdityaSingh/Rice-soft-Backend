import { db } from '../database/connection';
import { PoolClient } from 'pg';
import { creditNoteDAO } from '../dao/credit-note.dao';
import { creditNoteLineDAO } from '../dao/credit-note-line.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { invoiceDispatchAllocationDAO } from '../dao/invoice-dispatch-allocation.dao';
import { finishedGoodsInventoryDAO } from '../dao/finished-goods-inventory.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { inventoryLedgerDAO } from '../dao/inventory-ledger.dao';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';

export class CreditNoteService {
  async list(invoiceDispatchId?: string, status?: 'draft' | 'confirmed') {
    return creditNoteDAO.findAll(invoiceDispatchId, status);
  }

  async getById(id: string) {
    const cn = await creditNoteDAO.findById(id);
    if (!cn) throw new NotFoundError('Credit note not found');
    const lines = await creditNoteLineDAO.findByCreditNoteId(id);
    return { ...cn, lines };
  }

  async create(
    data: {
      invoice_dispatch_id: string;
      sales_sauda_id: string;
      credit_note_number: string;
      credit_note_date?: string;
      reason?: string;
      lines: Array<{ invoice_dispatch_line_id: string; product_id: string; quantity_returned: number }>;
    },
    userId?: string
  ) {
    const dispatch = await invoiceDispatchDAO.findById(data.invoice_dispatch_id);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    if (dispatch.status !== 'confirmed') throw new ValidationError('Invoice dispatch must be confirmed');

    const dispatchLines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(data.invoice_dispatch_id);
    const dispatchLineMap = new Map(dispatchLines.map((l) => [l.id, l]));

    for (const line of data.lines) {
      const dl = dispatchLineMap.get(line.invoice_dispatch_line_id);
      if (!dl) throw new ValidationError(`Invoice dispatch line not found: ${line.invoice_dispatch_line_id}`);
      const maxQty = parseFloat(dl.quantity.toString());
      if (line.quantity_returned > maxQty || line.quantity_returned <= 0) {
        throw new ValidationError(`quantity_returned must be > 0 and <= ${maxQty} for line ${line.invoice_dispatch_line_id}`);
      }
    }

    const creditNote = await creditNoteDAO.create({
      invoice_dispatch_id: data.invoice_dispatch_id,
      sales_sauda_id: data.sales_sauda_id,
      credit_note_number: data.credit_note_number,
      credit_note_date: data.credit_note_date,
      reason: data.reason,
      created_by: userId,
    });

    for (const line of data.lines) {
      await creditNoteLineDAO.create({
        credit_note_id: creditNote.id,
        invoice_dispatch_line_id: line.invoice_dispatch_line_id,
        product_id: line.product_id,
        quantity_returned: line.quantity_returned,
      });
    }

    return this.getById(creditNote.id);
  }

  async confirm(id: string, userId?: string) {
    const cn = await creditNoteDAO.findById(id);
    if (!cn) throw new NotFoundError('Credit note not found');
    if (cn.status === 'confirmed') return this.getById(id);
    const dispatch = await invoiceDispatchDAO.findById(cn.invoice_dispatch_id);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');

    const lines = await creditNoteLineDAO.findByCreditNoteId(id);
    if (lines.length === 0) throw new ValidationError('Credit note has no lines');

    await db.transaction(async (client: PoolClient) => {
      for (const line of lines) {
        const toRestore = parseFloat(line.quantity_returned.toString());
        const allocations = await invoiceDispatchAllocationDAO.findByInvoiceDispatchLineId(line.invoice_dispatch_line_id);
        if (allocations.length === 0) {
          const fgiRows = await finishedGoodsInventoryDAO.findAll(line.product_id, undefined, dispatch.godown_id);
          if (fgiRows.length === 0) throw new ConflictError(`No FGI row found for product ${line.product_id} to restore into`);
          const row = fgiRows[0];
          const stockBefore = parseFloat(row.total_weight.toString());
          const newWeight = stockBefore + toRestore;
          await client.query(
            `UPDATE finished_goods_inventory SET total_weight = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [newWeight, row.id]
          );
          await inventoryLedgerDAO.create(
            {
              godown_id: dispatch.godown_id,
              product_id: line.product_id,
              quantity_change: toRestore,
              source_type: 'sale_return',
              source_id: id,
              stock_before: stockBefore,
              stock_after: newWeight,
              reference_type: 'credit_note',
              reference_id: id,
              batch_id: row.batch_id,
              packaging_id: row.packaging_id,
              created_by: userId,
            },
            client
          );
          continue;
        }

        let remaining = toRestore;
        for (const alloc of allocations) {
          if (remaining <= 0) break;
          const fgi = await finishedGoodsInventoryDAO.findById(alloc.finished_goods_inventory_id);
          if (!fgi) continue;
          const addBack = Math.min(remaining, parseFloat(alloc.quantity_deducted.toString()));
          remaining -= addBack;
          const stockBefore = parseFloat(fgi.total_weight.toString());
          const newWeight = stockBefore + addBack;
          let newPackets = fgi.no_of_packets;
          if (fgi.packaging_id) {
            const pkg = await packagingDAO.findById(fgi.packaging_id);
            const capacity = pkg ? Number(pkg.holding_capacity) : 1;
            newPackets = fgi.no_of_packets + Math.ceil(addBack / capacity);
          }
          await client.query(
            `UPDATE finished_goods_inventory SET no_of_packets = $1, total_weight = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
            [newPackets, newWeight, fgi.id]
          );
          await inventoryLedgerDAO.create(
            {
              godown_id: dispatch.godown_id,
              product_id: line.product_id,
              quantity_change: addBack,
              source_type: 'sale_return',
              source_id: id,
              stock_before: stockBefore,
              stock_after: newWeight,
              reference_type: 'credit_note',
              reference_id: id,
              batch_id: fgi.batch_id,
              packaging_id: fgi.packaging_id,
              created_by: userId,
            },
            client
          );
        }
        if (remaining > 0.001) {
          const fgiRows = await finishedGoodsInventoryDAO.findAll(line.product_id, undefined, dispatch.godown_id);
          const row = fgiRows[0];
          if (!row) throw new ConflictError(`No FGI row for product ${line.product_id}`);
          const stockBefore = parseFloat(row.total_weight.toString());
          const newWeight = stockBefore + remaining;
          await client.query(
            `UPDATE finished_goods_inventory SET total_weight = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [newWeight, row.id]
          );
          await inventoryLedgerDAO.create(
            {
              godown_id: dispatch.godown_id,
              product_id: line.product_id,
              quantity_change: remaining,
              source_type: 'sale_return',
              source_id: id,
              stock_before: stockBefore,
              stock_after: newWeight,
              reference_type: 'credit_note',
              reference_id: id,
              batch_id: row.batch_id,
              packaging_id: row.packaging_id,
              created_by: userId,
            },
            client
          );
        }
      }

      await client.query(
        `UPDATE credit_notes SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP, updated_by = $1 WHERE id = $2`,
        [userId ?? null, id]
      );
    });

    return this.getById(id);
  }
}

export const creditNoteService = new CreditNoteService();
