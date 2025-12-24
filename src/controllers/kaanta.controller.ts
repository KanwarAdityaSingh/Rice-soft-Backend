import { Response, NextFunction } from 'express';
import { kaantaDAO } from '../dao/kaanta.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { CreateKaantaDTO, UpdateKaantaDTO, KaantaResponse } from '../models/kaanta.model';
import { validate, createKaantaSchema, updateKaantaSchema, uuidSchema } from '../utils/validators';
import { NotFoundError, ValidationError } from '../utils/errors';
import { ResponseHandler } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';

export class KaantaController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { sauda_id, inward_slip_pass_id } = req.query;

      const kaantas = await kaantaDAO.findAll(
        sauda_id as string | undefined,
        inward_slip_pass_id as string | undefined
      );

      const kaantaResponses: KaantaResponse[] = kaantas.map((kaanta) => ({
        id: kaanta.id,
        kaanta_id: kaanta.kaanta_id,
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
        created_at: kaanta.created_at.toISOString(),
        updated_at: kaanta.updated_at.toISOString(),
      }));

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

      const kaantaResponse: KaantaResponse = {
        id: kaanta.id,
        kaanta_id: kaanta.kaanta_id,
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
        created_at: kaanta.created_at.toISOString(),
        updated_at: kaanta.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, kaantaResponse, 'Kaanta retrieved successfully');
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

      // Set created_by from authenticated user
      if (req.user) {
        kaantaData.created_by = req.user.userId;
      }

      const kaanta = await kaantaDAO.create(kaantaData);

      const kaantaResponse: KaantaResponse = {
        id: kaanta.id,
        kaanta_id: kaanta.kaanta_id,
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
        created_at: kaanta.created_at.toISOString(),
        updated_at: kaanta.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, kaantaResponse, 'Kaanta created successfully (lot auto-created)');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { id } = req.params;
      const kaantaData = validate<UpdateKaantaDTO>(updateKaantaSchema, req.body);

      // Set updated_by from authenticated user
      if (req.user) {
        kaantaData.updated_by = req.user.userId;
      }

      const kaanta = await kaantaDAO.update(id, kaantaData);
      if (!kaanta) {
        throw new NotFoundError('Kaanta not found');
      }

      const kaantaResponse: KaantaResponse = {
        id: kaanta.id,
        kaanta_id: kaanta.kaanta_id,
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
        created_at: kaanta.created_at.toISOString(),
        updated_at: kaanta.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, kaantaResponse, 'Kaanta updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { id } = req.params;

      const deleted = await kaantaDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Kaanta not found');
      }

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
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);

      // Validate file size (max 5MB for images)
      validateFileSize(req.file.size, 5);

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
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);

      // Validate file size (max 5MB for images)
      validateFileSize(req.file.size, 5);

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
}

export const kaantaController = new KaantaController();

