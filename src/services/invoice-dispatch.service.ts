import { db } from '../database/connection';
import { PoolClient } from 'pg';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { invoiceDispatchAllocationDAO } from '../dao/invoice-dispatch-allocation.dao';
import { invoiceNumberSequenceDAO } from '../dao/invoice-number-sequence.dao';
import { salesSaudaDAO } from '../dao/sales-sauda.dao';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { inventoryLedgerDAO } from '../dao/inventory-ledger.dao';
import { godownDAO } from '../dao/godown.dao';
import { godownService } from './godown.service';
import { financialYearFromDate } from '../constants/financial-year';
import {
  buildInvoiceSeriesKey,
  formatInternalInvoiceNumber,
  invoiceStateAlphaFromGstin,
  INVOICE_DOCUMENT_TYPE_BOS,
} from '../constants/invoice-number-series';
import { BadRequestError, NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import type { Address } from '../models/vendor.model';

function formatPartyAddress(addr: Address | undefined): string {
  if (!addr) return '';
  const parts = [addr.street, addr.city, addr.state, addr.pincode, addr.country].filter(Boolean);
  return parts.join(', ');
}

export class InvoiceDispatchService {
  /**
   * Next Bill of Supply internal invoice number for godown GST state + FY.
   * See constants/invoice-number-series.ts for format rules.
   */
  private async allocateInternalInvoiceNumber(
    godownId: string,
    dispatchDate?: string | Date | null
  ): Promise<{ internalInvoiceNumber: string; financialYear: string }> {
    const godown = await godownDAO.findById(godownId);
    if (!godown) throw new NotFoundError('Godown not found');
    const gstin = (godown.gst_number || '').trim();
    if (!gstin || gstin.length < 2) {
      throw new BadRequestError(
        'Godown GST number is required to generate internal invoice number'
      );
    }

    let stateAlpha: string;
    try {
      stateAlpha = invoiceStateAlphaFromGstin(gstin);
    } catch (err: any) {
      throw new BadRequestError(err?.message || 'Unsupported godown GST state for invoice numbering');
    }

    const fy = financialYearFromDate(
      dispatchDate != null && String(dispatchDate).trim() !== '' ? dispatchDate : new Date()
    );
    const seriesKey = buildInvoiceSeriesKey(stateAlpha, fy.label);
    const sequence = await invoiceNumberSequenceDAO.allocateNext(
      seriesKey,
      fy.label,
      stateAlpha,
      INVOICE_DOCUMENT_TYPE_BOS
    );

    return {
      internalInvoiceNumber: formatInternalInvoiceNumber({
        stateAlpha,
        financialYearLabel: fy.label,
        fyStartYear: fy.startYear,
        sequence,
      }),
      financialYear: fy.label,
    };
  }

  async list(
    salesSaudaId?: string,
    status?: 'draft' | 'confirmed',
    godownId?: string,
    financialYear?: string
  ) {
    return invoiceDispatchDAO.findAll(salesSaudaId, status, godownId, financialYear);
  }

  async getById(id: string) {
    const dispatch = await invoiceDispatchDAO.findById(id);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    const lines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(id);
    return { ...dispatch, lines };
  }

  async create(
    data: {
      sales_sauda_id: string;
      godown_id: string;
      dispatch_date?: string;
      transporter_id?: string;
      vehicle_id?: string;
      lr_number?: string | null;
      transportation_cost?: number | null;
      distance_km?: number;
      route_description?: string;
      usp?: string | null;
    },
    userId?: string
  ) {
    const sauda = await salesSaudaDAO.findById(data.sales_sauda_id);
    if (!sauda) throw new NotFoundError('Sales sauda not found');
    if (sauda.status !== 'order') throw new ValidationError('Sales sauda must be finalized (order) before creating dispatch');
    await godownService.assertActive(data.godown_id);
    const salesParty = await salesPartyDAO.findById(sauda.sales_party_id);
    if (!salesParty) throw new NotFoundError('Sales party not found');

    const party_name = salesParty.business_name;
    const party_address = formatPartyAddress(salesParty.address);
    const party_gst_number = salesParty.business_details?.gst_number ?? null;
    const party_pan_number = salesParty.business_details?.pan_number ?? null;

    const { internalInvoiceNumber, financialYear } = await this.allocateInternalInvoiceNumber(
      data.godown_id,
      data.dispatch_date
    );

    let dispatch;
    try {
      dispatch = await invoiceDispatchDAO.create({
        sales_sauda_id: data.sales_sauda_id,
        godown_id: data.godown_id,
        internal_invoice_number: internalInvoiceNumber,
        dispatch_date: data.dispatch_date,
        financial_year: financialYear,
        party_name,
        party_address,
        party_gst_number,
        party_pan_number,
        transporter_id: data.transporter_id,
        vehicle_id: data.vehicle_id,
        lr_number: data.lr_number,
        transportation_cost: data.transportation_cost,
        distance_km: data.distance_km,
        route_description: data.route_description,
        usp: data.usp,
        created_by: userId,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictError(
          'Invoice number already exists for this financial year'
        );
      }
      throw err;
    }

    const saudaLines = await salesSaudaLineDAO.findBySalesSaudaId(data.sales_sauda_id);
    for (const line of saudaLines) {
      await invoiceDispatchLineDAO.create({
        invoice_dispatch_id: dispatch.id,
        sales_sauda_line_id: line.id,
        product_id: line.product_id,
        packaging_id: line.packaging_id,
        quantity: line.quantity,
        quantity_unit: line.quantity_unit,
        rate: line.rate,
        amount: parseFloat(line.amount.toString()),
      });
    }

    return this.getById(dispatch.id);
  }

  async confirm(id: string, userId?: string) {
    const dispatch = await invoiceDispatchDAO.findById(id);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    if (dispatch.status === 'confirmed') {
      return this.getById(id);
    }

    const lines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(id);
    if (lines.length === 0) throw new ValidationError('Invoice dispatch has no lines');

    await db.transaction(async (client: PoolClient) => {
      for (const line of lines) {
        const requiredKg = line.quantity_unit === 'kg' ? line.quantity : 0;
        if (requiredKg <= 0) continue;

        // Lock FGI rows for this product (and selected packaging when set) in FIFO order
        const usePackaging = line.packaging_id != null;
        const lockParams = usePackaging
          ? [dispatch.godown_id, line.product_id, line.packaging_id]
          : [dispatch.godown_id, line.product_id];
        const locked = await client.query(
          `SELECT id, godown_id, product_id, batch_id, packaging_id, no_of_packets, total_weight
           FROM finished_goods_inventory
           WHERE godown_id = $1 AND product_id = $2 ${usePackaging ? 'AND packaging_id = $3' : ''} AND total_weight > 0
           ORDER BY created_at ASC
           FOR UPDATE`,
          lockParams
        );

        if (locked.rows.length === 0) {
          const msg = usePackaging
            ? `Insufficient stock for product ${line.product_id} and selected packaging ${line.packaging_id}`
            : `Insufficient stock for product ${line.product_id}`;
          throw new ConflictError(msg);
        }

        let remaining = requiredKg;
        for (const row of locked.rows) {
          if (remaining <= 0) break;
          const avail = parseFloat(row.total_weight);
          if (avail <= 0) continue;
          const deduct = Math.min(avail, remaining);
          remaining -= deduct;

          const stockBefore = avail;
          const newWeight = Math.max(0, avail - deduct);
          let newPackets = row.no_of_packets;
          if (row.packaging_id) {
            const pkg = await packagingDAO.findById(row.packaging_id);
            const capacity = pkg ? Number(pkg.holding_capacity) : 1;
            const packetsToRemove = Math.min(row.no_of_packets, Math.ceil(deduct / capacity));
            newPackets = Math.max(0, row.no_of_packets - packetsToRemove);
          }
          // After migration 098, total_weight and no_of_packets allow 0 (row fully consumed)
          await client.query(
            `UPDATE finished_goods_inventory SET no_of_packets = $1, total_weight = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
            [newPackets, newWeight, row.id]
          );

          await invoiceDispatchAllocationDAO.create(
            {
              invoice_dispatch_id: id,
              invoice_dispatch_line_id: line.id,
              finished_goods_inventory_id: row.id,
              quantity_deducted: deduct,
            },
            client
          );

          await inventoryLedgerDAO.create(
            {
              product_id: line.product_id,
              godown_id: dispatch.godown_id,
              quantity_change: -deduct,
              source_type: 'sales_dispatch',
              source_id: id,
              stock_before: stockBefore,
              stock_after: newWeight,
              reference_type: 'invoice_dispatch',
              reference_id: id,
              batch_id: row.batch_id,
              packaging_id: row.packaging_id,
              created_by: userId,
            },
            client
          );
        }

        if (remaining > 0.001) {
          const scope = usePackaging ? `product ${line.product_id} and packaging ${line.packaging_id}` : `product ${line.product_id}`;
          throw new ConflictError(`Insufficient stock for ${scope}: need ${requiredKg} kg, short by ${remaining} kg`);
        }
      }

      await client.query(
        `UPDATE invoice_dispatches SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP, updated_by = $1 WHERE id = $2`,
        [userId ?? null, id]
      );
    });

    return this.getById(id);
  }
}

export const invoiceDispatchService = new InvoiceDispatchService();
