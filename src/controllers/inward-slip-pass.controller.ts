import { Response, NextFunction } from 'express';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createInwardSlipPassSchema,
  updateInwardSlipPassSchema,
  updateInwardSlipLotSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { CreateInwardSlipPassDTO, UpdateInwardSlipPassDTO, InwardSlipPassResponse, InwardSlipStatus } from '../models/inward-slip-pass.model';
import { UpdateInwardSlipLotDTO, InwardSlipLotResponse } from '../models/inward-slip-lot.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';

export class InwardSlipPassController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const saudaId = req.query.sauda_id as string | undefined;
      
      const inwardSlipPasses = await inwardSlipPassDAO.findAll(saudaId);

      const responses: InwardSlipPassResponse[] = await Promise.all(
        inwardSlipPasses.map(async (pass) => {
          const lots = await inwardSlipLotDAO.findByInwardSlipPassId(pass.id);
          return {
            id: pass.id,
            sauda_id: pass.sauda_id,
            slip_number: pass.slip_number,
            date: pass.date.toISOString().split('T')[0],
            vehicle_number: pass.vehicle_number,
            party_name: pass.party_name,
            party_address: pass.party_address,
            party_gst_number: pass.party_gst_number,
            status: pass.status,
            inward_slip_bill_image_url: pass.inward_slip_bill_image_url,
            notes: pass.notes,
            created_at: pass.created_at.toISOString(),
            updated_at: pass.updated_at.toISOString(),
            lots: lots.map(lot => ({
              id: lot.id,
              inward_slip_pass_id: lot.inward_slip_pass_id,
              lot_number: lot.lot_number,
              item_name: lot.item_name,
              no_of_bags: lot.no_of_bags,
              bag_weight: lot.bag_weight ? parseFloat(lot.bag_weight.toString()) : null,
              total_weight: lot.total_weight ? parseFloat(lot.total_weight.toString()) : null,
              bill_weight: parseFloat(lot.bill_weight.toString()),
              received_weight: parseFloat(lot.received_weight.toString()),
              bardana: lot.bardana,
              rate: parseFloat(lot.rate.toString()),
              amount: lot.amount ? parseFloat(lot.amount.toString()) : null,
              created_at: lot.created_at.toISOString(),
              updated_at: lot.updated_at.toISOString(),
            })),
          };
        })
      );

      return ResponseHandler.success(res, responses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const inwardSlipPass = await inwardSlipPassDAO.findById(id);
      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      const lots = await inwardSlipLotDAO.findByInwardSlipPassId(id);

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        sauda_id: inwardSlipPass.sauda_id,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_number: inwardSlipPass.vehicle_number,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        status: inwardSlipPass.status,
        inward_slip_bill_image_url: inwardSlipPass.inward_slip_bill_image_url,
        notes: inwardSlipPass.notes,
        created_at: inwardSlipPass.created_at.toISOString(),
        updated_at: inwardSlipPass.updated_at.toISOString(),
        lots: lots.map(lot => ({
          id: lot.id,
          inward_slip_pass_id: lot.inward_slip_pass_id,
          lot_number: lot.lot_number,
          item_name: lot.item_name,
          no_of_bags: lot.no_of_bags,
          bag_weight: lot.bag_weight ? parseFloat(lot.bag_weight.toString()) : null,
          total_weight: lot.total_weight ? parseFloat(lot.total_weight.toString()) : null,
          bill_weight: parseFloat(lot.bill_weight.toString()),
          received_weight: parseFloat(lot.received_weight.toString()),
          bardana: lot.bardana,
          rate: parseFloat(lot.rate.toString()),
          amount: lot.amount ? parseFloat(lot.amount.toString()) : null,
          created_at: lot.created_at.toISOString(),
          updated_at: lot.updated_at.toISOString(),
        })),
      };

      return ResponseHandler.success(res, response);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const inwardSlipPassData = validate<CreateInwardSlipPassDTO>(createInwardSlipPassSchema, req.body);

      // Validate sauda exists
      const sauda = await saudaDAO.findById(inwardSlipPassData.sauda_id);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      // Set created_by from authenticated user
      if (req.user) {
        inwardSlipPassData.created_by = req.user.userId;
      }

      // Create inward slip pass
      const inwardSlipPass = await inwardSlipPassDAO.create(inwardSlipPassData);

      // Create lots if provided
      let lots: any[] = [];
      if (inwardSlipPassData.lots && inwardSlipPassData.lots.length > 0) {
        const lotsToCreate = inwardSlipPassData.lots.map(lot => ({
          ...lot,
          inward_slip_pass_id: inwardSlipPass.id,
          created_by: req.user?.userId,
        }));
        lots = await inwardSlipLotDAO.createMany(lotsToCreate);
      }

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        sauda_id: inwardSlipPass.sauda_id,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_number: inwardSlipPass.vehicle_number,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        status: inwardSlipPass.status,
        inward_slip_bill_image_url: inwardSlipPass.inward_slip_bill_image_url,
        notes: inwardSlipPass.notes,
        created_at: inwardSlipPass.created_at.toISOString(),
        updated_at: inwardSlipPass.updated_at.toISOString(),
        lots: lots.map(lot => ({
          id: lot.id,
          inward_slip_pass_id: lot.inward_slip_pass_id,
          lot_number: lot.lot_number,
          item_name: lot.item_name,
          no_of_bags: lot.no_of_bags,
          bag_weight: lot.bag_weight ? parseFloat(lot.bag_weight.toString()) : null,
          total_weight: lot.total_weight ? parseFloat(lot.total_weight.toString()) : null,
          bill_weight: parseFloat(lot.bill_weight.toString()),
          received_weight: parseFloat(lot.received_weight.toString()),
          bardana: lot.bardana,
          rate: parseFloat(lot.rate.toString()),
          amount: lot.amount ? parseFloat(lot.amount.toString()) : null,
          created_at: lot.created_at.toISOString(),
          updated_at: lot.updated_at.toISOString(),
        })),
      };

      return ResponseHandler.created(res, response, 'Inward slip pass created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      
      // Remove sauda_id and lots from request body if present
      // sauda_id cannot be changed after creation, and lots are managed via separate endpoints
      const { sauda_id: _saudaId, lots: _lots, ...updateData } = req.body;
      
      const inwardSlipPassData = validate<UpdateInwardSlipPassDTO>(updateInwardSlipPassSchema, updateData);

      // Check if inward slip pass exists
      const existingPass = await inwardSlipPassDAO.findById(id);
      if (!existingPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      // Set updated_by from authenticated user
      if (req.user) {
        inwardSlipPassData.updated_by = req.user.userId;
      }

      const inwardSlipPass = await inwardSlipPassDAO.update(id, inwardSlipPassData);
      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found after update');
      }

      const lots = await inwardSlipLotDAO.findByInwardSlipPassId(id);

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        sauda_id: inwardSlipPass.sauda_id,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_number: inwardSlipPass.vehicle_number,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        status: inwardSlipPass.status,
        inward_slip_bill_image_url: inwardSlipPass.inward_slip_bill_image_url,
        notes: inwardSlipPass.notes,
        created_at: inwardSlipPass.created_at.toISOString(),
        updated_at: inwardSlipPass.updated_at.toISOString(),
        lots: lots.map(lot => ({
          id: lot.id,
          inward_slip_pass_id: lot.inward_slip_pass_id,
          lot_number: lot.lot_number,
          item_name: lot.item_name,
          no_of_bags: lot.no_of_bags,
          bag_weight: lot.bag_weight ? parseFloat(lot.bag_weight.toString()) : null,
          total_weight: lot.total_weight ? parseFloat(lot.total_weight.toString()) : null,
          bill_weight: parseFloat(lot.bill_weight.toString()),
          received_weight: parseFloat(lot.received_weight.toString()),
          bardana: lot.bardana,
          rate: parseFloat(lot.rate.toString()),
          amount: lot.amount ? parseFloat(lot.amount.toString()) : null,
          created_at: lot.created_at.toISOString(),
          updated_at: lot.updated_at.toISOString(),
        })),
      };

      return ResponseHandler.success(res, response, 'Inward slip pass updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { status } = req.body;

      if (!status || !['pending', 'completed'].includes(status)) {
        throw new ValidationError('Invalid status. Must be one of: pending, completed');
      }

      const inwardSlipPass = await inwardSlipPassDAO.update(id, { 
        status: status as InwardSlipStatus,
        updated_by: req.user?.userId 
      });

      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      const lots = await inwardSlipLotDAO.findByInwardSlipPassId(id);

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        sauda_id: inwardSlipPass.sauda_id,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_number: inwardSlipPass.vehicle_number,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        status: inwardSlipPass.status,
        inward_slip_bill_image_url: inwardSlipPass.inward_slip_bill_image_url,
        notes: inwardSlipPass.notes,
        created_at: inwardSlipPass.created_at.toISOString(),
        updated_at: inwardSlipPass.updated_at.toISOString(),
        lots: lots.map(lot => ({
          id: lot.id,
          inward_slip_pass_id: lot.inward_slip_pass_id,
          lot_number: lot.lot_number,
          item_name: lot.item_name,
          no_of_bags: lot.no_of_bags,
          bag_weight: lot.bag_weight ? parseFloat(lot.bag_weight.toString()) : null,
          total_weight: lot.total_weight ? parseFloat(lot.total_weight.toString()) : null,
          bill_weight: parseFloat(lot.bill_weight.toString()),
          received_weight: parseFloat(lot.received_weight.toString()),
          bardana: lot.bardana,
          rate: parseFloat(lot.rate.toString()),
          amount: lot.amount ? parseFloat(lot.amount.toString()) : null,
          created_at: lot.created_at.toISOString(),
          updated_at: lot.updated_at.toISOString(),
        })),
      };

      return ResponseHandler.success(res, response, 'Inward slip pass status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadBillImage(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      // Validate file type (images and PDFs)
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']);

      // Validate file size (max 10MB)
      validateFileSize(req.file.size, 10);

      // Upload to S3
      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.inwardSlipBillsFolder
      );

      // Update inward slip pass with the image URL
      const inwardSlipPass = await inwardSlipPassDAO.update(id, {
        inward_slip_bill_image_url: uploadResult.url,
        updated_by: req.user?.userId,
      });

      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Inward slip bill image uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const inwardSlipPass = await inwardSlipPassDAO.findById(id);
      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      const deleted = await inwardSlipPassDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Inward slip pass not found or could not be deleted');
      }

      return ResponseHandler.success(res, null, 'Inward slip pass deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateLot(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const lotId = validate<string>(uuidSchema, req.params.lotId);
      
      const lotData = validate<UpdateInwardSlipLotDTO>(updateInwardSlipLotSchema, req.body);

      // Check if lot exists and belongs to the inward slip pass
      const existingLot = await inwardSlipLotDAO.findById(lotId);
      if (!existingLot) {
        throw new NotFoundError('Inward slip lot not found');
      }

      if (existingLot.inward_slip_pass_id !== id) {
        throw new ValidationError('Lot does not belong to this inward slip pass');
      }

      // Set updated_by from authenticated user
      if (req.user) {
        lotData.updated_by = req.user.userId;
      }

      const lot = await inwardSlipLotDAO.update(lotId, lotData);
      if (!lot) {
        throw new NotFoundError('Inward slip lot not found after update');
      }

      const lotResponse: InwardSlipLotResponse = {
        id: lot.id,
        inward_slip_pass_id: lot.inward_slip_pass_id,
        lot_number: lot.lot_number,
        item_name: lot.item_name,
        no_of_bags: lot.no_of_bags,
        bag_weight: lot.bag_weight ? parseFloat(lot.bag_weight.toString()) : null,
        total_weight: lot.total_weight ? parseFloat(lot.total_weight.toString()) : null,
        bill_weight: parseFloat(lot.bill_weight.toString()),
        received_weight: parseFloat(lot.received_weight.toString()),
        bardana: lot.bardana,
        rate: parseFloat(lot.rate.toString()),
        amount: lot.amount ? parseFloat(lot.amount.toString()) : null,
        created_at: lot.created_at.toISOString(),
        updated_at: lot.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, lotResponse, 'Inward slip lot updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteLot(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const lotId = validate<string>(uuidSchema, req.params.lotId);

      // Check if lot exists and belongs to the inward slip pass
      const existingLot = await inwardSlipLotDAO.findById(lotId);
      if (!existingLot) {
        throw new NotFoundError('Inward slip lot not found');
      }

      if (existingLot.inward_slip_pass_id !== id) {
        throw new ValidationError('Lot does not belong to this inward slip pass');
      }

      const deleted = await inwardSlipLotDAO.delete(lotId);
      if (!deleted) {
        throw new NotFoundError('Inward slip lot not found');
      }

      return ResponseHandler.success(res, null, 'Inward slip lot deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const inwardSlipPassController = new InwardSlipPassController();

