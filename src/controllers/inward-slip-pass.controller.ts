import { Response, NextFunction } from 'express';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { inwardSlipPassSaudaDAO } from '../dao/inward-slip-pass-sauda.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { transporterDAO } from '../dao/transporter.dao';
import { vehicleDAO } from '../dao/vehicle.dao';
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
  ConflictError,
  InternalServerError,
} from '../utils/errors';
import { CreateInwardSlipPassDTO, UpdateInwardSlipPassDTO, InwardSlipPassResponse, InwardSlipStatus } from '../models/inward-slip-pass.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import { godownService } from '../services/godown.service';

export class InwardSlipPassController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const saudaId = req.query.sauda_id as string | undefined;
      const godownId = req.query.godown_id as string | undefined;
      
      const inwardSlipPasses = await inwardSlipPassDAO.findAll(saudaId, godownId);

      // Fetch sauda_ids for each inward slip pass
      const responses: InwardSlipPassResponse[] = await Promise.all(
        inwardSlipPasses.map(async (pass) => {
          const saudaIds = await inwardSlipPassSaudaDAO.getLinkedSaudaIds(pass.id);
          return {
            id: pass.id,
            godown_id: pass.godown_id,
            sauda_ids: saudaIds,
            slip_number: pass.slip_number,
            date: pass.date.toISOString().split('T')[0],
            vehicle_id: pass.vehicle_id,
            party_name: pass.party_name,
            party_address: pass.party_address,
            party_gst_number: pass.party_gst_number,
            party_pan_number: pass.party_pan_number,
            transporter_id: pass.transporter_id,
            transportation_cost: pass.transportation_cost ? parseFloat(pass.transportation_cost.toString()) : null,
            status: pass.status,
            other_bills: pass.other_bills,
            bill_pdf_url: pass.bill_pdf_url,
            bill_number: pass.bill_number,
            bill_date: pass.bill_date ? pass.bill_date.toISOString().split('T')[0] : null,
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
        godown_id: inwardSlipPass.godown_id,
        sauda_ids: saudaIds,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_id: inwardSlipPass.vehicle_id,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        party_pan_number: inwardSlipPass.party_pan_number,
        transporter_id: inwardSlipPass.transporter_id,
        transportation_cost: inwardSlipPass.transportation_cost ? parseFloat(inwardSlipPass.transportation_cost.toString()) : null,
        status: inwardSlipPass.status,
        other_bills: inwardSlipPass.other_bills,
        bill_pdf_url: inwardSlipPass.bill_pdf_url,
        bill_number: inwardSlipPass.bill_number,
        bill_date: inwardSlipPass.bill_date ? inwardSlipPass.bill_date.toISOString().split('T')[0] : null,
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
      await godownService.assertActive(inwardSlipPassData.godown_id);

      // Validate vehicle exists
      const vehicle = await vehicleDAO.findById(inwardSlipPassData.vehicle_id);
      if (!vehicle) {
        throw new NotFoundError('Vehicle not found');
      }

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
      let inwardSlipPass;
      try {
        inwardSlipPass = await inwardSlipPassDAO.create(inwardSlipPassData);
      } catch (dbError: any) {
        // Check for database constraint violations
        if (dbError?.code === '23505') {
          throw new ConflictError('An inward slip pass with this information already exists');
        }
        if (dbError?.code === '23503') {
          throw new ValidationError('Invalid reference: vehicle or transporter does not exist');
        }
        throw new InternalServerError('Failed to create inward slip pass. Please try again.');
      }

      // Link saudas if provided
      if (saudaIds.length > 0) {
        try {
          await inwardSlipPassSaudaDAO.linkSaudas(inwardSlipPass.id, saudaIds);
        } catch (linkError: any) {
          // If linking fails, we should ideally rollback the ISP creation
          // For now, log the error and provide a clear message
          throw new InternalServerError('Failed to link saudas to inward slip pass. Please try again.');
        }
      }

      const linkedSaudaIds = await inwardSlipPassSaudaDAO.getLinkedSaudaIds(inwardSlipPass.id);

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        godown_id: inwardSlipPass.godown_id,
        sauda_ids: linkedSaudaIds,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_id: inwardSlipPass.vehicle_id,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        party_pan_number: inwardSlipPass.party_pan_number,
        transporter_id: inwardSlipPass.transporter_id,
        transportation_cost: inwardSlipPass.transportation_cost ? parseFloat(inwardSlipPass.transportation_cost.toString()) : null,
        status: inwardSlipPass.status,
        other_bills: inwardSlipPass.other_bills,
        bill_pdf_url: inwardSlipPass.bill_pdf_url,
        bill_number: inwardSlipPass.bill_number,
        bill_date: inwardSlipPass.bill_date ? inwardSlipPass.bill_date.toISOString().split('T')[0] : null,
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
      if (inwardSlipPassData.godown_id) {
        await godownService.assertActive(inwardSlipPassData.godown_id);
      }

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

      let inwardSlipPass;
      try {
        inwardSlipPass = await inwardSlipPassDAO.update(id, inwardSlipPassData);
        if (!inwardSlipPass) {
          throw new NotFoundError('Inward slip pass not found after update');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        // Check for database constraint violations
        if (dbError?.code === '23505') {
          throw new ConflictError('An inward slip pass with this information already exists');
        }
        if (dbError?.code === '23503') {
          throw new ValidationError('Invalid reference: vehicle or transporter does not exist');
        }
        throw new InternalServerError('Failed to update inward slip pass. Please try again.');
      }

      // Update linked saudas if sauda_ids was provided
      if (saudaIds !== undefined) {
        try {
          // Replace all existing links with the new array
          await inwardSlipPassSaudaDAO.unlinkAllSaudas(id);
          if (saudaIds.length > 0) {
            await inwardSlipPassSaudaDAO.linkSaudas(id, saudaIds);
          }
        } catch (linkError: any) {
          throw new InternalServerError('Failed to update sauda links. Please try again.');
        }
      }

      const linkedSaudaIds = await inwardSlipPassSaudaDAO.getLinkedSaudaIds(id);

      const response: InwardSlipPassResponse = {
        id: inwardSlipPass.id,
        godown_id: inwardSlipPass.godown_id,
        sauda_ids: linkedSaudaIds,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_id: inwardSlipPass.vehicle_id,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        party_pan_number: inwardSlipPass.party_pan_number,
        transporter_id: inwardSlipPass.transporter_id,
        transportation_cost: inwardSlipPass.transportation_cost ? parseFloat(inwardSlipPass.transportation_cost.toString()) : null,
        status: inwardSlipPass.status,
        other_bills: inwardSlipPass.other_bills,
        bill_pdf_url: inwardSlipPass.bill_pdf_url,
        bill_number: inwardSlipPass.bill_number,
        bill_date: inwardSlipPass.bill_date ? inwardSlipPass.bill_date.toISOString().split('T')[0] : null,
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
        godown_id: inwardSlipPass.godown_id,
        sauda_ids: saudaIds,
        slip_number: inwardSlipPass.slip_number,
        date: inwardSlipPass.date.toISOString().split('T')[0],
        vehicle_id: inwardSlipPass.vehicle_id,
        party_name: inwardSlipPass.party_name,
        party_address: inwardSlipPass.party_address,
        party_gst_number: inwardSlipPass.party_gst_number,
        party_pan_number: inwardSlipPass.party_pan_number,
        transporter_id: inwardSlipPass.transporter_id,
        transportation_cost: inwardSlipPass.transportation_cost ? parseFloat(inwardSlipPass.transportation_cost.toString()) : null,
        status: inwardSlipPass.status,
        other_bills: inwardSlipPass.other_bills,
        bill_pdf_url: inwardSlipPass.bill_pdf_url,
        bill_number: inwardSlipPass.bill_number,
        bill_date: inwardSlipPass.bill_date ? inwardSlipPass.bill_date.toISOString().split('T')[0] : null,
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

  async uploadOtherBill(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { name } = req.body;

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      if (!name || typeof name !== 'string' || name.trim() === '') {
        throw new ValidationError('Bill name is required');
      }

      // Validate file type (images and PDFs)
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'application/pdf']);

      // Validate file size (max 10MB)
      validateFileSize(req.file.size, 10);

      // Get current ISP to access existing other_bills
      const currentISP = await inwardSlipPassDAO.findById(id);
      if (!currentISP) {
        throw new NotFoundError('Inward slip pass not found');
      }

      // Upload to S3
      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.inwardSlipBillsFolder
        );
      } catch (uploadError: any) {
        throw new InternalServerError('Failed to upload file. Please try again.');
      }

      // Add new bill to other_bills array
      const newBill = {
        name: name.trim(),
        url: uploadResult.url,
        uploaded_at: new Date().toISOString(),
      };

      const updatedOtherBills = [...(currentISP.other_bills || []), newBill];

      // Update inward slip pass with the new bill added to other_bills
      let inwardSlipPass;
      try {
        inwardSlipPass = await inwardSlipPassDAO.update(id, {
          other_bills: updatedOtherBills,
          updated_by: req.user?.userId,
        });

        if (!inwardSlipPass) {
          throw new NotFoundError('Inward slip pass not found');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        throw new InternalServerError('Failed to update inward slip pass with bill. Please try again.');
      }

      return ResponseHandler.success(res, { bill: newBill }, 'Other bill uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteOtherBill(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { url } = req.body;

      if (!url || typeof url !== 'string') {
        throw new ValidationError('Bill URL is required');
      }

      // Get current ISP to access existing other_bills
      const currentISP = await inwardSlipPassDAO.findById(id);
      if (!currentISP) {
        throw new NotFoundError('Inward slip pass not found');
      }

      // Remove bill from other_bills array
      const updatedOtherBills = (currentISP.other_bills || []).filter(
        (bill) => bill.url !== url
      );

      // Check if bill was actually removed
      if (updatedOtherBills.length === (currentISP.other_bills || []).length) {
        throw new NotFoundError('Bill not found in other bills');
      }

      // Update inward slip pass with the bill removed from other_bills
      const inwardSlipPass = await inwardSlipPassDAO.update(id, {
        other_bills: updatedOtherBills,
        updated_by: req.user?.userId,
      });

      if (!inwardSlipPass) {
        throw new NotFoundError('Inward slip pass not found');
      }

      return ResponseHandler.success(res, { other_bills: inwardSlipPass.other_bills }, 'Other bill deleted successfully');
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

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.purchaseBillsFolder
        );
      } catch (uploadError: any) {
        throw new InternalServerError('Failed to upload purchase bill. Please try again.');
      }

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

      // Extract bill_number and bill_date from request body (multipart/form-data)
      if (req.body.bill_number) {
        updateData.bill_number = req.body.bill_number;
      }
      if (req.body.bill_date) {
        updateData.bill_date = req.body.bill_date;
      }

      let inwardSlipPass;
      try {
        inwardSlipPass = await inwardSlipPassDAO.update(id, updateData);

        if (!inwardSlipPass) {
          throw new NotFoundError('Inward slip pass not found');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        throw new InternalServerError('Failed to update inward slip pass with purchase bill. Please try again.');
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

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.biltiFolder
        );
      } catch (uploadError: any) {
        throw new InternalServerError('Failed to upload bilti. Please try again.');
      }

      const isPdf = req.file.mimetype === 'application/pdf';
      const updateData: UpdateInwardSlipPassDTO = {
        updated_by: req.user?.userId,
      };

      if (isPdf) {
        updateData.bilti_pdf_url = uploadResult.url;
      } else {
        updateData.bilti_image_url = uploadResult.url;
      }

      let inwardSlipPass;
      try {
        inwardSlipPass = await inwardSlipPassDAO.update(id, updateData);

        if (!inwardSlipPass) {
          throw new NotFoundError('Inward slip pass not found');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        throw new InternalServerError('Failed to update inward slip pass with bilti. Please try again.');
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

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.ewayBillsFolder
        );
      } catch (uploadError: any) {
        throw new InternalServerError('Failed to upload e-way bill. Please try again.');
      }

      let inwardSlipPass;
      try {
        inwardSlipPass = await inwardSlipPassDAO.update(id, {
          eway_bill_number: eway_bill_number || null,
          eway_bill_url: uploadResult.url,
          updated_by: req.user?.userId,
        });

        if (!inwardSlipPass) {
          throw new NotFoundError('Inward slip pass not found');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        throw new InternalServerError('Failed to update inward slip pass with e-way bill. Please try again.');
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

      try {
        const deleted = await inwardSlipPassDAO.delete(id);
        if (!deleted) {
          throw new NotFoundError('Inward slip pass not found or could not be deleted');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        // Check for foreign key constraint violations (ISP might be referenced elsewhere)
        if (dbError?.code === '23503') {
          throw new ConflictError('Cannot delete inward slip pass. It is being used in other records (lots, purchases, etc.).');
        }
        throw new InternalServerError('Failed to delete inward slip pass. Please try again.');
      }

      return ResponseHandler.success(res, null, 'Inward slip pass deleted successfully');
    } catch (error) {
      next(error);
    }
  }


}

export const inwardSlipPassController = new InwardSlipPassController();

