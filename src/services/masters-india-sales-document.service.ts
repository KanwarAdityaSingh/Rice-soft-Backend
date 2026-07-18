import { appConfig } from '../config/app.config';
import {
  gstStateCodeFromGstin,
  isInterStateSupply,
  resolveGstStateCode,
  resolveGstStateName,
} from '../constants/gst-state-codes';
import { godownDAO } from '../dao/godown.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { productDAO } from '../dao/product.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import { salesSaudaDAO } from '../dao/sales-sauda.dao';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import { transporterDAO } from '../dao/transporter.dao';
import { vehicleDAO } from '../dao/vehicle.dao';
import type { Address } from '../models/vendor.model';
import { BadRequestError, NotFoundError } from '../utils/errors';

export interface SalesDocumentContext {
  dispatch: NonNullable<Awaited<ReturnType<typeof invoiceDispatchDAO.findById>>>;
  godown: NonNullable<Awaited<ReturnType<typeof godownDAO.findById>>>;
  salesParty: NonNullable<Awaited<ReturnType<typeof salesPartyDAO.findById>>>;
  lines: Awaited<ReturnType<typeof invoiceDispatchLineDAO.findByInvoiceDispatchId>>;
  saudaLines: Awaited<ReturnType<typeof salesSaudaLineDAO.findBySalesSaudaId>>;
  /** Ship-from: godown (physical dispatch location) */
  shipFromAddress: Address;
  /** Bill-to: sales sauda billing_address → sales party address */
  billToAddress: Address;
  /** Ship-to: sales sauda delivery_address → billing → sales party address */
  shipToAddress: Address;
  sellerGstin: string;
  buyerGstin: string;
  documentNumber: string;
  documentDate: string;
  interState: boolean;
  totals: {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    invoiceValue: number;
    roundOff: number;
  };
  itemRows: Array<{
    description: string;
    hsn: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    taxableAmount: number;
    gstPercent: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    totalItemValue: number;
  }>;
  transporter: Awaited<ReturnType<typeof transporterDAO.findById>> | null;
  vehicleNumber: string | null;
}

