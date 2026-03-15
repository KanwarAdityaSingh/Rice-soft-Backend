import { eWayBillDAO } from '../dao/e-way-bill.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { NotFoundError } from '../utils/errors';

/**
 * Stub for MasterIndia E-Way Bill API. Replace with real HTTP client when integrating.
 */
export class EWayBillService {
  async getByInvoiceDispatchId(invoiceDispatchId: string): Promise<Array<{
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
  }>> {
    const rows = await eWayBillDAO.findByInvoiceDispatchId(invoiceDispatchId);
    return rows.map((r) => ({
      id: r.id,
      invoice_dispatch_id: r.invoice_dispatch_id,
      credit_note_id: r.credit_note_id,
      eway_bill_number: r.eway_bill_number,
      vehicle_number: r.vehicle_number,
      distance_km: r.distance_km != null ? parseFloat(r.distance_km.toString()) : null,
      route: r.route,
      transporter_id: r.transporter_id,
      payload: r.payload as Record<string, unknown> | null,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    }));
  }

  async generateForDispatch(
    invoiceDispatchId: string,
    data: { vehicle_number?: string; distance_km?: number; route?: string; transporter_id?: string }
  ): Promise<{
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
  }> {
    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');

    const stubEwayNumber = `EWB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      ewayBillNo: stubEwayNumber,
      vehicleNo: data.vehicle_number,
      distance: data.distance_km,
      fromPlace: '',
      toPlace: '',
    };

    const created = await eWayBillDAO.create({
      invoice_dispatch_id: invoiceDispatchId,
      eway_bill_number: stubEwayNumber,
      vehicle_number: data.vehicle_number,
      distance_km: data.distance_km,
      route: data.route,
      transporter_id: data.transporter_id,
      payload,
    });

    return {
      id: created.id,
      invoice_dispatch_id: created.invoice_dispatch_id,
      credit_note_id: created.credit_note_id,
      eway_bill_number: created.eway_bill_number,
      vehicle_number: created.vehicle_number,
      distance_km: created.distance_km != null ? parseFloat(created.distance_km.toString()) : null,
      route: created.route,
      transporter_id: created.transporter_id,
      payload: created.payload as Record<string, unknown> | null,
      created_at: created.created_at.toISOString(),
      updated_at: created.updated_at.toISOString(),
    };
  }
}

export const eWayBillService = new EWayBillService();
