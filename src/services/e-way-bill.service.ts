import { eWayBillDAO } from '../dao/e-way-bill.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { mastersIndiaApiService } from './masters-india-api.service';
import {
  buildEWayBillPayload,
  loadSalesDocumentContext,
} from './masters-india-sales-document.service';

type EWayBillPayload = {
  id: string;
  invoice_dispatch_id: string | null;
  credit_note_id: string | null;
  eway_bill_number: string | null;
  vehicle_number: string | null;
  distance_km: number | null;
  route: string | null;
  transporter_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Awaited<ReturnType<typeof eWayBillDAO.create>>): EWayBillPayload {
  return {
    id: row.id,
    invoice_dispatch_id: row.invoice_dispatch_id,
    credit_note_id: row.credit_note_id,
    eway_bill_number: row.eway_bill_number,
    vehicle_number: row.vehicle_number,
    distance_km: row.distance_km != null ? parseFloat(row.distance_km.toString()) : null,
    route: row.route,
    transporter_id: row.transporter_id,
    payload: row.payload as Record<string, unknown> | null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class EWayBillService {
  async getByInvoiceDispatchId(invoiceDispatchId: string): Promise<EWayBillPayload[]> {
    const rows = await eWayBillDAO.findByInvoiceDispatchId(invoiceDispatchId);
    return rows.map(mapRow);
  }

  async generateForDispatch(
    invoiceDispatchId: string,
    data: {
      vehicle_number?: string;
      distance_km?: number;
      route?: string;
      transporter_id?: string;
      lr_number?: string | null;
    }
  ): Promise<EWayBillPayload> {
    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    if (dispatch.status !== 'confirmed') {
      throw new ConflictError('Invoice dispatch must be confirmed before generating e-way bill');
    }

    const existingRows = await eWayBillDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (existingRows.length > 0) {
      return mapRow(existingRows[0]);
    }

    const ctx = await loadSalesDocumentContext(invoiceDispatchId, {
      vehicle_number: data.vehicle_number,
      transporter_id: data.transporter_id || dispatch.transporter_id || undefined,
    });

    // Optional override of LR on generate (also persists for audit on the dispatch)
    const lrOverride =
      data.lr_number != null && String(data.lr_number).trim() !== ''
        ? String(data.lr_number).trim()
        : null;
    if (lrOverride) {
      ctx.dispatch.lr_number = lrOverride;
      await invoiceDispatchDAO.update(invoiceDispatchId, { lr_number: lrOverride });
    }

    if (!ctx.vehicleNumber) {
      throw new BadRequestError('Vehicle number is required for e-way bill generation');
    }

    const sellerPin = (ctx.shipFromAddress.pincode || '').replace(/\D/g, '').slice(0, 6);
    const shipToPin = (ctx.shipToAddress.pincode || '').replace(/\D/g, '').slice(0, 6);
    if (!sellerPin || !shipToPin) {
      throw new BadRequestError(
        'Ship-from (godown) and ship-to (delivery) pincodes are required for e-way bill generation'
      );
    }

    let distanceKm = data.distance_km ?? (dispatch.distance_km != null ? Number(dispatch.distance_km) : null);
    if (distanceKm == null || Number.isNaN(distanceKm)) {
      distanceKm = await mastersIndiaApiService.calculateDistanceKm({
        fromPincode: sellerPin,
        toPincode: shipToPin,
        userGstin: ctx.sellerGstin,
      });
    }

    const requestPayload = buildEWayBillPayload(ctx, distanceKm);
    const responseMessage = await mastersIndiaApiService.generateEWayBill(requestPayload);

    const ewayBillNo = String(
      responseMessage.ewayBillNo || responseMessage.EwbNo || responseMessage.ewbNo || ''
    ).trim();
    if (!ewayBillNo) {
      throw new ConflictError('MastersIndia e-way bill response did not include e-way bill number');
    }

    const created = await eWayBillDAO.create({
      invoice_dispatch_id: invoiceDispatchId,
      eway_bill_number: ewayBillNo,
      vehicle_number: ctx.vehicleNumber,
      distance_km: distanceKm,
      route: data.route || dispatch.route_description || undefined,
      transporter_id: data.transporter_id || dispatch.transporter_id || undefined,
      payload: {
        request: requestPayload,
        response: responseMessage,
        printUrl: responseMessage.url ?? responseMessage.QRCodeUrl ?? null,
      },
    });

    return mapRow(created);
  }
}

export const eWayBillService = new EWayBillService();
