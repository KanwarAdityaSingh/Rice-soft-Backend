import { Response, NextFunction } from 'express';
import { packagingDAO } from '../dao/packaging.dao';
import { packetsInventoryDAO } from '../dao/packets-inventory.dao';
import { packetsInventoryAuditDAO } from '../dao/inventory-audit.dao';
import { INVENTORY_AUDIT_REASONS } from '../models/inventory-audit.model';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  CreatePackagingDTO,
  UpdatePackagingDTO,
  Packaging,
  PackagingGodownInventoryItem,
  PackagingResponse,
} from '../models/packaging.model';
import { createPackagingSchema, updatePackagingSchema } from '../utils/validators';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { packagingService } from '../services/packaging-material-purchase.service';
import type { PackagingGodownInventoryRow } from '../dao/packets-inventory.dao';
import Joi from 'joi';

export class PackagingController {
  private toPackagingResponse(pkg: Packaging, summaries: PackagingGodownInventoryRow[]): PackagingResponse {
    const packets_inventory: PackagingGodownInventoryItem[] = summaries
      .filter((s) => s.packaging_id === pkg.id)
      .map((s) => ({
        godown_id: s.godown_id,
        godown_name: s.godown_name,
        available_quantity: s.available_quantity,
      }));

    return {
      id: pkg.id,
      packaging_number: pkg.packaging_number,
      product_id: pkg.product_id,
      holding_capacity: pkg.holding_capacity,
      packet_type: pkg.packet_type,
      packaging_material_id: pkg.packaging_material_id,
      packaging_material_name: pkg.packaging_material_name ?? null,
      remarks: pkg.remarks,
      status: pkg.status,
      packaging_vendor_id: pkg.packaging_vendor_id,
      ordered_weight: pkg.ordered_weight,
      empty_bag_weight_kg: pkg.empty_bag_weight_kg,
      empty_bag_rate_per_kg: pkg.empty_bag_rate_per_kg,
      empty_bag_gst_percent: pkg.empty_bag_gst_percent,
      empty_bags_total_weight_kg: pkg.empty_bags_total_weight_kg,
      empty_bags_taxable_amount: pkg.empty_bags_taxable_amount,
      empty_bags_gst_amount: pkg.empty_bags_gst_amount,
      empty_bags_total_amount: pkg.empty_bags_total_amount,
      bill_number: pkg.bill_number,
      bill_date: pkg.bill_date ? pkg.bill_date.toISOString().split('T')[0] : null,
      packaging_bill_url: pkg.packaging_bill_url,
      created_at: pkg.created_at.toISOString(),
      updated_at: pkg.updated_at.toISOString(),
      packets_inventory,
    };
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productId = req.query.product_id as string | undefined;
      const activeOnly = req.query.status === 'active';
      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { rows: packaging, total } = await packagingDAO.findAll(
        productId,
        activeOnly,
        { limit, offset },
        search
      );

      const ids = packaging.map((p) => p.id);
      const summaries = await packetsInventoryDAO.findGodownSummariesByPackagingIds(ids);
      const packagingResponses: PackagingResponse[] = packaging.map((pkg) =>
        this.toPackagingResponse(pkg, summaries)
      );

      return ResponseHandler.success(
        res,
        toPaginatedResult(packagingResponses, total, page, limit)
      );
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const packaging = await packagingDAO.findById(id);
      if (!packaging) {
        throw new NotFoundError('Packaging not found');
      }

      const summaries = await packetsInventoryDAO.findGodownSummariesByPackagingIds([packaging.id]);
      return ResponseHandler.success(res, this.toPackagingResponse(packaging, summaries));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const packagingData = validate<CreatePackagingDTO>(createPackagingSchema, req.body);
      if (req.user) {
        packagingData.created_by = req.user.userId;
      }

      const packaging = await packagingService.createClean(packagingData);
      const summaries = await packetsInventoryDAO.findGodownSummariesByPackagingIds([packaging.id]);
      return ResponseHandler.created(
        res,
        this.toPackagingResponse(packaging, summaries),
        'Packaging created successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const packagingData = validate<UpdatePackagingDTO>(updatePackagingSchema, req.body);
      if (req.user) {
        packagingData.updated_by = req.user.userId;
      }

      const packaging = await packagingService.updateClean(id, packagingData);
      const summaries = await packetsInventoryDAO.findGodownSummariesByPackagingIds([packaging.id]);
      return ResponseHandler.success(
        res,
        this.toPackagingResponse(packaging, summaries),
        'Packaging updated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async uploadPackagingBill(
    _req: AuthRequest,
    _res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    next(
      new BadRequestError(
        'Packaging bill upload moved to Purchase Packaging Material. Use POST /packaging-material-purchases with invoice_document_url.'
      )
    );
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const packaging = await packagingService.updateClean(id, {
        status: 'inactive',
        updated_by: req.user?.userId,
      });
      const summaries = await packetsInventoryDAO.findGodownSummariesByPackagingIds([packaging.id]);
      return ResponseHandler.success(
        res,
        this.toPackagingResponse(packaging, summaries),
        'Packaging deactivated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /** Manual packet adjustment — prefer Purchase Packaging for stock receipts */
  async addInventory(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const packagingId = validate<string>(uuidSchema, req.params.id);
      const inventoryData = validate<{ available_quantity: number; godown_id: string; created_by?: string }>(
        Joi.object({
          available_quantity: Joi.number().required().integer().min(0),
          godown_id: Joi.string().required().uuid(),
          created_by: Joi.string().optional().uuid(),
        }),
        req.body
      );

      const packaging = await packagingDAO.findById(packagingId);
      if (!packaging) {
        throw new NotFoundError('Packaging not found');
      }

      if (req.user) {
        inventoryData.created_by = req.user.userId;
      }

      const godownId = inventoryData.godown_id;
      const existingInventory = await packetsInventoryDAO.findByPackagingId(packagingId, godownId);
      const quantityBefore = existingInventory?.available_quantity || 0;

      const inventory = await packetsInventoryDAO.create({
        packaging_id: packagingId,
        godown_id: godownId,
        available_quantity: inventoryData.available_quantity,
        created_by: inventoryData.created_by,
      });

      const stockNote = `Manual Stock Addition | Quantity Added: ${inventoryData.available_quantity} packets | Type: ${packaging.packet_type} (${packaging.holding_capacity} kg capacity)`;

      await packetsInventoryAuditDAO.create({
        packets_inventory_id: inventory.id,
        packaging_id: packagingId,
        operation_type: 'addition',
        quantity_change: inventoryData.available_quantity,
        quantity_before: quantityBefore,
        quantity_after: inventory.available_quantity,
        reason: INVENTORY_AUDIT_REASONS.PACKETS.STOCK_ADDITION,
        reference_type: 'manual_addition',
        notes: stockNote,
        created_by: inventoryData.created_by,
      });

      return ResponseHandler.success(
        res,
        {
          id: inventory.id,
          packaging_id: inventory.packaging_id,
          available_quantity: inventory.available_quantity,
          created_at: inventory.created_at.toISOString(),
          updated_at: inventory.updated_at.toISOString(),
        },
        'Packets added to inventory successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}
