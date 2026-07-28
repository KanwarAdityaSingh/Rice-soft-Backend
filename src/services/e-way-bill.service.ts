import { resolveGstStateCode, resolveGstStateName } from '../constants/gst-state-codes';
import { eWayBillDAO } from '../dao/e-way-bill.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { driverDAO } from '../dao/driver.dao';
import type { Address, ContactPerson } from '../models/vendor.model';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { mastersIndiaApiService } from './masters-india-api.service';
import {
  buildEWayBillPayload,
  loadSalesDocumentContext,
  type SalesDocumentContext,
} from './masters-india-sales-document.service';

function primaryPhone(contacts: ContactPerson[] | null | undefined, fallback?: string | null): string | null {
  const fromContacts = contacts?.[0]?.phones?.[0]?.replace(/\D/g, '').slice(-10);
  if (fromContacts) return fromContacts;
  const fromFallback = (fallback || '').replace(/\D/g, '').slice(-10);
  return fromFallback || null;
}

function primaryEmail(contacts: ContactPerson[] | null | undefined, fallback?: string | null): string | null {
  const fromContacts = contacts?.[0]?.emails?.[0]?.trim();
  if (fromContacts) return fromContacts;
  const fromFallback = (fallback || '').trim();
  return fromFallback || null;
}

function formatDispatchDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Prefer dispatch_date + time from created_at; fall back to created_at ISO. */
function formatDispatchDateTime(
  dispatchDate: Date | string | null | undefined,
  createdAt: Date | string | null | undefined
): string | null {
  const datePart = formatDispatchDate(dispatchDate);
  const createdIso =
    createdAt instanceof Date
      ? createdAt.toISOString()
      : typeof createdAt === 'string'
        ? createdAt
        : null;
  if (datePart && createdIso) {
    const timePart = createdIso.includes('T') ? createdIso.slice(10) : 'T00:00:00.000Z';
    return `${datePart}${timePart.startsWith('T') ? timePart : `T${timePart}`}`;
  }
  if (datePart) return `${datePart}T00:00:00.000Z`;
  return createdIso;
}

function mapPreviewAddress(addr: Address) {
  return {
    street: addr.street || '',
    city: addr.city || '',
    state: addr.state || '',
    state_code: resolveGstStateCode(addr.state, null),
    state_name: resolveGstStateName(addr.state, null),
    pincode: (addr.pincode || '').replace(/\D/g, '').slice(0, 6),
    country: addr.country || 'India',
  };
}

type EWayBillGenerateInput = {
  vehicle_number?: string;
  distance_km?: number;
  route?: string;
  transporter_id?: string;
  lr_number?: string | null;
};

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

