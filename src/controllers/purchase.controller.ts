import { Response, NextFunction } from 'express';
import { purchaseDAO } from '../dao/purchase.dao';
import { vendorDAO } from '../dao/vendor.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { brokerDAO } from '../dao/broker.dao';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
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
import { calculatePurchaseAmountFromLinkedLots } from '../utils/purchase-calculations';

export class PurchaseController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vendorId = req.query.vendor_id as string | undefined;
      
      const purchases = await purchaseDAO.findAll(vendorId);

      const purchaseResponses: PurchaseResponse[] = purchases.map((purchase) => ({
        id: purchase.id,
        vendor_id: purchase.vendor_id,
        broker_id: purchase.broker_id,
        broker_commission: purchase.broker_commission ? parseFloat(purchase.broker_commission.toString()) : null,
        payment_advice_id: purchase.payment_advice_id,
        cash_discount: purchase.cash_discount ? parseFloat(purchase.cash_discount.toString()) : null,
        transportation_cost: purchase.transportation_cost ? parseFloat(purchase.transportation_cost.toString()) : null,
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date?.toISOString().split('T')[0] || null,
        rate: parseFloat(purchase.rate.toString()),
        total_weight: purchase.total_weight ? parseFloat(purchase.total_weight.toString()) : null,
        total_amount: purchase.total_amount ? parseFloat(purchase.total_amount.toString()) : null,
        igst_amount: purchase.igst_amount ? parseFloat(purchase.igst_amount.toString()) : null,
        igst_percentage: purchase.igst_percentage ? parseFloat(purchase.igst_percentage.toString()) : null,
        freight_status: purchase.freight_status,
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
        broker_id: purchase.broker_id,
        broker_commission: purchase.broker_commission ? parseFloat(purchase.broker_commission.toString()) : null,
        payment_advice_id: purchase.payment_advice_id,
        cash_discount: purchase.cash_discount ? parseFloat(purchase.cash_discount.toString()) : null,
        transportation_cost: purchase.transportation_cost ? parseFloat(purchase.transportation_cost.toString()) : null,
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date?.toISOString().split('T')[0] || null,
        rate: parseFloat(purchase.rate.toString()),
        total_weight: purchase.total_weight ? parseFloat(purchase.total_weight.toString()) : null,
        total_amount: purchase.total_amount ? parseFloat(purchase.total_amount.toString()) : null,
        igst_amount: purchase.igst_amount ? parseFloat(purchase.igst_amount.toString()) : null,
        igst_percentage: purchase.igst_percentage ? parseFloat(purchase.igst_percentage.toString()) : null,
        freight_status: purchase.freight_status,
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

      // Validate all saudas exist if provided
      if (purchaseData.sauda_ids && purchaseData.sauda_ids.length > 0) {
        for (const saudaId of purchaseData.sauda_ids) {
          const sauda = await saudaDAO.findById(saudaId);
      if (!sauda) {
            throw new NotFoundError(`Sauda not found: ${saudaId}`);
          }
        }
      }

      // Validate all inward slip passes exist if provided
      if (purchaseData.inward_slip_pass_ids && purchaseData.inward_slip_pass_ids.length > 0) {
        for (const ispId of purchaseData.inward_slip_pass_ids) {
          const isp = await inwardSlipPassDAO.findById(ispId);
          if (!isp) {
            throw new NotFoundError(`Inward slip pass not found: ${ispId}`);
          }
        }
      }

      // Validate all lots exist if provided
      if (purchaseData.lot_ids && purchaseData.lot_ids.length > 0) {
        for (const lotId of purchaseData.lot_ids) {
          const lot = await inwardSlipLotDAO.findById(lotId);
          if (!lot) {
            throw new NotFoundError(`Lot not found: ${lotId}`);
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

      // Set default rate if not provided (use first sauda's rate or 0)
      if (!purchaseData.rate && purchaseData.sauda_ids && purchaseData.sauda_ids.length > 0) {
        const firstSauda = await saudaDAO.findById(purchaseData.sauda_ids[0]);
        if (firstSauda) {
          purchaseData.rate = parseFloat(firstSauda.rate.toString());
        }
      }
      if (!purchaseData.rate) {
        purchaseData.rate = 0;
      }

      // Set created_by from authenticated user
      if (req.user) {
        purchaseData.created_by = req.user.userId;
      }

      // Create purchase
      const purchase = await purchaseDAO.create(purchaseData as CreatePurchaseDTO & { rate: number });

      // Link entities if provided
      if (purchaseData.sauda_ids && purchaseData.sauda_ids.length > 0) {
        await purchaseDAO.linkSaudas(purchase.id, purchaseData.sauda_ids);
      }
      if (purchaseData.inward_slip_pass_ids && purchaseData.inward_slip_pass_ids.length > 0) {
        await purchaseDAO.linkInwardSlipPasses(purchase.id, purchaseData.inward_slip_pass_ids);
      }
      if (purchaseData.lot_ids && purchaseData.lot_ids.length > 0) {
        await purchaseDAO.linkLots(purchase.id, purchaseData.lot_ids);
      }

      // Calculate totals from linked lots if any lots are linked
      if (purchaseData.lot_ids && purchaseData.lot_ids.length > 0) {
        const calculation = await calculatePurchaseAmountFromLinkedLots(
          purchase.id,
          purchaseData.cash_discount,
          purchaseData.cash_discount_type,
          purchaseData.broker_commission,
          purchaseData.broker_commission_type,
          purchaseData.transportation_cost,
          purchaseData.igst_percentage
        );

        // Update purchase with calculated totals
        await purchaseDAO.update(purchase.id, {
          total_weight: calculation.totalWeight,
          total_amount: calculation.finalTotalAmount,
          igst_amount: calculation.igstAmount ?? undefined,
        });

        // Refresh purchase to get updated values
        const updatedPurchase = await purchaseDAO.findById(purchase.id);
        if (updatedPurchase) {
          purchase.total_weight = updatedPurchase.total_weight;
          purchase.total_amount = updatedPurchase.total_amount;
          purchase.igst_amount = updatedPurchase.igst_amount;
        }
      }

      const purchaseResponse: PurchaseResponse = {
        id: purchase.id,
        vendor_id: purchase.vendor_id,
        broker_id: purchase.broker_id,
        broker_commission: purchase.broker_commission ? parseFloat(purchase.broker_commission.toString()) : null,
        payment_advice_id: purchase.payment_advice_id,
        cash_discount: purchase.cash_discount ? parseFloat(purchase.cash_discount.toString()) : null,
        transportation_cost: purchase.transportation_cost ? parseFloat(purchase.transportation_cost.toString()) : null,
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date?.toISOString().split('T')[0] || null,
        rate: parseFloat(purchase.rate.toString()),
        total_weight: purchase.total_weight ? parseFloat(purchase.total_weight.toString()) : null,
        total_amount: purchase.total_amount ? parseFloat(purchase.total_amount.toString()) : null,
        igst_amount: purchase.igst_amount ? parseFloat(purchase.igst_amount.toString()) : null,
        igst_percentage: purchase.igst_percentage ? parseFloat(purchase.igst_percentage.toString()) : null,
        freight_status: purchase.freight_status,
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
        broker_id: purchase.broker_id,
        broker_commission: purchase.broker_commission ? parseFloat(purchase.broker_commission.toString()) : null,
        payment_advice_id: purchase.payment_advice_id,
        cash_discount: purchase.cash_discount ? parseFloat(purchase.cash_discount.toString()) : null,
        transportation_cost: purchase.transportation_cost ? parseFloat(purchase.transportation_cost.toString()) : null,
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date?.toISOString().split('T')[0] || null,
        rate: parseFloat(purchase.rate.toString()),
        total_weight: purchase.total_weight ? parseFloat(purchase.total_weight.toString()) : null,
        total_amount: purchase.total_amount ? parseFloat(purchase.total_amount.toString()) : null,
        igst_amount: purchase.igst_amount ? parseFloat(purchase.igst_amount.toString()) : null,
        igst_percentage: purchase.igst_percentage ? parseFloat(purchase.igst_percentage.toString()) : null,
        freight_status: purchase.freight_status,
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

  // Junction table linking methods
  async linkSaudas(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { sauda_ids } = req.body;

      if (!Array.isArray(sauda_ids) || sauda_ids.length === 0) {
        throw new ValidationError('sauda_ids must be a non-empty array');
      }

      // Validate purchase exists
      const purchase = await purchaseDAO.findById(id);
      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      // Validate all saudas exist
      for (const saudaId of sauda_ids) {
        const sauda = await saudaDAO.findById(saudaId);
        if (!sauda) {
          throw new NotFoundError(`Sauda not found: ${saudaId}`);
        }
      }

      await purchaseDAO.linkSaudas(id, sauda_ids);

      return ResponseHandler.success(res, { linked_count: sauda_ids.length }, 'Saudas linked successfully');
    } catch (error) {
      next(error);
    }
  }

  async linkInwardSlipPasses(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { inward_slip_pass_ids } = req.body;

      if (!Array.isArray(inward_slip_pass_ids) || inward_slip_pass_ids.length === 0) {
        throw new ValidationError('inward_slip_pass_ids must be a non-empty array');
      }

      // Validate purchase exists
      const purchase = await purchaseDAO.findById(id);
      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      // Validate all ISPs exist
      for (const ispId of inward_slip_pass_ids) {
        const isp = await inwardSlipPassDAO.findById(ispId);
        if (!isp) {
          throw new NotFoundError(`Inward slip pass not found: ${ispId}`);
        }
      }

      await purchaseDAO.linkInwardSlipPasses(id, inward_slip_pass_ids);

      return ResponseHandler.success(res, { linked_count: inward_slip_pass_ids.length }, 'Inward slip passes linked successfully');
    } catch (error) {
      next(error);
    }
  }

  async linkLots(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { lot_ids } = req.body;

      if (!Array.isArray(lot_ids) || lot_ids.length === 0) {
        throw new ValidationError('lot_ids must be a non-empty array');
      }

      // Validate purchase exists
      const purchase = await purchaseDAO.findById(id);
      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      // Validate all lots exist
      for (const lotId of lot_ids) {
        const lot = await inwardSlipLotDAO.findById(lotId);
        if (!lot) {
          throw new NotFoundError(`Lot not found: ${lotId}`);
        }
      }

      await purchaseDAO.linkLots(id, lot_ids);

      // Recalculate purchase totals
      const calculation = await calculatePurchaseAmountFromLinkedLots(
        id,
        purchase.cash_discount,
        purchase.cash_discount_type,
        purchase.broker_commission,
        purchase.broker_commission_type,
        purchase.transportation_cost,
        purchase.igst_percentage
      );

      await purchaseDAO.update(id, {
        total_weight: calculation.totalWeight,
        total_amount: calculation.finalTotalAmount,
        igst_amount: calculation.igstAmount ?? undefined,
      });

      return ResponseHandler.success(res, { linked_count: lot_ids.length }, 'Lots linked successfully and totals recalculated');
    } catch (error) {
      next(error);
    }
  }

  async unlinkSauda(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const saudaId = validate<string>(uuidSchema, req.params.saudaId);

      const unlinked = await purchaseDAO.unlinkSauda(id, saudaId);
      if (!unlinked) {
        throw new NotFoundError('Sauda not linked to this purchase');
      }

      return ResponseHandler.success(res, null, 'Sauda unlinked successfully');
    } catch (error) {
      next(error);
    }
  }

  async unlinkInwardSlipPass(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const ispId = validate<string>(uuidSchema, req.params.ispId);

      const unlinked = await purchaseDAO.unlinkInwardSlipPass(id, ispId);
      if (!unlinked) {
        throw new NotFoundError('Inward slip pass not linked to this purchase');
      }

      return ResponseHandler.success(res, null, 'Inward slip pass unlinked successfully');
    } catch (error) {
      next(error);
    }
  }

  async unlinkLot(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const lotId = validate<string>(uuidSchema, req.params.lotId);

      const unlinked = await purchaseDAO.unlinkLot(id, lotId);
      if (!unlinked) {
        throw new NotFoundError('Lot not linked to this purchase');
      }

      // Recalculate purchase totals
      const purchase = await purchaseDAO.findById(id);
      if (purchase) {
        const calculation = await calculatePurchaseAmountFromLinkedLots(
          id,
          purchase.cash_discount,
          purchase.cash_discount_type,
          purchase.broker_commission,
          purchase.broker_commission_type,
          purchase.transportation_cost,
          purchase.igst_percentage
        );

      await purchaseDAO.update(id, {
        total_weight: calculation.totalWeight,
        total_amount: calculation.finalTotalAmount,
        igst_amount: calculation.igstAmount ?? undefined,
      });
      }

      return ResponseHandler.success(res, null, 'Lot unlinked successfully and totals recalculated');
    } catch (error) {
      next(error);
    }
  }

  async getLinkedEntities(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const purchase = await purchaseDAO.findById(id);
      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      const saudaIds = await purchaseDAO.getLinkedSaudaIds(id);
      const ispIds = await purchaseDAO.getLinkedInwardSlipPassIds(id);
      const lotIds = await purchaseDAO.getLinkedLotIds(id);

      return ResponseHandler.success(res, {
        sauda_ids: saudaIds,
        inward_slip_pass_ids: ispIds,
        lot_ids: lotIds,
      });
    } catch (error) {
      next(error);
    }
  }

  async recalculateTotals(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const purchase = await purchaseDAO.findById(id);
      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      const calculation = await calculatePurchaseAmountFromLinkedLots(
        id,
        purchase.cash_discount,
        purchase.cash_discount_type,
        purchase.broker_commission,
        purchase.broker_commission_type,
        purchase.transportation_cost,
        purchase.igst_percentage
      );

      await purchaseDAO.update(id, {
        total_weight: calculation.totalWeight,
        total_amount: calculation.finalTotalAmount,
        igst_amount: calculation.igstAmount ?? undefined,
      });

      const updatedPurchase = await purchaseDAO.findById(id);
      if (!updatedPurchase) {
        throw new NotFoundError('Purchase not found after recalculation');
      }

      const purchaseResponse: PurchaseResponse = {
        id: updatedPurchase.id,
        vendor_id: updatedPurchase.vendor_id,
        broker_id: updatedPurchase.broker_id,
        broker_commission: updatedPurchase.broker_commission ? parseFloat(updatedPurchase.broker_commission.toString()) : null,
        broker_commission_type: updatedPurchase.broker_commission_type,
        payment_advice_id: updatedPurchase.payment_advice_id,
        cash_discount: updatedPurchase.cash_discount ? parseFloat(updatedPurchase.cash_discount.toString()) : null,
        cash_discount_type: updatedPurchase.cash_discount_type,
        transportation_cost: updatedPurchase.transportation_cost ? parseFloat(updatedPurchase.transportation_cost.toString()) : null,
        invoice_number: updatedPurchase.invoice_number,
        invoice_date: updatedPurchase.invoice_date?.toISOString().split('T')[0] || null,
        rate: parseFloat(updatedPurchase.rate.toString()),
        total_weight: updatedPurchase.total_weight ? parseFloat(updatedPurchase.total_weight.toString()) : null,
        total_amount: updatedPurchase.total_amount ? parseFloat(updatedPurchase.total_amount.toString()) : null,
        igst_amount: updatedPurchase.igst_amount ? parseFloat(updatedPurchase.igst_amount.toString()) : null,
        igst_percentage: updatedPurchase.igst_percentage ? parseFloat(updatedPurchase.igst_percentage.toString()) : null,
        freight_status: updatedPurchase.freight_status,
        truck_number: updatedPurchase.truck_number,
        transport_name: updatedPurchase.transport_name,
        goods_dispatched_from: updatedPurchase.goods_dispatched_from,
        goods_dispatched_to: updatedPurchase.goods_dispatched_to,
        purchase_date: updatedPurchase.purchase_date.toISOString().split('T')[0],
        expected_quantity: updatedPurchase.expected_quantity ? parseFloat(updatedPurchase.expected_quantity.toString()) : null,
        notes: updatedPurchase.notes,
        created_at: updatedPurchase.created_at.toISOString(),
        updated_at: updatedPurchase.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, purchaseResponse, 'Purchase totals recalculated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const purchaseController = new PurchaseController();

