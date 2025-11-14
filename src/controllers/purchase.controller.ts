import { Response, NextFunction } from 'express';
import { purchaseDAO } from '../dao/purchase.dao';
import { vendorDAO } from '../dao/vendor.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { brokerDAO } from '../dao/broker.dao';
import { transporterDAO } from '../dao/transporter.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createPurchaseSchema,
  updatePurchaseSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { CreatePurchaseDTO, UpdatePurchaseDTO, PurchaseResponse } from '../models/purchase.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';

export class PurchaseController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vendorId = req.query.vendor_id as string | undefined;
      const saudaId = req.query.sauda_id as string | undefined;
      
      const purchases = await purchaseDAO.findAll(vendorId, saudaId);

      const purchaseResponses: PurchaseResponse[] = purchases.map((purchase) => ({
        id: purchase.id,
        vendor_id: purchase.vendor_id,
        sauda_id: purchase.sauda_id,
        broker_id: purchase.broker_id,
        broker_commission: purchase.broker_commission ? parseFloat(purchase.broker_commission.toString()) : null,
        payment_advice_id: purchase.payment_advice_id,
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date?.toISOString().split('T')[0] || null,
        rate: parseFloat(purchase.rate.toString()),
        total_weight: purchase.total_weight ? parseFloat(purchase.total_weight.toString()) : null,
        total_amount: purchase.total_amount ? parseFloat(purchase.total_amount.toString()) : null,
        igst_amount: purchase.igst_amount ? parseFloat(purchase.igst_amount.toString()) : null,
        igst_percentage: purchase.igst_percentage ? parseFloat(purchase.igst_percentage.toString()) : null,
        freight_status: purchase.freight_status,
        transportation_bill_image_url: purchase.transportation_bill_image_url,
        bill_pdf_url: purchase.bill_pdf_url,
        bilti_image_url: purchase.bilti_image_url,
        bilti_pdf_url: purchase.bilti_pdf_url,
        eway_bill_number: purchase.eway_bill_number,
        eway_bill_url: purchase.eway_bill_url,
        truck_number: purchase.truck_number,
        transport_name: purchase.transport_name,
        goods_dispatched_from: purchase.goods_dispatched_from,
        goods_dispatched_to: purchase.goods_dispatched_to,
        purchase_date: purchase.purchase_date.toISOString().split('T')[0],
        expected_quantity: purchase.expected_quantity ? parseFloat(purchase.expected_quantity.toString()) : null,
        notes: purchase.notes,
        created_at: purchase.created_at.toISOString(),
        updated_at: purchase.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, purchaseResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const purchase = await purchaseDAO.findById(id);
      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      const purchaseResponse: PurchaseResponse = {
        id: purchase.id,
        vendor_id: purchase.vendor_id,
        sauda_id: purchase.sauda_id,
        broker_id: purchase.broker_id,
        broker_commission: purchase.broker_commission ? parseFloat(purchase.broker_commission.toString()) : null,
        payment_advice_id: purchase.payment_advice_id,
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date?.toISOString().split('T')[0] || null,
        rate: parseFloat(purchase.rate.toString()),
        total_weight: purchase.total_weight ? parseFloat(purchase.total_weight.toString()) : null,
        total_amount: purchase.total_amount ? parseFloat(purchase.total_amount.toString()) : null,
        igst_amount: purchase.igst_amount ? parseFloat(purchase.igst_amount.toString()) : null,
        igst_percentage: purchase.igst_percentage ? parseFloat(purchase.igst_percentage.toString()) : null,
        freight_status: purchase.freight_status,
        transportation_bill_image_url: purchase.transportation_bill_image_url,
        bill_pdf_url: purchase.bill_pdf_url,
        bilti_image_url: purchase.bilti_image_url,
        bilti_pdf_url: purchase.bilti_pdf_url,
        eway_bill_number: purchase.eway_bill_number,
        eway_bill_url: purchase.eway_bill_url,
        truck_number: purchase.truck_number,
        transport_name: purchase.transport_name,
        goods_dispatched_from: purchase.goods_dispatched_from,
        goods_dispatched_to: purchase.goods_dispatched_to,
        purchase_date: purchase.purchase_date.toISOString().split('T')[0],
        expected_quantity: purchase.expected_quantity ? parseFloat(purchase.expected_quantity.toString()) : null,
        notes: purchase.notes,
        created_at: purchase.created_at.toISOString(),
        updated_at: purchase.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, purchaseResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const purchaseData = validate<CreatePurchaseDTO>(createPurchaseSchema, req.body);

      // Validate vendor exists
      const vendor = await vendorDAO.findById(purchaseData.vendor_id);
      if (!vendor) {
        throw new NotFoundError('Vendor not found');
      }

      // Validate sauda exists and get rate if not provided
      const sauda = await saudaDAO.findById(purchaseData.sauda_id);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      // Auto-fill rate from sauda if not provided
      if (!purchaseData.rate) {
        purchaseData.rate = parseFloat(sauda.rate.toString());
      }

      // Auto-populate transport details from sauda's transporter if not provided
      if (sauda.transporter_id && (!purchaseData.transport_name || !purchaseData.truck_number)) {
        const transporter = await transporterDAO.findById(sauda.transporter_id);
        if (transporter) {
          // Auto-fill transport_name from transporter's business_name if not provided
          if (!purchaseData.transport_name) {
            purchaseData.transport_name = transporter.business_name;
          }
          
          // Auto-fill truck_number from transporter's vehicle_numbers (first one) if not provided
          if (!purchaseData.truck_number && transporter.vehicle_numbers && transporter.vehicle_numbers.length > 0) {
            purchaseData.truck_number = transporter.vehicle_numbers[0];
          }
        }
      }

      // Validate broker if provided
      if (purchaseData.broker_id) {
        const broker = await brokerDAO.findById(purchaseData.broker_id);
        if (!broker) {
          throw new NotFoundError('Broker not found');
        }
      }

      // Set created_by from authenticated user
      if (req.user) {
        purchaseData.created_by = req.user.userId;
      }

      const purchase = await purchaseDAO.create(purchaseData as CreatePurchaseDTO & { rate: number });

      const purchaseResponse: PurchaseResponse = {
        id: purchase.id,
        vendor_id: purchase.vendor_id,
        sauda_id: purchase.sauda_id,
        broker_id: purchase.broker_id,
        broker_commission: purchase.broker_commission ? parseFloat(purchase.broker_commission.toString()) : null,
        payment_advice_id: purchase.payment_advice_id,
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date?.toISOString().split('T')[0] || null,
        rate: parseFloat(purchase.rate.toString()),
        total_weight: purchase.total_weight ? parseFloat(purchase.total_weight.toString()) : null,
        total_amount: purchase.total_amount ? parseFloat(purchase.total_amount.toString()) : null,
        igst_amount: purchase.igst_amount ? parseFloat(purchase.igst_amount.toString()) : null,
        igst_percentage: purchase.igst_percentage ? parseFloat(purchase.igst_percentage.toString()) : null,
        freight_status: purchase.freight_status,
        transportation_bill_image_url: purchase.transportation_bill_image_url,
        bill_pdf_url: purchase.bill_pdf_url,
        bilti_image_url: purchase.bilti_image_url,
        bilti_pdf_url: purchase.bilti_pdf_url,
        eway_bill_number: purchase.eway_bill_number,
        eway_bill_url: purchase.eway_bill_url,
        truck_number: purchase.truck_number,
        transport_name: purchase.transport_name,
        goods_dispatched_from: purchase.goods_dispatched_from,
        goods_dispatched_to: purchase.goods_dispatched_to,
        purchase_date: purchase.purchase_date.toISOString().split('T')[0],
        expected_quantity: purchase.expected_quantity ? parseFloat(purchase.expected_quantity.toString()) : null,
        notes: purchase.notes,
        created_at: purchase.created_at.toISOString(),
        updated_at: purchase.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, purchaseResponse, 'Purchase created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const purchaseData = validate<UpdatePurchaseDTO>(updatePurchaseSchema, req.body);

      // Check if purchase exists
      const existingPurchase = await purchaseDAO.findById(id);
      if (!existingPurchase) {
        throw new NotFoundError('Purchase not found');
      }

      // Set updated_by from authenticated user
      if (req.user) {
        purchaseData.updated_by = req.user.userId;
      }

      const purchase = await purchaseDAO.update(id, purchaseData);
      if (!purchase) {
        throw new NotFoundError('Purchase not found after update');
      }

      const purchaseResponse: PurchaseResponse = {
        id: purchase.id,
        vendor_id: purchase.vendor_id,
        sauda_id: purchase.sauda_id,
        broker_id: purchase.broker_id,
        broker_commission: purchase.broker_commission ? parseFloat(purchase.broker_commission.toString()) : null,
        payment_advice_id: purchase.payment_advice_id,
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date?.toISOString().split('T')[0] || null,
        rate: parseFloat(purchase.rate.toString()),
        total_weight: purchase.total_weight ? parseFloat(purchase.total_weight.toString()) : null,
        total_amount: purchase.total_amount ? parseFloat(purchase.total_amount.toString()) : null,
        igst_amount: purchase.igst_amount ? parseFloat(purchase.igst_amount.toString()) : null,
        igst_percentage: purchase.igst_percentage ? parseFloat(purchase.igst_percentage.toString()) : null,
        freight_status: purchase.freight_status,
        transportation_bill_image_url: purchase.transportation_bill_image_url,
        bill_pdf_url: purchase.bill_pdf_url,
        bilti_image_url: purchase.bilti_image_url,
        bilti_pdf_url: purchase.bilti_pdf_url,
        eway_bill_number: purchase.eway_bill_number,
        eway_bill_url: purchase.eway_bill_url,
        truck_number: purchase.truck_number,
        transport_name: purchase.transport_name,
        goods_dispatched_from: purchase.goods_dispatched_from,
        goods_dispatched_to: purchase.goods_dispatched_to,
        purchase_date: purchase.purchase_date.toISOString().split('T')[0],
        expected_quantity: purchase.expected_quantity ? parseFloat(purchase.expected_quantity.toString()) : null,
        notes: purchase.notes,
        created_at: purchase.created_at.toISOString(),
        updated_at: purchase.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, purchaseResponse, 'Purchase updated successfully');
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

      const purchase = await purchaseDAO.update(id, {
        transportation_bill_image_url: uploadResult.url,
        updated_by: req.user?.userId,
      });

      if (!purchase) {
        throw new NotFoundError('Purchase not found');
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
      const updateData: UpdatePurchaseDTO = {
        updated_by: req.user?.userId,
      };

      if (isPdf) {
        updateData.bill_pdf_url = uploadResult.url;
      } else {
        // For images, we might want to store in a different field or handle differently
        // For now, storing in bill_pdf_url as well
        updateData.bill_pdf_url = uploadResult.url;
      }

      const purchase = await purchaseDAO.update(id, updateData);

      if (!purchase) {
        throw new NotFoundError('Purchase not found');
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
      const updateData: UpdatePurchaseDTO = {
        updated_by: req.user?.userId,
      };

      if (isPdf) {
        updateData.bilti_pdf_url = uploadResult.url;
      } else {
        updateData.bilti_image_url = uploadResult.url;
      }

      const purchase = await purchaseDAO.update(id, updateData);

      if (!purchase) {
        throw new NotFoundError('Purchase not found');
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

      const purchase = await purchaseDAO.update(id, {
        eway_bill_number: eway_bill_number || null,
        eway_bill_url: uploadResult.url,
        updated_by: req.user?.userId,
      });

      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'E-way bill uploaded successfully');
    } catch (error) {
      next(error);
    }
  }


  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const purchase = await purchaseDAO.findById(id);
      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      const deleted = await purchaseDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Purchase not found or could not be deleted');
      }

      return ResponseHandler.success(res, null, 'Purchase deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const purchaseController = new PurchaseController();

