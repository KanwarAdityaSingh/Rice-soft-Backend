import { Response, NextFunction } from 'express';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { inwardSlipPassSaudaDAO } from '../dao/inward-slip-pass-sauda.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { transporterDAO } from '../dao/transporter.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createInwardSlipPassSchema,
  updateInwardSlipPassSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { CreateInwardSlipPassDTO, UpdateInwardSlipPassDTO, InwardSlipPassResponse, InwardSlipStatus } from '../models/inward-slip-pass.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';

export class InwardSlipPassController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const saudaId = req.query.sauda_id as string | undefined;
      
      const inwardSlipPasses = await inwardSlipPassDAO.findAll(saudaId);

      // Fetch sauda_ids for each inward slip pass
      const responses: InwardSlipPassResponse[] = await Promise.all(
        inwardSlipPasses.map(async (pass) => {
          const saudaIds = await inwardSlipPassSaudaDAO.getLinkedSaudaIds(pass.id);
          return {
            id: pass.id,
            sauda_ids: saudaIds,
            slip_number: pass.slip_number,
            date: pass.date.toISOString().split('T')[0],
            vehicle_number: pass.vehicle_number,
            party_name: pass.party_name,
            party_address: pass.party_address,
            party_gst_number: pass.party_gst_number,
            party_pan_number: pass.party_pan_number,
            transporter_id: pass.transporter_id,
            transportation_cost: pass.transportation_cost ? parseFloat(pass.transportation_cost.toString()) : null,
            status: pass.status,
            inward_slip_bill_image_url: pass.inward_slip_bill_image_url,
            transportation_bill_image_url: pass.transportation_bill_image_url,
            bill_pdf_url: pass.bill_pdf_url,
            bilti_image_url: pass.bilti_image_url,
            bilti_pdf_url: pass.bilti_pdf_url,
            eway_bill_number: pass.eway_bill_number,
            eway_bill_url: pass.eway_bill_url,
            notes: pass.notes,
            created_at: pass.created_at.toISOString(),
            updated_at: pass.updated_at.toISOString(),
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

      const saudaIds = await inwardSlipPassSaudaDAO.getLinkedSaudaIds(id);

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        sauda_ids: saudaIds,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_number: inwardSlipPass.vehicle_number,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        party_pan_number: inwardSlipPass.party_pan_number,
        transporter_id: inwardSlipPass.transporter_id,
        transportation_cost: inwardSlipPass.transportation_cost ? parseFloat(inwardSlipPass.transportation_cost.toString()) : null,
        status: inwardSlipPass.status,
        inward_slip_bill_image_url: inwardSlipPass.inward_slip_bill_image_url,
        transportation_bill_image_url: inwardSlipPass.transportation_bill_image_url,
        bill_pdf_url: inwardSlipPass.bill_pdf_url,
        bilti_image_url: inwardSlipPass.bilti_image_url,
        bilti_pdf_url: inwardSlipPass.bilti_pdf_url,
        eway_bill_number: inwardSlipPass.eway_bill_number,
        eway_bill_url: inwardSlipPass.eway_bill_url,
        notes: inwardSlipPass.notes,
        created_at: inwardSlipPass.created_at.toISOString(),
        updated_at: inwardSlipPass.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, response);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const inwardSlipPassData = validate<CreateInwardSlipPassDTO>(createInwardSlipPassSchema, req.body);

      // Validate saudas exist if provided
      if (inwardSlipPassData.sauda_ids && inwardSlipPassData.sauda_ids.length > 0) {
        for (const saudaId of inwardSlipPassData.sauda_ids) {
          const sauda = await saudaDAO.findById(saudaId);
      if (!sauda) {
            throw new NotFoundError(`Sauda not found: ${saudaId}`);
          }
        }
      }

      // Validate transporter if provided
      if (inwardSlipPassData.transporter_id) {
        const transporter = await transporterDAO.findById(inwardSlipPassData.transporter_id);
        if (!transporter) {
          throw new NotFoundError('Transporter not found');
        }
      }

      // Set created_by from authenticated user
      if (req.user) {
        inwardSlipPassData.created_by = req.user.userId;
      }

      // Extract sauda_ids before creating (they're not part of the table)
      const saudaIds = inwardSlipPassData.sauda_ids || [];
      delete (inwardSlipPassData as any).sauda_ids;

      // Create inward slip pass
      const inwardSlipPass = await inwardSlipPassDAO.create(inwardSlipPassData);

      // Link saudas if provided
      if (saudaIds.length > 0) {
        await inwardSlipPassSaudaDAO.linkSaudas(inwardSlipPass.id, saudaIds);
      }

      const linkedSaudaIds = await inwardSlipPassSaudaDAO.getLinkedSaudaIds(inwardSlipPass.id);

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        sauda_ids: linkedSaudaIds,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_number: inwardSlipPass.vehicle_number,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        party_pan_number: inwardSlipPass.party_pan_number,
        transporter_id: inwardSlipPass.transporter_id,
        transportation_cost: inwardSlipPass.transportation_cost ? parseFloat(inwardSlipPass.transportation_cost.toString()) : null,
        status: inwardSlipPass.status,
        inward_slip_bill_image_url: inwardSlipPass.inward_slip_bill_image_url,
        transportation_bill_image_url: inwardSlipPass.transportation_bill_image_url,
        bill_pdf_url: inwardSlipPass.bill_pdf_url,
        bilti_image_url: inwardSlipPass.bilti_image_url,
        bilti_pdf_url: inwardSlipPass.bilti_pdf_url,
        eway_bill_number: inwardSlipPass.eway_bill_number,
        eway_bill_url: inwardSlipPass.eway_bill_url,
        notes: inwardSlipPass.notes,
        created_at: inwardSlipPass.created_at.toISOString(),
        updated_at: inwardSlipPass.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, response, 'Inward slip pass created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      
      const inwardSlipPassData = validate<UpdateInwardSlipPassDTO>(updateInwardSlipPassSchema, req.body);

      // Check if inward slip pass exists
      const existingPass = await inwardSlipPassDAO.findById(id);
      if (!existingPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      // Validate saudas if provided
      if (inwardSlipPassData.sauda_ids !== undefined) {
        for (const saudaId of inwardSlipPassData.sauda_ids) {
          const sauda = await saudaDAO.findById(saudaId);
          if (!sauda) {
            throw new NotFoundError(`Sauda not found: ${saudaId}`);
          }
        }
      }

      // Validate transporter if provided
      if (inwardSlipPassData.transporter_id) {
        const transporter = await transporterDAO.findById(inwardSlipPassData.transporter_id);
        if (!transporter) {
          throw new NotFoundError('Transporter not found');
        }
      }

      // Set updated_by from authenticated user
      if (req.user) {
        inwardSlipPassData.updated_by = req.user.userId;
      }

      // Extract sauda_ids before updating (they're not part of the table)
      const saudaIds = inwardSlipPassData.sauda_ids;
      delete (inwardSlipPassData as any).sauda_ids;

      const inwardSlipPass = await inwardSlipPassDAO.update(id, inwardSlipPassData);
      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found after update');
      }

      // Update linked saudas if sauda_ids was provided
      if (saudaIds !== undefined) {
        // Replace all existing links with the new array
        await inwardSlipPassSaudaDAO.unlinkAllSaudas(id);
        if (saudaIds.length > 0) {
          await inwardSlipPassSaudaDAO.linkSaudas(id, saudaIds);
        }
      }

      const linkedSaudaIds = await inwardSlipPassSaudaDAO.getLinkedSaudaIds(id);

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        sauda_ids: linkedSaudaIds,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_number: inwardSlipPass.vehicle_number,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        party_pan_number: inwardSlipPass.party_pan_number,
        transporter_id: inwardSlipPass.transporter_id,
        transportation_cost: inwardSlipPass.transportation_cost ? parseFloat(inwardSlipPass.transportation_cost.toString()) : null,
        status: inwardSlipPass.status,
        inward_slip_bill_image_url: inwardSlipPass.inward_slip_bill_image_url,
        transportation_bill_image_url: inwardSlipPass.transportation_bill_image_url,
        bill_pdf_url: inwardSlipPass.bill_pdf_url,
        bilti_image_url: inwardSlipPass.bilti_image_url,
        bilti_pdf_url: inwardSlipPass.bilti_pdf_url,
        eway_bill_number: inwardSlipPass.eway_bill_number,
        eway_bill_url: inwardSlipPass.eway_bill_url,
        notes: inwardSlipPass.notes,
        created_at: inwardSlipPass.created_at.toISOString(),
        updated_at: inwardSlipPass.updated_at.toISOString(),
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

      const saudaIds = await inwardSlipPassSaudaDAO.getLinkedSaudaIds(id);

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        sauda_ids: saudaIds,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_number: inwardSlipPass.vehicle_number,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        party_pan_number: inwardSlipPass.party_pan_number,
        transporter_id: inwardSlipPass.transporter_id,
        transportation_cost: inwardSlipPass.transportation_cost ? parseFloat(inwardSlipPass.transportation_cost.toString()) : null,
        status: inwardSlipPass.status,
        inward_slip_bill_image_url: inwardSlipPass.inward_slip_bill_image_url,
        transportation_bill_image_url: inwardSlipPass.transportation_bill_image_url,
        bill_pdf_url: inwardSlipPass.bill_pdf_url,
        bilti_image_url: inwardSlipPass.bilti_image_url,
        bilti_pdf_url: inwardSlipPass.bilti_pdf_url,
        eway_bill_number: inwardSlipPass.eway_bill_number,
        eway_bill_url: inwardSlipPass.eway_bill_url,
        notes: inwardSlipPass.notes,
        created_at: inwardSlipPass.created_at.toISOString(),
        updated_at: inwardSlipPass.updated_at.toISOString(),
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

  async uploadTransportationBill(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf']);

      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.transportationBillsFolder
      );

      const inwardSlipPass = await inwardSlipPassDAO.update(id, {
        transportation_bill_image_url: uploadResult.url,
        updated_by: req.user?.userId,
      });

      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Transportation bill uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadPurchaseBill(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf']);

      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.purchaseBillsFolder
      );

      const isPdf = req.file.mimetype === 'application/pdf';
      const updateData: UpdateInwardSlipPassDTO = {
        updated_by: req.user?.userId,
      };

      if (isPdf) {
        updateData.bill_pdf_url = uploadResult.url;
      } else {
        // For images, storing in bill_pdf_url as well
        updateData.bill_pdf_url = uploadResult.url;
      }

      const inwardSlipPass = await inwardSlipPassDAO.update(id, updateData);

      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Purchase bill uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadBilti(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf']);

      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.biltiFolder
      );

      const isPdf = req.file.mimetype === 'application/pdf';
      const updateData: UpdateInwardSlipPassDTO = {
        updated_by: req.user?.userId,
      };

      if (isPdf) {
        updateData.bilti_pdf_url = uploadResult.url;
      } else {
        updateData.bilti_image_url = uploadResult.url;
      }

      const inwardSlipPass = await inwardSlipPassDAO.update(id, updateData);

      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Bilti uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadEwayBill(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { eway_bill_number } = req.body;

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf']);

      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.ewayBillsFolder
      );

      const inwardSlipPass = await inwardSlipPassDAO.update(id, {
        eway_bill_number: eway_bill_number || null,
        eway_bill_url: uploadResult.url,
        updated_by: req.user?.userId,
      });

      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'E-way bill uploaded successfully');
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


}

export const inwardSlipPassController = new InwardSlipPassController();

