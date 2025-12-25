import { Response, NextFunction } from 'express';
import { packagingDAO } from '../dao/packaging.dao';
import { packetsInventoryDAO } from '../dao/packets-inventory.dao';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreatePackagingDTO, UpdatePackagingDTO, PackagingResponse } from '../models/packaging.model';
import { createPackagingSchema, updatePackagingSchema, createPacketsInventorySchema } from '../utils/validators';
import { NotFoundError } from '../utils/errors';

export class PackagingController {
  async getAll(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const packaging = await packagingDAO.findAll();

      const packagingResponses: PackagingResponse[] = packaging.map((pkg) => ({
        id: pkg.id,
        holding_capacity: parseFloat(pkg.holding_capacity.toString()),
        packet_type: pkg.packet_type,
        source: pkg.source,
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
        holding_capacity: parseFloat(packaging.holding_capacity.toString()),
        packet_type: packaging.packet_type,
        source: packaging.source,
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

      // Set created_by from authenticated user
      if (req.user) {
        packagingData.created_by = req.user.userId;
      }

      const packaging = await packagingDAO.create(packagingData);

      const packagingResponse: PackagingResponse = {
        id: packaging.id,
        holding_capacity: parseFloat(packaging.holding_capacity.toString()),
        packet_type: packaging.packet_type,
        source: packaging.source,
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
        holding_capacity: parseFloat(packaging.holding_capacity.toString()),
        packet_type: packaging.packet_type,
        source: packaging.source,
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

      const inventory = await packetsInventoryDAO.create({
        packaging_id: packagingId,
        available_quantity: inventoryData.available_quantity,
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

