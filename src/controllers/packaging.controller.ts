import { Response, NextFunction } from 'express';
import { packagingDAO } from '../dao/packaging.dao';
import { productDAO } from '../dao/product.dao';
import { packetsInventoryDAO } from '../dao/packets-inventory.dao';
import { packetsInventoryAuditDAO } from '../dao/inventory-audit.dao';
import { INVENTORY_AUDIT_REASONS } from '../models/inventory-audit.model';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreatePackagingDTO, UpdatePackagingDTO, PackagingResponse } from '../models/packaging.model';
import { createPackagingSchema, updatePackagingSchema, createPacketsInventorySchema } from '../utils/validators';
import { NotFoundError } from '../utils/errors';

export class PackagingController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productId = req.query.product_id as string | undefined;
      const packaging = await packagingDAO.findAll(productId);

      const packagingResponses: PackagingResponse[] = packaging.map((pkg) => ({
        id: pkg.id,
        packaging_number: pkg.packaging_number,
        product_id: pkg.product_id,
        holding_capacity: pkg.holding_capacity,
        packet_type: pkg.packet_type,
        packaging_vendor_id: pkg.packaging_vendor_id,
        ordered_weight: pkg.ordered_weight,
        created_at: pkg.created_at.toISOString(),
        updated_at: pkg.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, packagingResponses);
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

      const packagingResponse: PackagingResponse = {
        id: packaging.id,
        packaging_number: packaging.packaging_number,
        product_id: packaging.product_id,
        holding_capacity: packaging.holding_capacity,
        packet_type: packaging.packet_type,
        packaging_vendor_id: packaging.packaging_vendor_id,
        ordered_weight: packaging.ordered_weight,
        created_at: packaging.created_at.toISOString(),
        updated_at: packaging.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, packagingResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const packagingData = validate<CreatePackagingDTO>(createPackagingSchema, req.body);

      // Validate product exists
      const product = await productDAO.findById(packagingData.product_id);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      // Note: Multiple packaging entries with same product_id and holding_capacity are allowed
      // Each entry represents a separate lot with its own inventory

      // Set created_by from authenticated user
      if (req.user) {
        packagingData.created_by = req.user.userId;
      }

      const packaging = await packagingDAO.create(packagingData);

      // If initial_packets is provided, set initial stock (SET, not ADD)
      if (packagingData.initial_packets !== undefined && packagingData.initial_packets !== null && packagingData.initial_packets > 0) {
        // Check if inventory already exists
        const existingInventory = await packetsInventoryDAO.findByPackagingId(packaging.id);
        const quantityBefore = existingInventory?.available_quantity || 0;
        
        // Set initial stock (will SET the quantity, not add to existing)
        const inventory = await packetsInventoryDAO.setInitialStock(
          packaging.id,
          packagingData.initial_packets,
          packagingData.created_by
        );

        // Log the audit for initial stock setting
        const stockNote = `Initial Stock Set on Packaging Creation | Quantity Set: ${packagingData.initial_packets} packets | Type: ${packaging.packet_type} (${packaging.holding_capacity} kg capacity)`;
        
        await packetsInventoryAuditDAO.create({
          packets_inventory_id: inventory.id,
          packaging_id: packaging.id,
          operation_type: 'addition',
          quantity_change: packagingData.initial_packets - quantityBefore,
          quantity_before: quantityBefore,
          quantity_after: inventory.available_quantity,
          reason: INVENTORY_AUDIT_REASONS.PACKETS.STOCK_ADDITION,
          reference_type: 'packaging_creation',
          notes: stockNote,
          created_by: packagingData.created_by
        });
      }

      const packagingResponse: PackagingResponse = {
        id: packaging.id,
        packaging_number: packaging.packaging_number,
        product_id: packaging.product_id,
        holding_capacity: packaging.holding_capacity,
        packet_type: packaging.packet_type,
        packaging_vendor_id: packaging.packaging_vendor_id,
        ordered_weight: packaging.ordered_weight,
        created_at: packaging.created_at.toISOString(),
        updated_at: packaging.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, packagingResponse, 'Packaging created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const packagingData = validate<UpdatePackagingDTO>(updatePackagingSchema, req.body);

      // Set updated_by from authenticated user
      if (req.user) {
        packagingData.updated_by = req.user.userId;
      }

      const packaging = await packagingDAO.update(id, packagingData);
      if (!packaging) {
        throw new NotFoundError('Packaging not found');
      }

      const packagingResponse: PackagingResponse = {
        id: packaging.id,
        packaging_number: packaging.packaging_number,
        product_id: packaging.product_id,
        holding_capacity: packaging.holding_capacity,
        packet_type: packaging.packet_type,
        packaging_vendor_id: packaging.packaging_vendor_id,
        ordered_weight: packaging.ordered_weight,
        created_at: packaging.created_at.toISOString(),
        updated_at: packaging.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, packagingResponse, 'Packaging updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const deleted = await packagingDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Packaging not found');
      }

      return ResponseHandler.success(res, null, 'Packaging deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async addInventory(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const packagingId = validate<string>(uuidSchema, req.params.id);
      const inventoryData = validate<{ available_quantity: number; created_by?: string }>(createPacketsInventorySchema, req.body);

      const packaging = await packagingDAO.findById(packagingId);
      if (!packaging) {
        throw new NotFoundError('Packaging not found');
      }

      // Set created_by from authenticated user
      if (req.user) {
        inventoryData.created_by = req.user.userId;
      }

      // Get current inventory for audit
      const existingInventory = await packetsInventoryDAO.findByPackagingId(packagingId);
      const quantityBefore = existingInventory?.available_quantity || 0;

      const inventory = await packetsInventoryDAO.create({
        packaging_id: packagingId,
        available_quantity: inventoryData.available_quantity,
        created_by: inventoryData.created_by
      });

      // Log the audit for packets addition
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
        created_by: inventoryData.created_by
      });

      return ResponseHandler.success(res, {
        id: inventory.id,
        packaging_id: inventory.packaging_id,
        available_quantity: inventory.available_quantity,
        created_at: inventory.created_at.toISOString(),
        updated_at: inventory.updated_at.toISOString(),
      }, 'Packets added to inventory successfully');
    } catch (error) {
      next(error);
    }
  }
}