export type EWayBillPreview = {
  dispatch_id: string;
  already_generated: boolean;
  existing_eway_bill_number: string | null;
  document_number: string;
  document_type: string;
  document_date: string;
  /**
   * Transport / dispatch header for confirmation UI.
   * Mirrors: Dispatch Date & Time, Transporter, Vehicle, Driver, LR Number.
   */
  dispatch_date: string | null;
  dispatch_datetime: string | null;
  transporter_name: string | null;
  vehicle_number: string | null;
  driver_name: string | null;
  driver_mobile_number: string | null;
  lr_number: string | null;
  distance_km: number | null;
  distance_source: 'request' | 'dispatch' | 'masters_india' | 'unavailable';
  /** Set when MastersIndia distance lookup failed during preview (preview still succeeds). */
  distance_error: string | null;
  route: string | null;
  transporter: {
    id: string | null;
    name: string | null;
    gst_number: string | null;
  };
  driver: {
    id: string;
    name: string | null;
    phone: string;
    license_number: string;
  } | null;
  /** Ship-from (godown) */
  consignor: {
    id: string;
    gstin: string;
    name: string;
    pincode: string;
    place: string;
    state: string;
    state_code: string | null;
    state_name: string;
    address: {
      street: string;
      city: string;
      state: string;
      state_code: string | null;
      state_name: string;
      pincode: string;
      country: string;
    };
    phone: string | null;
    email: string | null;
    contact_persons: ContactPerson[];
    google_maps_link: string | null;
  };
  /** Ship-to (sales party / delivery) */
  consignee: {
    id: string;
    gstin: string;
    name: string;
    pincode: string;
    place: string;
    state: string;
    state_code: string | null;
    state_name: string;
    address: {
      street: string;
      city: string;
      state: string;
      state_code: string | null;
      state_name: string;
      pincode: string;
      country: string;
    };
    /** Master / billing address when different from ship-to */
    billing_address: {
      street: string;
      city: string;
      state: string;
      state_code: string | null;
      state_name: string;
      pincode: string;
      country: string;
    };
    phone: string | null;
    email: string | null;
    pan_number: string | null;
    registration_type: string;
    contact_persons: ContactPerson[];
    google_location_link: string | null;
  };
  totals: {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    invoice_value: number;
  };
  items: Array<{
    product_name: string;
    /** From product master via sauda line */
    brand: string | null;
    /** From packaging on sauda/dispatch line, e.g. "25 Kg" */
    bag_weight: string | null;
    hsn_code: string;
    quantity: number;
    unit: string;
    bags: number | null;
    /** Original ₹/unit (pre-discount) */
    rate: number;
    /** Effective ₹/unit after discount */
    discounted_rate: number;
    /** qty × rate */
    gross: number;
    discount_amount: number;
    /** gross − discount */
    taxable_amount: number;
  }>;
  /** Exact JSON that POST .../e-way-bill will send to MastersIndia */
  masters_india_payload: Record<string, unknown>;
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

type PreparedEWayBill = {
  dispatch: NonNullable<Awaited<ReturnType<typeof invoiceDispatchDAO.findById>>>;
  ctx: SalesDocumentContext;
  distanceKm: number | null;
  distanceSource: 'request' | 'dispatch' | 'masters_india' | 'unavailable';
  distanceError: string | null;
  route: string | null;
  lrNumber: string | null;
  transporterId: string | null;
  requestPayload: Record<string, unknown>;
};

export class EWayBillService {
  async getByInvoiceDispatchId(invoiceDispatchId: string): Promise<EWayBillPayload[]> {
    const rows = await eWayBillDAO.findByInvoiceDispatchId(invoiceDispatchId);
    return rows.map(mapRow);
  }

  /**
   * Build the MastersIndia e-way bill request for confirmation UI.
   * Calls the distance API when distance is not provided; does not generate or persist.
   * Distance API failures do not block preview — FE can enter distance manually.
   */
  async previewForDispatch(
    invoiceDispatchId: string,
    data: EWayBillGenerateInput
  ): Promise<EWayBillPreview> {
    const existingRows = await eWayBillDAO.findByInvoiceDispatchId(invoiceDispatchId);
    const existing = existingRows[0] ?? null;

    const prepared = await this.prepareForDispatch(invoiceDispatchId, data, {
      persistLrOverride: false,
      allowDistanceFailure: true,
      requireVehicleNumber: false,
    });

    const {
      dispatch,
      ctx,
      distanceKm,
      distanceSource,
      distanceError,
      route,
      lrNumber,
      transporterId,
      requestPayload,
    } = prepared;

    const consignorAddress = mapPreviewAddress(ctx.shipFromAddress);
    const consigneeAddress = mapPreviewAddress(ctx.shipToAddress);
    const billingAddress = mapPreviewAddress(ctx.billToAddress);

    const transporterName = ctx.transporter?.business_name ?? null;
    const vehicleNumber = ctx.vehicleNumber;

    let driverSummary: EWayBillPreview['driver'] = null;
    let driverName: string | null = null;
    let driverMobile: string | null = null;
    if (dispatch.driver_id) {
      const driver = await driverDAO.findById(dispatch.driver_id);
      if (driver) {
        driverSummary = {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          license_number: driver.license_number,
        };
        driverName = driver.name;
        driverMobile = driver.phone;
      }
    }

    const dispatchDate = formatDispatchDate(dispatch.dispatch_date);
    const dispatchDateTime = formatDispatchDateTime(dispatch.dispatch_date, dispatch.created_at);

    return {
      dispatch_id: invoiceDispatchId,
      already_generated: existing != null,
      existing_eway_bill_number: existing?.eway_bill_number ?? null,
      document_number: ctx.documentNumber,
      document_type: String(requestPayload.document_type ?? 'Bill of Supply'),
      document_date: ctx.documentDate,
      dispatch_date: dispatchDate,
      dispatch_datetime: dispatchDateTime,
      transporter_name: transporterName,
      vehicle_number: vehicleNumber,
      driver_name: driverName,
      driver_mobile_number: driverMobile,
      lr_number: lrNumber,
      distance_km: distanceKm,
      distance_source: distanceSource,
      distance_error: distanceError,
      route,
      transporter: {
        id: transporterId,
        name: transporterName,
        gst_number: ctx.transporter?.gst_number ?? null,
      },
      driver: driverSummary,
      consignor: {
        id: ctx.godown.id,
        gstin: ctx.sellerGstin,
        name: ctx.godown.name,
        pincode: consignorAddress.pincode,
        place: consignorAddress.city,
        state: consignorAddress.state,
        state_code: consignorAddress.state_code,
        state_name: consignorAddress.state_name,
        address: consignorAddress,
        phone: primaryPhone(ctx.godown.contact_persons),
        email: primaryEmail(ctx.godown.contact_persons),
        contact_persons: ctx.godown.contact_persons ?? [],
        google_maps_link: ctx.godown.google_maps_link,
      },
      consignee: {
        id: ctx.salesParty.id,
        gstin: ctx.buyerGstin,
        name: ctx.salesParty.business_name,
        pincode: consigneeAddress.pincode,
        place: consigneeAddress.city,
        state: consigneeAddress.state,
        state_code: consigneeAddress.state_code,
        state_name: consigneeAddress.state_name,
        address: consigneeAddress,
        billing_address: billingAddress,
        phone: primaryPhone(ctx.salesParty.contact_persons, ctx.salesParty.phone),
        email: primaryEmail(ctx.salesParty.contact_persons, ctx.salesParty.email),
        pan_number: ctx.salesParty.business_details?.pan_number ?? null,
        registration_type: ctx.salesParty.registration_type,
        contact_persons: ctx.salesParty.contact_persons ?? [],
        google_location_link: ctx.salesParty.google_location_link,
      },
      totals: {
        taxable: ctx.totals.taxable,
        cgst: ctx.totals.cgst,
        sgst: ctx.totals.sgst,
        igst: ctx.totals.igst,
        invoice_value: ctx.totals.invoiceValue,
      },
      items: ctx.itemRows.map((item) => ({
        product_name: item.description,
        brand: item.brand,
        bag_weight: item.bagWeight,
        hsn_code: item.hsn,
        quantity: item.quantity,
        unit: item.unit,
        bags: item.bags,
        rate: item.unitPrice,
        discounted_rate: item.discountedRate,
        gross: item.grossAmount,
        discount_amount: item.discountAmount,
        taxable_amount: item.taxableAmount,
      })),
      masters_india_payload: requestPayload,
    };
  }

  async generateForDispatch(
    invoiceDispatchId: string,
    data: EWayBillGenerateInput
  ): Promise<EWayBillPayload> {
    const existingRows = await eWayBillDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (existingRows.length > 0) {
      return mapRow(existingRows[0]);
    }

    const prepared = await this.prepareForDispatch(invoiceDispatchId, data, {
      persistLrOverride: true,
      allowDistanceFailure: false,
      requireVehicleNumber: true,
    });

    if (prepared.distanceKm == null) {
      throw new BadRequestError(
        'Transportation distance is required to generate e-way bill; provide distance_km'
      );
    }

    const responseMessage = await mastersIndiaApiService.generateEWayBill(prepared.requestPayload);

    const ewayBillNo = String(
      responseMessage.ewayBillNo || responseMessage.EwbNo || responseMessage.ewbNo || ''
    ).trim();
    if (!ewayBillNo) {
      throw new ConflictError('MastersIndia e-way bill response did not include e-way bill number');
    }

    const created = await eWayBillDAO.create({
      invoice_dispatch_id: invoiceDispatchId,
      eway_bill_number: ewayBillNo,
      vehicle_number: prepared.ctx.vehicleNumber!,
      distance_km: prepared.distanceKm,
      route: prepared.route || undefined,
      transporter_id: prepared.transporterId || undefined,
      payload: {
        request: prepared.requestPayload,
        response: responseMessage,
        printUrl: responseMessage.url ?? responseMessage.QRCodeUrl ?? null,
      },
    });

    return mapRow(created);
  }

  /**
   * Shared prep for preview + generate: context, distance (incl. MastersIndia), payload.
   * When `allowDistanceFailure` is true (preview), MastersIndia distance errors
   * return null distance instead of failing the whole request.
   */
  private async prepareForDispatch(
    invoiceDispatchId: string,
    data: EWayBillGenerateInput,
    options: {
      persistLrOverride: boolean;
      allowDistanceFailure: boolean;
      requireVehicleNumber: boolean;
    }
  ): Promise<PreparedEWayBill> {
    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    if (dispatch.status !== 'confirmed') {
      throw new ConflictError('Invoice dispatch must be confirmed before generating e-way bill');
    }

    const transporterId = data.transporter_id || dispatch.transporter_id || null;
    const ctx = await loadSalesDocumentContext(invoiceDispatchId, {
      vehicle_number: data.vehicle_number,
      transporter_id: transporterId || undefined,
    });

    const lrOverride =
      data.lr_number != null && String(data.lr_number).trim() !== ''
        ? String(data.lr_number).trim()
        : null;
    if (lrOverride) {
      ctx.dispatch.lr_number = lrOverride;
      if (options.persistLrOverride) {
        await invoiceDispatchDAO.update(invoiceDispatchId, { lr_number: lrOverride });
      }
    }

    if (options.requireVehicleNumber && !ctx.vehicleNumber) {
      throw new BadRequestError('Vehicle number is required for e-way bill generation');
    }

    const sellerPin = (ctx.shipFromAddress.pincode || '').replace(/\D/g, '').slice(0, 6);
    const shipToPin = (ctx.shipToAddress.pincode || '').replace(/\D/g, '').slice(0, 6);
    if (!sellerPin || !shipToPin) {
      throw new BadRequestError(
        'Ship-from (godown) and ship-to (delivery) pincodes are required for e-way bill generation'
      );
    }

    let distanceKm: number | null = null;
    let distanceSource: PreparedEWayBill['distanceSource'] = 'unavailable';
    let distanceError: string | null = null;

    if (data.distance_km != null && !Number.isNaN(Number(data.distance_km))) {
      distanceKm = Number(data.distance_km);
      distanceSource = 'request';
    } else if (dispatch.distance_km != null && !Number.isNaN(Number(dispatch.distance_km))) {
      distanceKm = Number(dispatch.distance_km);
      distanceSource = 'dispatch';
    } else {
      try {
        distanceKm = await mastersIndiaApiService.calculateDistanceKm({
          fromPincode: sellerPin,
          toPincode: shipToPin,
          userGstin: ctx.sellerGstin,
        });
        distanceSource = 'masters_india';
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to calculate transportation distance';
        if (!options.allowDistanceFailure) {
          throw err;
        }
        distanceKm = null;
        distanceSource = 'unavailable';
        distanceError = message;
      }
    }

    const route = data.route || dispatch.route_description || null;
    const lrNumber = ctx.dispatch.lr_number?.trim() || null;
    const requestPayload = buildEWayBillPayload(ctx, distanceKm);

    return {
      dispatch,
      ctx,
      distanceKm,
      distanceSource,
      distanceError,
      route,
      lrNumber,
      transporterId,
      requestPayload,
    };
  }
}

export const eWayBillService = new EWayBillService();
