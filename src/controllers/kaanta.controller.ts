import { Response, NextFunction } from 'express';
import { kaantaDAO } from '../dao/kaanta.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { CreateKaantaDTO, UpdateKaantaDTO, Kaanta, KaantaResponse } from '../models/kaanta.model';
import {
  validate,
  createKaantaSchema,
  updateKaantaSchema,
  uuidSchema,
  extractKaantaWeightsSchema,
} from '../utils/validators';
import { NotFoundError, ValidationError } from '../utils/errors';
import { ResponseHandler } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import { inwardSlipPassService } from '../services/inward-slip-pass.service';
import { paymentAdviceService } from '../services/payment-advice.service';
import { kaantaWeightExtractionService } from '../services/kaanta-weight-extraction.service';
import { resolveVehicleNumberMismatchFlag } from '../utils/kaanta-parchi-vehicle-check';

const KAANTA_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

function toKaantaResponse(kaanta: Kaanta): KaantaResponse {
  return {
    id: kaanta.id,
    kaanta_id: kaanta.kaanta_id,
    godown_id: kaanta.godown_id,
    sauda_id: kaanta.sauda_id,
    inward_slip_pass_id: kaanta.inward_slip_pass_id,
    full_truck_weight: parseFloat(kaanta.full_truck_weight.toString()),
    empty_truck_weight: parseFloat(kaanta.empty_truck_weight.toString()),
    kaanta_weight: kaanta.kaanta_weight ? parseFloat(kaanta.kaanta_weight.toString()) : null,
    said_sent_weight: kaanta.said_sent_weight ? parseFloat(kaanta.said_sent_weight.toString()) : null,
    bag_weight: parseFloat(kaanta.bag_weight.toString()),
    no_of_bags: kaanta.no_of_bags,
    bag_type: kaanta.bag_type,
    khaali_kaanta_parchi_url: kaanta.khaali_kaanta_parchi_url,
    bhara_kaanta_parchi_url: kaanta.bhara_kaanta_parchi_url,
    combined_kaanta_parchi_url: kaanta.combined_kaanta_parchi_url,
    ticket_number: kaanta.ticket_number,
    parchi_vehicle_number: kaanta.parchi_vehicle_number,
    vehicle_number_mismatch: kaanta.vehicle_number_mismatch,
    created_at: kaanta.created_at.toISOString(),
    updated_at: kaanta.updated_at.toISOString(),
  };
}

async function applyParchiVehicleMismatchFlag(
  kaantaData: CreateKaantaDTO | UpdateKaantaDTO,
  inwardSlipPassId: string
): Promise<void> {
  if (kaantaData.parchi_vehicle_number === undefined) {
    return;
  }
  kaantaData.vehicle_number_mismatch = await resolveVehicleNumberMismatchFlag(
    kaantaData.parchi_vehicle_number,
    inwardSlipPassId
  );
}

