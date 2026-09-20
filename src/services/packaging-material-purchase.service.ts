import { db } from '../database/connection';
import { PoolClient } from 'pg';
import { packagingDAO } from '../dao/packaging.dao';
import { packagingMaterialPurchaseDAO } from '../dao/packaging-material-purchase.dao';
import { packagingVendorDAO } from '../dao/packaging-vendor.dao';
import { packetsInventoryDAO } from '../dao/packets-inventory.dao';
import { packetsInventoryAuditDAO } from '../dao/inventory-audit.dao';
import { godownDAO } from '../dao/godown.dao';
import { productDAO } from '../dao/product.dao';
import {
  CreatePackagingMaterialPurchaseDTO,
  UpdatePackagingMaterialPurchaseDTO,
  toPackagingMaterialPurchaseResponse,
} from '../models/packaging-material-purchase.model';
import { INVENTORY_AUDIT_REASONS } from '../models/inventory-audit.model';
import { roundMoney } from '../utils/empty-bag-cost';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { packagingMaterialService } from './packaging-material.service';

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function toYmd(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

async function applyPacketsStockDelta(
  client: PoolClient,
  args: {
    packagingId: string;
    godownId: string;
    delta: number;
    purchaseId: string;
    notes: string;
    reason: string;
    userId?: string | null;
  }
): Promise<void> {
  if (args.delta === 0) {
    return;
  }

  const existing = await packetsInventoryDAO.findByPackagingId(
    args.packagingId,
    args.godownId,
    client
  );
  const quantityBefore = Number(existing?.available_quantity || 0);

  if (args.delta > 0) {
    const inventory = await packetsInventoryDAO.create(
      {
        packaging_id: args.packagingId,
        godown_id: args.godownId,
        available_quantity: args.delta,
        created_by: args.userId ?? undefined,
      },
      client
    );
    await packetsInventoryAuditDAO.create(
      {
        packets_inventory_id: inventory.id,
        packaging_id: args.packagingId,
        operation_type: 'addition',
        quantity_change: args.delta,
        quantity_before: quantityBefore,
        quantity_after: Number(inventory.available_quantity),
        reason: args.reason,
        reference_type: 'packaging_material_purchase',
        reference_id: args.purchaseId,
        notes: args.notes,
        created_by: args.userId ?? undefined,
      },
      client
    );
    return;
  }

  const reduceBy = -args.delta;
  if (quantityBefore < reduceBy) {
    throw new ValidationError(
      `Cannot reduce purchase by ${reduceBy} bags; only ${quantityBefore} bags remain in this godown for this packaging`
    );
  }

  const decremented = await packetsInventoryDAO.decrementQuantity(
    args.packagingId,
    reduceBy,
    args.godownId,
    client
  );
  if (!decremented) {
    throw new ValidationError(
      `Cannot reduce purchase by ${reduceBy} bags; insufficient packet stock in this godown`
    );
  }

  const after = await packetsInventoryDAO.findByPackagingId(
    args.packagingId,
    args.godownId,
    client
  );
  await packetsInventoryAuditDAO.create(
    {
      packets_inventory_id: after?.id,
      packaging_id: args.packagingId,
      operation_type: 'reduction',
      quantity_change: reduceBy,
      quantity_before: quantityBefore,
      quantity_after: Number(after?.available_quantity ?? quantityBefore - reduceBy),
      reason: args.reason,
      reference_type: 'packaging_material_purchase',
      reference_id: args.purchaseId,
      notes: args.notes,
      created_by: args.userId ?? undefined,
    },
    client
  );
}

export function computePurchaseAmounts(input: {
  quantity_kg: number;
  empty_bag_weight_kg: number;
  rate_per_kg: number;
  gst_percent: number;
}): {
  bag_count: number;
  rate_per_bag: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
} {
  const bagCount = Math.floor(input.quantity_kg / input.empty_bag_weight_kg);
  if (bagCount < 1) {
    throw new ValidationError(
      'quantity_kg / empty_bag_weight_kg must yield at least 1 bag'
    );
  }
  const rateWithGst = input.rate_per_kg + (input.rate_per_kg * input.gst_percent) / 100;
  const ratePerBag4 =
    Math.round((rateWithGst * input.empty_bag_weight_kg + Number.EPSILON) * 10000) / 10000;
  const taxable = roundMoney(input.quantity_kg * input.rate_per_kg);
  const gstAmount = roundMoney((taxable * input.gst_percent) / 100);
  const total = roundMoney(taxable + gstAmount);
  return {
    bag_count: bagCount,
    rate_per_bag: ratePerBag4,
    taxable_amount: taxable,
    gst_amount: gstAmount,
    total_amount: total,
  };
}

export class PackagingMaterialPurchaseService {
  async list(
    filters?: { packaging_id?: string; vendor_id?: string; search?: string },
    pagination?: { limit: number; offset: number }
  ) {
    const { rows, total } = await packagingMaterialPurchaseDAO.findAll(filters, pagination);
    return { items: rows.map(toPackagingMaterialPurchaseResponse), total };
  }

  async getById(id: string) {
    const row = await packagingMaterialPurchaseDAO.findById(id);
    if (!row) throw new NotFoundError('Packaging material purchase not found');
    return toPackagingMaterialPurchaseResponse(row);
  }

  async create(data: CreatePackagingMaterialPurchaseDTO) {
    const vendor = await packagingVendorDAO.findById(data.vendor_id);
    if (!vendor) throw new NotFoundError('Vendor not found');
    if (vendor.status !== 'active') {
      throw new ValidationError('Vendor is not active');
    }

    const packaging = await packagingDAO.findById(data.packaging_id);
    if (!packaging) throw new NotFoundError('Packaging not found');
    if (packaging.status !== 'active') {
      throw new ValidationError('Packaging is not active');
    }

    const godown = await godownDAO.findById(data.godown_id);
    if (!godown) throw new NotFoundError('Godown not found');
    if (!godown.is_active) {
      throw new BadRequestError('Cannot receive into an inactive godown');
    }

    if (data.purchase_date > todayYmd()) {
      throw new ValidationError('purchase_date cannot be a future date');
    }
    if (data.invoice_date > data.purchase_date) {
      throw new ValidationError('invoice_date cannot be after purchase_date');
    }

    const dup = await packagingMaterialPurchaseDAO.findByVendorInvoice(
      data.vendor_id,
      data.invoice_number
    );
    if (dup) {
      throw new ConflictError('Invoice number already exists for this vendor');
    }

    const amounts = computePurchaseAmounts({
      quantity_kg: data.quantity_kg,
      empty_bag_weight_kg: data.empty_bag_weight_kg,
      rate_per_kg: data.rate_per_kg,
      gst_percent: data.gst_percent,
    });

    const purchase = await db.transaction(async (client) => {
      const row = await packagingMaterialPurchaseDAO.createWithClient(client, {
        ...data,
        ...amounts,
      });

      await applyPacketsStockDelta(client, {
        packagingId: data.packaging_id,
        godownId: data.godown_id,
        delta: amounts.bag_count,
        purchaseId: row.id,
        notes: `Purchase ${row.invoice_number} | ${amounts.bag_count} bags | ${data.quantity_kg} kg @ ₹${data.rate_per_kg}/kg + ${data.gst_percent}% GST | Total ₹${amounts.total_amount}`,
        reason: INVENTORY_AUDIT_REASONS.PACKETS.STOCK_ADDITION,
        userId: data.created_by,
      });

      return row;
    });

    logger.info('Packaging material purchase saved', {
      id: purchase.id,
      packaging_id: data.packaging_id,
      bag_count: amounts.bag_count,
    });
    return toPackagingMaterialPurchaseResponse(purchase);
  }

  async update(id: string, data: UpdatePackagingMaterialPurchaseDTO) {
    const existing = await packagingMaterialPurchaseDAO.findById(id);
    if (!existing) throw new NotFoundError('Packaging material purchase not found');

    const next = {
      vendor_id: data.vendor_id ?? existing.vendor_id,
      packaging_id: data.packaging_id ?? existing.packaging_id,
      purchase_date: data.purchase_date ?? toYmd(existing.purchase_date),
      invoice_number: (data.invoice_number ?? existing.invoice_number).trim(),
      invoice_date: data.invoice_date ?? toYmd(existing.invoice_date),
      quantity_kg: data.quantity_kg ?? Number(existing.quantity_kg),
      empty_bag_weight_kg: data.empty_bag_weight_kg ?? Number(existing.empty_bag_weight_kg),
      gsm: data.gsm !== undefined ? data.gsm : existing.gsm != null ? Number(existing.gsm) : null,
      rate_per_kg: data.rate_per_kg ?? Number(existing.rate_per_kg),
      gst_percent: data.gst_percent ?? Number(existing.gst_percent),
      godown_id: data.godown_id ?? existing.godown_id,
      batch_lot_number:
        data.batch_lot_number !== undefined ? data.batch_lot_number : existing.batch_lot_number,
      invoice_document_url:
        data.invoice_document_url !== undefined
          ? data.invoice_document_url
          : existing.invoice_document_url,
      notes: data.notes !== undefined ? data.notes : existing.notes,
    };

    if (next.vendor_id !== existing.vendor_id) {
      const vendor = await packagingVendorDAO.findById(next.vendor_id);
      if (!vendor) throw new NotFoundError('Vendor not found');
      if (vendor.status !== 'active') {
        throw new ValidationError('Vendor is not active');
      }
    }

    if (next.packaging_id !== existing.packaging_id) {
      const packaging = await packagingDAO.findById(next.packaging_id);
      if (!packaging) throw new NotFoundError('Packaging not found');
      if (packaging.status !== 'active') {
        throw new ValidationError('Packaging is not active');
      }
    }

    if (next.godown_id !== existing.godown_id) {
      const godown = await godownDAO.findById(next.godown_id);
      if (!godown) throw new NotFoundError('Godown not found');
      if (!godown.is_active) {
        throw new BadRequestError('Cannot receive into an inactive godown');
      }
    }

    if (next.purchase_date > todayYmd()) {
      throw new ValidationError('purchase_date cannot be a future date');
    }
    if (next.invoice_date > next.purchase_date) {
      throw new ValidationError('invoice_date cannot be after purchase_date');
    }

    if (
      next.vendor_id !== existing.vendor_id ||
      next.invoice_number.toLowerCase() !== existing.invoice_number.toLowerCase()
    ) {
      const dup = await packagingMaterialPurchaseDAO.findByVendorInvoice(
        next.vendor_id,
        next.invoice_number,
        id
      );
      if (dup) {
        throw new ConflictError('Invoice number already exists for this vendor');
      }
    }

    const amounts = computePurchaseAmounts({
      quantity_kg: next.quantity_kg,
      empty_bag_weight_kg: next.empty_bag_weight_kg,
      rate_per_kg: next.rate_per_kg,
      gst_percent: next.gst_percent,
    });

    const oldBagCount = Number(existing.bag_count);
    const locationChanged =
      next.packaging_id !== existing.packaging_id || next.godown_id !== existing.godown_id;

    const purchase = await db.transaction(async (client) => {
      const row = await packagingMaterialPurchaseDAO.updateWithClient(client, id, {
        ...next,
        ...amounts,
        updated_by: data.updated_by,
      });
      if (!row) throw new NotFoundError('Packaging material purchase not found');

      const auditNote = `Purchase ${row.invoice_number} edited | ${amounts.bag_count} bags | ${next.quantity_kg} kg @ ₹${next.rate_per_kg}/kg + ${next.gst_percent}% GST | Total ₹${amounts.total_amount}`;

      if (locationChanged) {
        await applyPacketsStockDelta(client, {
          packagingId: existing.packaging_id,
          godownId: existing.godown_id,
          delta: -oldBagCount,
          purchaseId: row.id,
          notes: auditNote,
          reason: INVENTORY_AUDIT_REASONS.PACKETS.STOCK_CORRECTION,
          userId: data.updated_by,
        });
        await applyPacketsStockDelta(client, {
          packagingId: next.packaging_id,
          godownId: next.godown_id,
          delta: amounts.bag_count,
          purchaseId: row.id,
          notes: auditNote,
          reason: INVENTORY_AUDIT_REASONS.PACKETS.STOCK_CORRECTION,
          userId: data.updated_by,
        });
      } else {
        await applyPacketsStockDelta(client, {
          packagingId: next.packaging_id,
          godownId: next.godown_id,
          delta: amounts.bag_count - oldBagCount,
          purchaseId: row.id,
          notes: auditNote,
          reason: INVENTORY_AUDIT_REASONS.PACKETS.STOCK_CORRECTION,
          userId: data.updated_by,
        });
      }

      return row;
    });

    logger.info('Packaging material purchase updated', {
      id: purchase.id,
      packaging_id: next.packaging_id,
      bag_count: amounts.bag_count,
    });
    return toPackagingMaterialPurchaseResponse(purchase);
  }
}

export class PackagingService {
  async createClean(data: {
    product_id: string;
    holding_capacity: number;
    packaging_material_id: string;
    remarks?: string | null;
    status?: 'active' | 'inactive';
    created_by?: string;
  }) {
    const product = await productDAO.findById(data.product_id);
    if (!product) throw new NotFoundError('Product not found');
    if (product.status !== 'active') {
      throw new ValidationError('Only active products can receive packaging');
    }

    const material = await packagingMaterialService.requireActive(data.packaging_material_id);

    const clash = await packagingDAO.findByProductCapacityMaterial(
      data.product_id,
      data.holding_capacity,
      data.packaging_material_id
    );
    if (clash) {
      throw new ConflictError(
        'Packaging already exists for this product, holding capacity, and material'
      );
    }

    return packagingDAO.create({
      product_id: data.product_id,
      holding_capacity: data.holding_capacity as 5 | 10 | 25 | 26 | 30 | 50,
      packaging_material_id: data.packaging_material_id,
      packet_type: material.name,
      remarks: data.remarks,
      status: data.status ?? 'active',
      created_by: data.created_by,
    });
  }

  async updateClean(
    id: string,
    data: {
      holding_capacity?: number;
      packaging_material_id?: string;
      remarks?: string | null;
      status?: 'active' | 'inactive';
      updated_by?: string;
    }
  ) {
    const existing = await packagingDAO.findById(id);
    if (!existing) throw new NotFoundError('Packaging not found');

    let packetType: string | undefined;
    const materialId = data.packaging_material_id ?? existing.packaging_material_id;
    const capacity = data.holding_capacity ?? Number(existing.holding_capacity);

    if (data.packaging_material_id) {
      const material = await packagingMaterialService.requireActive(data.packaging_material_id);
      packetType = material.name;
    }

    const clash = await packagingDAO.findByProductCapacityMaterial(
      existing.product_id,
      capacity,
      materialId,
      id
    );
    if (clash) {
      throw new ConflictError(
        'Packaging already exists for this product, holding capacity, and material'
      );
    }

    const updated = await packagingDAO.update(id, {
      holding_capacity: data.holding_capacity as 5 | 10 | 25 | 26 | 30 | 50 | undefined,
      packaging_material_id: data.packaging_material_id,
      packet_type: packetType,
      remarks: data.remarks,
      status: data.status,
      updated_by: data.updated_by,
    });
    if (!updated) throw new NotFoundError('Packaging not found');
    return updated;
  }
}

export const packagingMaterialPurchaseService = new PackagingMaterialPurchaseService();
export const packagingService = new PackagingService();