function formatDocumentDate(value: Date | string | null | undefined): string {
  const d = value ? new Date(value) : new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function addressParts(addr: Address | null | undefined) {
  return {
    address1: (addr?.street || '').slice(0, 100),
    address2: '',
    place: (addr?.city || '').slice(0, 50),
    pincode: (addr?.pincode || '').replace(/\D/g, '').slice(0, 6),
    stateName: resolveGstStateName(addr?.state, null),
    stateCode: resolveGstStateCode(addr?.state, null),
  };
}

function normalizeAddress(value: unknown): Address | null {
  if (!value || typeof value !== 'object') return null;
  const addr = value as Partial<Address>;
  if (!addr.street && !addr.city && !addr.state && !addr.pincode) return null;
  return {
    street: String(addr.street || ''),
    city: String(addr.city || ''),
    state: String(addr.state || ''),
    pincode: String(addr.pincode || ''),
    country: String(addr.country || 'India'),
  };
}

/** First address that has a 6-digit pincode; otherwise first non-null; otherwise null. */
function pickAddress(...candidates: Array<Address | null | undefined>): Address | null {
  const normalized = candidates.map(normalizeAddress).filter((a): a is Address => a != null);
  if (normalized.length === 0) return null;
  const withPin = normalized.find((a) => (a.pincode || '').replace(/\D/g, '').length === 6);
  return withPin || normalized[0];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function loadSalesDocumentContext(
  invoiceDispatchId: string,
  overrides?: { vehicle_number?: string; transporter_id?: string }
): Promise<SalesDocumentContext> {
  const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
  if (!dispatch) throw new NotFoundError('Invoice dispatch not found');

  const godown = await godownDAO.findById(dispatch.godown_id);
  if (!godown) throw new NotFoundError('Godown not found for dispatch');

  const sauda = await salesSaudaDAO.findById(dispatch.sales_sauda_id);
  if (!sauda) throw new NotFoundError('Sales sauda not found');

  const salesParty = await salesPartyDAO.findById(sauda.sales_party_id);
  if (!salesParty) throw new NotFoundError('Sales party not found');

  const lines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(invoiceDispatchId);
  if (lines.length === 0) throw new BadRequestError('Invoice dispatch has no lines');

  const saudaLines = await salesSaudaLineDAO.findBySalesSaudaId(dispatch.sales_sauda_id);
  const saudaLineById = new Map(saudaLines.map((l) => [l.id, l]));

  const sellerGstin =
    (godown.gst_number || appConfig.apis.mastersIndia.sellerGstin || '').trim().toUpperCase();
  const buyerGstin = (dispatch.party_gst_number || salesParty.business_details?.gst_number || '')
    .trim()
    .toUpperCase();

  if (!sellerGstin || sellerGstin.length !== 15) {
    throw new BadRequestError('Seller GSTIN is required on godown (or MASTERS_INDIA_SELLER_GSTIN)');
  }
  if (!buyerGstin || buyerGstin.length !== 15) {
    throw new BadRequestError('Buyer GSTIN is required for B2B e-invoice / e-way bill');
  }

  const fallbackHsn = appConfig.apis.mastersIndia.defaultHsnCode;
  const itemRows: SalesDocumentContext['itemRows'] = [];
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let invoiceValue = 0;

  for (const line of lines) {
    const saudaLine = line.sales_sauda_line_id ? saudaLineById.get(line.sales_sauda_line_id) : null;
    const product = await productDAO.findById(line.product_id);
    const lineTaxable = round2(parseFloat(String(line.amount)));
    const gstPercent = saudaLine ? parseFloat(String(saudaLine.gst_percent)) : 0;
    const lineGst = saudaLine ? round2(parseFloat(String(saudaLine.gst_amount))) : 0;
    const lineTotal = saudaLine
      ? round2(parseFloat(String(saudaLine.final_amount)))
      : round2(lineTaxable + lineGst);

    const interState = isInterStateSupply(sellerGstin, buyerGstin);
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    if (interState) {
      igstAmount = lineGst;
    } else {
      cgstAmount = round2(lineGst / 2);
      sgstAmount = round2(lineGst - cgstAmount);
    }

    const productHsn = product?.hsn_code?.trim() || '';
    const hsn = productHsn || fallbackHsn;
    if (!hsn) {
      throw new BadRequestError(
        `HSN code is required on product${product?.name ? ` "${product.name}"` : ''} for e-invoice / e-way bill`
      );
    }

    itemRows.push({
      description: product?.name || 'Rice product',
      hsn,
      quantity: parseFloat(String(line.quantity)),
      unit: line.quantity_unit === 'packets' ? 'PCS' : 'KGS',
      unitPrice: parseFloat(String(line.rate)),
      taxableAmount: lineTaxable,
      gstPercent,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalItemValue: lineTotal,
    });

    taxable += lineTaxable;
    cgst += cgstAmount;
    sgst += sgstAmount;
    igst += igstAmount;
    invoiceValue += lineTotal;
  }

  const transporterId = overrides?.transporter_id || dispatch.transporter_id || null;
  const transporter = transporterId ? await transporterDAO.findById(transporterId) : null;

  let vehicleNumber = overrides?.vehicle_number?.trim().toUpperCase() || null;
  if (!vehicleNumber && dispatch.vehicle_id) {
    const vehicle = await vehicleDAO.findById(dispatch.vehicle_id);
    vehicleNumber = vehicle?.vehicle_number ?? null;
  }

  const partyAddress = normalizeAddress(salesParty.address);
  const shipFromAddress = pickAddress(godown.address);
  if (!shipFromAddress) {
    throw new BadRequestError('Godown address with pincode is required for e-invoice / e-way bill');
  }

  // Bill-to: sauda billing → sales party master
  const billToAddress = pickAddress(sauda.billing_address, partyAddress);
  if (!billToAddress) {
    throw new BadRequestError(
      'Billing address is required (set on sales sauda or sales party) for e-invoice / e-way bill'
    );
  }

  // Ship-to: sauda delivery → billing → sales party master
  const shipToAddress = pickAddress(sauda.delivery_address, sauda.billing_address, partyAddress);
  if (!shipToAddress) {
    throw new BadRequestError(
      'Delivery address is required (set on sales sauda or sales party) for e-invoice / e-way bill'
    );
  }

  return {
    dispatch,
    godown,
    salesParty,
    lines,
    saudaLines,
    shipFromAddress,
    billToAddress,
    shipToAddress,
    sellerGstin,
    buyerGstin,
    documentNumber: dispatch.internal_invoice_number,
    documentDate: formatDocumentDate(dispatch.dispatch_date),
    interState: isInterStateSupply(sellerGstin, buyerGstin),
    totals: {
      taxable: round2(taxable),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: round2(igst),
      invoiceValue: round2(invoiceValue),
      roundOff: 0,
    },
    itemRows,
    transporter,
    vehicleNumber,
  };
}

export function buildEInvoicePayload(ctx: SalesDocumentContext): Record<string, unknown> {
  // Seller = ship-from (godown); buyer address = bill-to
  const sellerAddr = addressParts(ctx.shipFromAddress);
  const buyerAddr = addressParts(ctx.billToAddress);

  return {
    user_gstin: ctx.sellerGstin,
    transaction_details: {
      supply_type: 'B2B',
    },
    document_details: {
      document_type: 'INV',
      document_number: ctx.documentNumber,
      document_date: ctx.documentDate,
    },
    seller_details: {
      gstin: ctx.sellerGstin,
      legal_name: ctx.godown.name,
      address1: sellerAddr.address1,
      address2: sellerAddr.address2,
      location: sellerAddr.place,
      pincode: sellerAddr.pincode,
      state_code: resolveGstStateName(sellerAddr.stateName, ctx.sellerGstin),
      email: appConfig.apis.mastersIndia.notificationEmail,
    },
    buyer_details: {
      gstin: ctx.buyerGstin,
      legal_name: ctx.salesParty.business_name,
      place_of_supply: gstStateCodeFromGstin(ctx.buyerGstin),
      address1: buyerAddr.address1,
      address2: buyerAddr.address2,
      location: buyerAddr.place,
      pincode: buyerAddr.pincode,
      state_code: resolveGstStateName(buyerAddr.stateName, ctx.buyerGstin),
      phone_number: (ctx.salesParty.contact_persons?.[0]?.phones?.[0] || '').replace(/\D/g, '').slice(-10) || undefined,
    },
    value_details: {
      total_assessable_value: ctx.totals.taxable,
      total_cgst_value: ctx.totals.cgst,
      total_sgst_value: ctx.totals.sgst,
      total_igst_value: ctx.totals.igst,
      round_off_amount: ctx.totals.roundOff,
      total_invoice_value: ctx.totals.invoiceValue,
    },
    item_list: ctx.itemRows.map((item, index) => ({
      item_serial_number: String(index + 1),
      product_description: item.description,
      is_service: 'N',
      hsn_code: item.hsn,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unitPrice,
      total_amount: item.taxableAmount,
      assessable_value: item.taxableAmount,
      gst_rate: item.gstPercent,
      cgst_amount: item.cgstAmount,
      sgst_amount: item.sgstAmount,
      igst_amount: item.igstAmount,
      total_item_value: item.totalItemValue,
    })),
  };
}

export function buildEWayBillPayload(
  ctx: SalesDocumentContext,
  distanceKm: number
): Record<string, unknown> {
  // Consignor = ship-from (godown); consignee = ship-to (delivery)
  const sellerAddr = addressParts(ctx.shipFromAddress);
  const buyerAddr = addressParts(ctx.shipToAddress);

  const payload: Record<string, unknown> = {
    userGstin: ctx.sellerGstin,
    supply_type: 'Outward',
    sub_supply_type: 'Supply',
    sub_supply_description: '',
    document_type: 'Tax Invoice',
    document_number: ctx.documentNumber,
    document_date: ctx.documentDate,
    gstin_of_consignor: ctx.sellerGstin,
    legal_name_of_consignor: ctx.godown.name,
    address1_of_consignor: sellerAddr.address1,
    address2_of_consignor: sellerAddr.address2,
    place_of_consignor: sellerAddr.place,
    pincode_of_consignor: Number(sellerAddr.pincode) || sellerAddr.pincode,
    state_of_consignor: resolveGstStateName(sellerAddr.stateName, ctx.sellerGstin),
    actual_from_state_name: resolveGstStateName(sellerAddr.stateName, ctx.sellerGstin),
    gstin_of_consignee: ctx.buyerGstin,
    legal_name_of_consignee: ctx.salesParty.business_name,
    address1_of_consignee: buyerAddr.address1,
    address2_of_consignee: buyerAddr.address2,
    place_of_consignee: buyerAddr.place,
    pincode_of_consignee: Number(buyerAddr.pincode) || buyerAddr.pincode,
    state_of_supply: resolveGstStateName(buyerAddr.stateName, ctx.buyerGstin),
    actual_to_state_name: resolveGstStateName(buyerAddr.stateName, ctx.buyerGstin),
    transaction_type: 1,
    other_value: 0,
    total_invoice_value: ctx.totals.invoiceValue,
    taxable_amount: ctx.totals.taxable,
    cgst_amount: ctx.totals.cgst,
    sgst_amount: ctx.totals.sgst,
    igst_amount: ctx.totals.igst,
    cess_amount: 0,
    cess_nonadvol_value: 0,
    transportation_mode: 'road',
    transporter_document_date: ctx.documentDate,
    transportation_distance: String(distanceKm),
    vehicle_number: ctx.vehicleNumber,
    vehicle_type: 'Regular',
    generate_status: 1,
    data_source: 'erp',
    eway_bill_status: 'ABC',
    user_ref: ctx.dispatch.id,
    location_code: 'RICEOPS',
    auto_print: 'Y',
    email: appConfig.apis.mastersIndia.notificationEmail,
    itemList: ctx.itemRows.map((item) => ({
      product_name: item.description,
      product_description: item.description,
      hsn_code: item.hsn,
      unit_of_product: item.unit,
      cgst_rate: ctx.interState ? 0 : item.gstPercent / 2,
      sgst_rate: ctx.interState ? 0 : item.gstPercent / 2,
      igst_rate: ctx.interState ? item.gstPercent : 0,
      quantity: item.quantity,
      taxable_amount: item.taxableAmount,
    })),
  };

  const transporterGstin = ctx.transporter?.gst_number?.trim();
  if (transporterGstin && transporterGstin.toUpperCase() !== 'NA') {
    payload.transporter_id = transporterGstin;
  }
  if (ctx.transporter?.business_name) {
    payload.transporter_name = ctx.transporter.business_name;
  }

  const lrNumber = ctx.dispatch.lr_number?.trim();
  if (lrNumber) {
    payload.transporter_document_number = lrNumber;
  }

  return payload;
}