export class KaantaController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { sauda_id, inward_slip_pass_id } = req.query;
      const godownId = req.query.godown_id as string | undefined;

      const kaantas = await kaantaDAO.findAll(
        sauda_id as string | undefined,
        inward_slip_pass_id as string | undefined,
        godownId
      );

      const kaantaResponses: KaantaResponse[] = kaantas.map(toKaantaResponse);

      return ResponseHandler.success(res, kaantaResponses, 'Kaantas retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { id } = req.params;

      const kaanta = await kaantaDAO.findById(id);
      if (!kaanta) {
        throw new NotFoundError('Kaanta not found');
      }

      return ResponseHandler.success(res, toKaantaResponse(kaanta), 'Kaanta retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const kaantaData = validate<CreateKaantaDTO>(createKaantaSchema, req.body);

      // Validate sauda exists
      const sauda = await saudaDAO.findById(kaantaData.sauda_id);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      // Validate inward slip pass exists
      const isp = await inwardSlipPassDAO.findById(kaantaData.inward_slip_pass_id);
      if (!isp) {
        throw new NotFoundError('Inward slip pass not found');
      }
      kaantaData.godown_id = isp.godown_id;

      await inwardSlipPassService.assertPriorKaantaExistsForSequentialIsp(isp.slip_number);

      // Set created_by from authenticated user
      if (req.user) {
        kaantaData.created_by = req.user.userId;
      }

      await applyParchiVehicleMismatchFlag(kaantaData, kaantaData.inward_slip_pass_id);

      const kaanta = await kaantaDAO.create(kaantaData);

      await paymentAdviceService.syncLinkedPendingFromKaanta({
        saudaId: kaanta.sauda_id,
        inwardSlipPassId: kaanta.inward_slip_pass_id,
        updatedBy: req.user?.userId,
      });

      return ResponseHandler.created(
        res,
        toKaantaResponse(kaanta),
        'Kaanta created successfully (lot auto-created)'
      );
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { id } = req.params;
      const kaantaData = validate<UpdateKaantaDTO>(updateKaantaSchema, req.body);

      const existing = await kaantaDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Kaanta not found');
      }
      const ispForKaanta = await inwardSlipPassDAO.findById(existing.inward_slip_pass_id);
      if (!ispForKaanta) {
        throw new NotFoundError('Inward slip pass not found');
      }
      await inwardSlipPassService.assertPriorKaantaExistsForSequentialIsp(ispForKaanta.slip_number);

      // Set updated_by from authenticated user
      if (req.user) {
        kaantaData.updated_by = req.user.userId;
      }

      if (kaantaData.parchi_vehicle_number !== undefined) {
        await applyParchiVehicleMismatchFlag(kaantaData, existing.inward_slip_pass_id);
      }

      const kaanta = await kaantaDAO.update(id, kaantaData);
      if (!kaanta) {
        throw new NotFoundError('Kaanta not found');
      }

      await paymentAdviceService.syncLinkedPendingFromKaanta({
        saudaId: kaanta.sauda_id,
        inwardSlipPassId: kaanta.inward_slip_pass_id,
        updatedBy: req.user?.userId,
      });

      return ResponseHandler.success(res, toKaantaResponse(kaanta), 'Kaanta updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { id } = req.params;

      const existing = await kaantaDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Kaanta not found');
      }

      const deleted = await kaantaDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Kaanta not found');
      }

      await paymentAdviceService.syncLinkedPendingFromKaanta({
        saudaId: existing.sauda_id,
        inwardSlipPassId: existing.inward_slip_pass_id,
        updatedBy: req.user?.userId,
      });

      return ResponseHandler.success(res, null, 'Kaanta deleted successfully (associated lot also deleted)');
    } catch (error) {
      next(error);
    }
  }

  async uploadKhaaliKaantaParchi(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      // Validate file type (images only)
      validateFileType(req.file.mimetype, KAANTA_IMAGE_MIME_TYPES);

      // Validate file size (max 5MB for images)
      validateFileSize(req.file.size, 5);

      const existing = await kaantaDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Kaanta not found');
      }
      const ispForKaanta = await inwardSlipPassDAO.findById(existing.inward_slip_pass_id);
      if (!ispForKaanta) {
        throw new NotFoundError('Inward slip pass not found');
      }
      await inwardSlipPassService.assertPriorKaantaExistsForSequentialIsp(ispForKaanta.slip_number);

      // Upload to S3
      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.kaantaParchisFolder
      );

      // Update kaanta with the image URL
      const kaanta = await kaantaDAO.update(id, {
        khaali_kaanta_parchi_url: uploadResult.url,
        updated_by: req.user?.userId,
      });

      if (!kaanta) {
        throw new NotFoundError('Kaanta not found');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Khaali kaanta parchi uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadBharaKaantaParchi(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      // Validate file type (images only)
      validateFileType(req.file.mimetype, KAANTA_IMAGE_MIME_TYPES);

      // Validate file size (max 5MB for images)
      validateFileSize(req.file.size, 5);

      const existing = await kaantaDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Kaanta not found');
      }
      const ispForKaanta = await inwardSlipPassDAO.findById(existing.inward_slip_pass_id);
      if (!ispForKaanta) {
        throw new NotFoundError('Inward slip pass not found');
      }
      await inwardSlipPassService.assertPriorKaantaExistsForSequentialIsp(ispForKaanta.slip_number);

      // Upload to S3
      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.kaantaParchisFolder
      );

      // Update kaanta with the image URL
      const kaanta = await kaantaDAO.update(id, {
        bhara_kaanta_parchi_url: uploadResult.url,
        updated_by: req.user?.userId,
      });

      if (!kaanta) {
        throw new NotFoundError('Kaanta not found');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Bhara kaanta parchi uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async extractWeights(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileType(req.file.mimetype, KAANTA_IMAGE_MIME_TYPES);
      validateFileSize(req.file.size, 5);

      const { inward_slip_pass_id: inwardSlipPassId } = validate<{ inward_slip_pass_id?: string }>(
        extractKaantaWeightsSchema,
        req.body
      );

      if (inwardSlipPassId) {
        const isp = await inwardSlipPassDAO.findById(inwardSlipPassId);
        if (!isp) {
          throw new NotFoundError('Inward slip pass not found');
        }
      }

      const extraction = await kaantaWeightExtractionService.extractKaantaWeightsFromImage(
        req.file.buffer,
        req.file.mimetype,
        inwardSlipPassId
      );

      return ResponseHandler.success(res, extraction, 'Kaanta slip weights extracted successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadCombinedKaantaParchi(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileType(req.file.mimetype, KAANTA_IMAGE_MIME_TYPES);
      validateFileSize(req.file.size, 5);

      const existing = await kaantaDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Kaanta not found');
      }
      const ispForKaanta = await inwardSlipPassDAO.findById(existing.inward_slip_pass_id);
      if (!ispForKaanta) {
        throw new NotFoundError('Inward slip pass not found');
      }
      await inwardSlipPassService.assertPriorKaantaExistsForSequentialIsp(ispForKaanta.slip_number);

      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.kaantaParchisFolder
      );

      const kaanta = await kaantaDAO.update(id, {
        combined_kaanta_parchi_url: uploadResult.url,
        updated_by: req.user?.userId,
      });

      if (!kaanta) {
        throw new NotFoundError('Kaanta not found');
      }

      return ResponseHandler.success(
        res,
        { url: uploadResult.url },
        'Combined kaanta parchi uploaded successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const kaantaController = new KaantaController();

