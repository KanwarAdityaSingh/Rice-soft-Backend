import { Response, NextFunction } from 'express';
import { paymentAdviceDAO } from '../dao/payment-advice.dao';
import { paymentAdviceChargeDAO } from '../dao/payment-advice-charge.dao';
import { purchaseSummaryDAO } from '../dao/purchase-summary.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { vendorDAO } from '../dao/vendor.dao';
import { kaantaDAO } from '../dao/kaanta.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createPaymentAdviceSchema,
  updatePaymentAdviceSchema,
  createPaymentAdviceChargeSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { CreatePaymentAdviceDTO, UpdatePaymentAdviceDTO, PaymentAdviceResponse, PaymentAdviceStatus } from '../models/payment-advice.model';
import { CreatePaymentAdviceChargeDTO, PaymentAdviceChargeResponse } from '../models/payment-advice-charge.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import { computeKaantaPricingNetWeight, floorToMoneyStep } from '../utils/money';

export class PaymentAdviceController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const saudaId = req.query.sauda_id as string | undefined;
      const ispId = req.query.inward_slip_pass_id as string | undefined;
      const status = req.query.status as PaymentAdviceStatus | undefined;
      
      const paymentAdvices = await paymentAdviceDAO.findAll(saudaId, ispId, status);

      const responses: PaymentAdviceResponse[] = await Promise.all(
        paymentAdvices.map(async (advice) => {
          const charges = await paymentAdviceChargeDAO.findByPaymentAdviceId(advice.id);
          const netPayable = await paymentAdviceChargeDAO.calculateNetPayable(advice.id);
          
          return {
            id: advice.id,
            sauda_id: advice.sauda_id,
            inward_slip_pass_id: advice.inward_slip_pass_id,
            payer_id: advice.payer_id,
            recipient_id: advice.recipient_id,
            sr_number: advice.sr_number,
            party_name: advice.party_name,
            party_address: advice.party_address,
            broker_name: advice.broker_name,
            invoice_number: advice.invoice_number,
            invoice_date: advice.invoice_date?.toISOString().split('T')[0] || null,
            bill_number: advice.bill_number,
            truck_number: advice.truck_number,
            item: advice.item,
            total_bags: advice.total_bags,
            due_date: advice.due_date?.toISOString().split('T')[0] || null,
            bill_weight: advice.bill_weight ? parseFloat(advice.bill_weight.toString()) : null,
            kanta_weight: advice.kanta_weight ? parseFloat(advice.kanta_weight.toString()) : null,
            dana_deduction: advice.dana_deduction ? parseFloat(advice.dana_deduction.toString()) : null,
            final_weight: advice.final_weight ? parseFloat(advice.final_weight.toString()) : null,
            rate: advice.rate ? parseFloat(advice.rate.toString()) : null,
            amount: parseFloat(advice.amount.toString()),
            transaction_id: advice.transaction_id,
            date_of_payment: advice.date_of_payment.toISOString().split('T')[0],
            status: advice.status,
            payment_slip_image_url: advice.payment_slip_image_url,
            notes: advice.notes,
            created_at: advice.created_at.toISOString(),
            updated_at: advice.updated_at.toISOString(),
            charges: charges.map(charge => ({
              id: charge.id,
              payment_advice_id: charge.payment_advice_id,
              charge_name: charge.charge_name,
              charge_value: parseFloat(charge.charge_value.toString()),
              charge_type: charge.charge_type,
              created_at: charge.created_at.toISOString(),
              updated_at: charge.updated_at.toISOString(),
            })),
            net_payable: netPayable,
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

      const paymentAdvice = await paymentAdviceDAO.findById(id);
      if (!paymentAdvice) {
        throw new NotFoundError('Payment advice not found');
      }

      const charges = await paymentAdviceChargeDAO.findByPaymentAdviceId(id);
      const netPayable = await paymentAdviceChargeDAO.calculateNetPayable(id);

      const response: PaymentAdviceResponse = {
        id: paymentAdvice.id,
        sauda_id: paymentAdvice.sauda_id,
        inward_slip_pass_id: paymentAdvice.inward_slip_pass_id,
        payer_id: paymentAdvice.payer_id,
        recipient_id: paymentAdvice.recipient_id,
        sr_number: paymentAdvice.sr_number,
        party_name: paymentAdvice.party_name,
        party_address: paymentAdvice.party_address,
        broker_name: paymentAdvice.broker_name,
        invoice_number: paymentAdvice.invoice_number,
        invoice_date: paymentAdvice.invoice_date?.toISOString().split('T')[0] || null,
        bill_number: paymentAdvice.bill_number,
        truck_number: paymentAdvice.truck_number,
        item: paymentAdvice.item,
        total_bags: paymentAdvice.total_bags,
        due_date: paymentAdvice.due_date?.toISOString().split('T')[0] || null,
        bill_weight: paymentAdvice.bill_weight ? parseFloat(paymentAdvice.bill_weight.toString()) : null,
        kanta_weight: paymentAdvice.kanta_weight ? parseFloat(paymentAdvice.kanta_weight.toString()) : null,
        dana_deduction: paymentAdvice.dana_deduction ? parseFloat(paymentAdvice.dana_deduction.toString()) : null,
        final_weight: paymentAdvice.final_weight ? parseFloat(paymentAdvice.final_weight.toString()) : null,
        rate: paymentAdvice.rate ? parseFloat(paymentAdvice.rate.toString()) : null,
        amount: parseFloat(paymentAdvice.amount.toString()),
        transaction_id: paymentAdvice.transaction_id,
        date_of_payment: paymentAdvice.date_of_payment.toISOString().split('T')[0],
        status: paymentAdvice.status,
        payment_slip_image_url: paymentAdvice.payment_slip_image_url,
        notes: paymentAdvice.notes,
        created_at: paymentAdvice.created_at.toISOString(),
        updated_at: paymentAdvice.updated_at.toISOString(),
        charges: charges.map(charge => ({
          id: charge.id,
          payment_advice_id: charge.payment_advice_id,
          charge_name: charge.charge_name,
          charge_value: parseFloat(charge.charge_value.toString()),
          charge_type: charge.charge_type,
          created_at: charge.created_at.toISOString(),
          updated_at: charge.updated_at.toISOString(),
        })),
        net_payable: netPayable,
      };

      return ResponseHandler.success(res, response);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const paymentAdviceData = validate<CreatePaymentAdviceDTO>(createPaymentAdviceSchema, req.body);

      // Validate recipient exists if provided
      if (paymentAdviceData.recipient_id) {
        const recipient = await vendorDAO.findById(paymentAdviceData.recipient_id);
        if (!recipient) {
          throw new NotFoundError('Recipient (vendor) not found');
        }
      }

      // Validate and auto-calculate amount based on sauda_id or inward_slip_pass_id
      let calculatedAmount = paymentAdviceData.amount;
      
      if (paymentAdviceData.sauda_id) {
        // Validate sauda exists
        const sauda = await saudaDAO.findById(paymentAdviceData.sauda_id);
        if (!sauda) {
          throw new NotFoundError('Sauda not found');
        }
        
        // Get summary and auto-calculate amount if not provided
        if (!calculatedAmount) {
          const summary = await purchaseSummaryDAO.getSaudaSummary(paymentAdviceData.sauda_id);
          calculatedAmount = summary.final_total_amount;
        }
      } else if (paymentAdviceData.inward_slip_pass_id) {
        // Validate ISP exists
        const isp = await inwardSlipPassDAO.findById(paymentAdviceData.inward_slip_pass_id);
        if (!isp) {
          throw new NotFoundError('Inward slip pass not found');
        }
        
        // Get summary and auto-calculate amount if not provided
        if (!calculatedAmount) {
          const summary = await purchaseSummaryDAO.getIspSummary(paymentAdviceData.inward_slip_pass_id);
          calculatedAmount = summary.final_total_amount;
        }
      }

      // Set the calculated amount (floor to whole rupees; same rule as purchase summary)
      if (calculatedAmount !== undefined && calculatedAmount !== null) {
        paymentAdviceData.amount = floorToMoneyStep(calculatedAmount as number | string);
      } else {
        paymentAdviceData.amount = calculatedAmount;
      }

      // Calculate dana_deduction and final_weight from kaanta data
      let totalKaantaWeight = 0;
      let totalSaidSentWeight = 0;
      let danaDeduction = 0;
      let netWeight = 0;

      if (paymentAdviceData.sauda_id) {
        // Get the sauda to check is_dana_required
        const sauda = await saudaDAO.findById(paymentAdviceData.sauda_id);
        const shouldCalculateDana = sauda?.is_dana_required || false;
        
        // Get all kaantas for this sauda
        const kaantas = await kaantaDAO.findAll(paymentAdviceData.sauda_id);
        if (kaantas.length > 0) {
          // PG DECIMAL often arrives as string; use Number() so + never does string concat.
          totalKaantaWeight = kaantas.reduce((sum, k) => sum + Number(k.kaanta_weight ?? 0), 0);
          totalSaidSentWeight = kaantas.reduce((sum, k) => sum + Number(k.said_sent_weight ?? 0), 0);
          const totalBillWeight = await inwardSlipLotDAO.sumBillWeightForSauda(paymentAdviceData.sauda_id);

          const pricing = computeKaantaPricingNetWeight({
            totalKaantaWeight,
            totalBillWeight,
            totalSaidSentWeight,
            isDanaRequired: shouldCalculateDana,
          });
          danaDeduction = pricing.danaDeductionKg;
          netWeight = pricing.netWeightForPricing;

          // Set bill_weight as said_sent_weight (for display in frontend)
          if (!paymentAdviceData.bill_weight) {
            paymentAdviceData.bill_weight = totalSaidSentWeight;
          }

          // Set kanta_weight if not provided
          if (!paymentAdviceData.kanta_weight) {
            paymentAdviceData.kanta_weight = totalKaantaWeight;
          }
        }
      } else if (paymentAdviceData.inward_slip_pass_id) {
        // Get all kaantas for this ISP
        const kaantas = await kaantaDAO.findAll(undefined, paymentAdviceData.inward_slip_pass_id);
        
        if (kaantas.length > 0) {
          // Group kaantas by sauda_id
          const kaantasBySauda = new Map<string, typeof kaantas>();
          for (const kaanta of kaantas) {
            if (!kaantasBySauda.has(kaanta.sauda_id)) {
              kaantasBySauda.set(kaanta.sauda_id, []);
            }
            kaantasBySauda.get(kaanta.sauda_id)!.push(kaanta);
          }
          
          // Calculate dana and pricing net weight per sauda (same min(kaanta,bill)−dana rule as purchase summary)
          let totalDanaDeduction = 0;
          let totalNetPricingWeight = 0;

          // Get all unique sauda IDs and fetch their is_dana_required flags
          const saudaIds = Array.from(kaantasBySauda.keys());
          const saudas = await Promise.all(
            saudaIds.map(id => saudaDAO.findById(id))
          );

          const saudaMap = new Map<string, boolean>();
          saudas.forEach((sauda, index) => {
            if (sauda) {
              saudaMap.set(saudaIds[index], sauda.is_dana_required ?? false);
            }
          });

          for (const [saudaId, saudaKaantas] of kaantasBySauda.entries()) {
            const isDanaRequired = saudaMap.get(saudaId) || false;

            const saudaKaantaWeight = saudaKaantas.reduce((sum, k) => sum + Number(k.kaanta_weight ?? 0), 0);
            const saudaSaidSentWeight = saudaKaantas.reduce((sum, k) => sum + Number(k.said_sent_weight ?? 0), 0);

            totalKaantaWeight += saudaKaantaWeight;
            totalSaidSentWeight += saudaSaidSentWeight;

            const totalBillWeight = await inwardSlipLotDAO.sumBillWeightForSauda(saudaId);
            const pricing = computeKaantaPricingNetWeight({
              totalKaantaWeight: saudaKaantaWeight,
              totalBillWeight,
              totalSaidSentWeight: saudaSaidSentWeight,
              isDanaRequired,
            });
            totalDanaDeduction += pricing.danaDeductionKg;
            totalNetPricingWeight += pricing.netWeightForPricing;
          }

          danaDeduction = totalDanaDeduction;
          netWeight = totalNetPricingWeight;
          
          // Set bill_weight as said_sent_weight (for display in frontend)
          if (!paymentAdviceData.bill_weight) {
            paymentAdviceData.bill_weight = totalSaidSentWeight;
          }
          
          // Set kanta_weight if not provided
          if (!paymentAdviceData.kanta_weight) {
            paymentAdviceData.kanta_weight = totalKaantaWeight;
          }
        }
      }

      // Set calculated dana_deduction and final_weight
      paymentAdviceData.dana_deduction = danaDeduction > 0 ? danaDeduction : undefined;
      // final_weight = kaanta_weight - dana_deduction (after all deductions)
      paymentAdviceData.final_weight = netWeight > 0 ? netWeight : undefined;

      // Set created_by from authenticated user
      if (req.user) {
        paymentAdviceData.created_by = req.user.userId;
      }

      // Create payment advice
      const paymentAdvice = await paymentAdviceDAO.create(paymentAdviceData);

      // Create charges if provided
      let charges: any[] = [];
      if (paymentAdviceData.charges && paymentAdviceData.charges.length > 0) {
        const chargesToCreate = paymentAdviceData.charges.map(charge => ({
          ...charge,
          payment_advice_id: paymentAdvice.id,
        }));
        charges = await paymentAdviceChargeDAO.createMany(chargesToCreate);
      }

      const netPayable = await paymentAdviceChargeDAO.calculateNetPayable(paymentAdvice.id);

      const response: PaymentAdviceResponse = {
        id: paymentAdvice.id,
        sauda_id: paymentAdvice.sauda_id,
        inward_slip_pass_id: paymentAdvice.inward_slip_pass_id,
        payer_id: paymentAdvice.payer_id,
        recipient_id: paymentAdvice.recipient_id,
        sr_number: paymentAdvice.sr_number,
        party_name: paymentAdvice.party_name,
        party_address: paymentAdvice.party_address,
        broker_name: paymentAdvice.broker_name,
        invoice_number: paymentAdvice.invoice_number,
        invoice_date: paymentAdvice.invoice_date?.toISOString().split('T')[0] || null,
        bill_number: paymentAdvice.bill_number,
        truck_number: paymentAdvice.truck_number,
        item: paymentAdvice.item,
        total_bags: paymentAdvice.total_bags,
        due_date: paymentAdvice.due_date?.toISOString().split('T')[0] || null,
        bill_weight: paymentAdvice.bill_weight ? parseFloat(paymentAdvice.bill_weight.toString()) : null,
        kanta_weight: paymentAdvice.kanta_weight ? parseFloat(paymentAdvice.kanta_weight.toString()) : null,
        dana_deduction: paymentAdvice.dana_deduction ? parseFloat(paymentAdvice.dana_deduction.toString()) : null,
        final_weight: paymentAdvice.final_weight ? parseFloat(paymentAdvice.final_weight.toString()) : null,
        rate: paymentAdvice.rate ? parseFloat(paymentAdvice.rate.toString()) : null,
        amount: parseFloat(paymentAdvice.amount.toString()),
        transaction_id: paymentAdvice.transaction_id,
        date_of_payment: paymentAdvice.date_of_payment.toISOString().split('T')[0],
        status: paymentAdvice.status,
        payment_slip_image_url: paymentAdvice.payment_slip_image_url,
        notes: paymentAdvice.notes,
        created_at: paymentAdvice.created_at.toISOString(),
        updated_at: paymentAdvice.updated_at.toISOString(),
        charges: charges.map(charge => ({
          id: charge.id,
          payment_advice_id: charge.payment_advice_id,
          charge_name: charge.charge_name,
          charge_value: parseFloat(charge.charge_value.toString()),
          charge_type: charge.charge_type,
          created_at: charge.created_at.toISOString(),
          updated_at: charge.updated_at.toISOString(),
        })),
        net_payable: netPayable,
      };

      return ResponseHandler.created(res, response, 'Payment advice created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      
      // Remove charges from request body if present (charges are managed via separate endpoints)
      const { charges: _charges, ...updateData } = req.body;
      
      const paymentAdviceData = validate<UpdatePaymentAdviceDTO>(updatePaymentAdviceSchema, updateData);

      // Check if payment advice exists
      const existingAdvice = await paymentAdviceDAO.findById(id);
      if (!existingAdvice) {
        throw new NotFoundError('Payment advice not found');
      }

      // Validate recipient if being updated
      if (paymentAdviceData.recipient_id) {
        const recipient = await vendorDAO.findById(paymentAdviceData.recipient_id);
        if (!recipient) {
          throw new NotFoundError('Recipient (vendor) not found');
        }
      }

      // Recalculate amount from summary if sauda/ISP reference changes and amount is not explicitly provided.
      // This keeps amount in sync with dana-adjusted pricing logic from purchase summary.
      if ((paymentAdviceData.sauda_id || paymentAdviceData.inward_slip_pass_id) && paymentAdviceData.amount === undefined) {
        const summarySaudaId = paymentAdviceData.sauda_id || existingAdvice.sauda_id || undefined;
        const summaryIspId = paymentAdviceData.inward_slip_pass_id || existingAdvice.inward_slip_pass_id || undefined;

        if (summarySaudaId) {
          const summary = await purchaseSummaryDAO.getSaudaSummary(summarySaudaId);
          paymentAdviceData.amount = summary.final_total_amount;
        } else if (summaryIspId) {
          const summary = await purchaseSummaryDAO.getIspSummary(summaryIspId);
          paymentAdviceData.amount = summary.final_total_amount;
        }
      }

      // Recalculate dana_deduction and final_weight if sauda_id or inward_slip_pass_id is being updated
      if (paymentAdviceData.sauda_id || paymentAdviceData.inward_slip_pass_id) {
        let totalKaantaWeight = 0;
        let totalSaidSentWeight = 0;
        let danaDeduction = 0;
        let netWeight = 0;

        const saudaId = paymentAdviceData.sauda_id || existingAdvice.sauda_id;
        const ispId = paymentAdviceData.inward_slip_pass_id || existingAdvice.inward_slip_pass_id;

        if (saudaId) {
          // Get the sauda to check is_dana_required
          const sauda = await saudaDAO.findById(saudaId);
          const shouldCalculateDana = sauda?.is_dana_required || false;
          
          const kaantas = await kaantaDAO.findAll(saudaId);
          if (kaantas.length > 0) {
            totalKaantaWeight = kaantas.reduce((sum, k) => sum + Number(k.kaanta_weight ?? 0), 0);
            totalSaidSentWeight = kaantas.reduce((sum, k) => sum + Number(k.said_sent_weight ?? 0), 0);
            const totalBillWeight = await inwardSlipLotDAO.sumBillWeightForSauda(saudaId);

            const pricing = computeKaantaPricingNetWeight({
              totalKaantaWeight,
              totalBillWeight,
              totalSaidSentWeight,
              isDanaRequired: shouldCalculateDana,
            });
            danaDeduction = pricing.danaDeductionKg;
            netWeight = pricing.netWeightForPricing;

            if (!paymentAdviceData.bill_weight) {
              paymentAdviceData.bill_weight = totalSaidSentWeight;
            }
            if (!paymentAdviceData.kanta_weight) {
              paymentAdviceData.kanta_weight = totalKaantaWeight;
            }
          }
        } else if (ispId) {
          // Get all kaantas for this ISP
          const kaantas = await kaantaDAO.findAll(undefined, ispId);
          
          if (kaantas.length > 0) {
            // Group kaantas by sauda_id
            const kaantasBySauda = new Map<string, typeof kaantas>();
            for (const kaanta of kaantas) {
              if (!kaantasBySauda.has(kaanta.sauda_id)) {
                kaantasBySauda.set(kaanta.sauda_id, []);
              }
              kaantasBySauda.get(kaanta.sauda_id)!.push(kaanta);
            }
            
            let totalDanaDeduction = 0;
            let totalNetPricingWeight = 0;

            // Get all unique sauda IDs and fetch their is_dana_required flags
            const saudaIds = Array.from(kaantasBySauda.keys());
            const saudas = await Promise.all(
              saudaIds.map(id => saudaDAO.findById(id))
            );

            const saudaMap = new Map<string, boolean>();
            saudas.forEach((sauda, index) => {
              if (sauda) {
                saudaMap.set(saudaIds[index], sauda.is_dana_required ?? false);
              }
            });

            for (const [saudaId, saudaKaantas] of kaantasBySauda.entries()) {
              const isDanaRequired = saudaMap.get(saudaId) || false;

              const saudaKaantaWeight = saudaKaantas.reduce((sum, k) => sum + Number(k.kaanta_weight ?? 0), 0);
              const saudaSaidSentWeight = saudaKaantas.reduce((sum, k) => sum + Number(k.said_sent_weight ?? 0), 0);

              totalKaantaWeight += saudaKaantaWeight;
              totalSaidSentWeight += saudaSaidSentWeight;

              const totalBillWeight = await inwardSlipLotDAO.sumBillWeightForSauda(saudaId);
              const pricing = computeKaantaPricingNetWeight({
                totalKaantaWeight: saudaKaantaWeight,
                totalBillWeight,
                totalSaidSentWeight: saudaSaidSentWeight,
                isDanaRequired,
              });
              totalDanaDeduction += pricing.danaDeductionKg;
              totalNetPricingWeight += pricing.netWeightForPricing;
            }

            danaDeduction = totalDanaDeduction;
            netWeight = totalNetPricingWeight;
            
            if (!paymentAdviceData.bill_weight) {
              paymentAdviceData.bill_weight = totalSaidSentWeight;
            }
            if (!paymentAdviceData.kanta_weight) {
              paymentAdviceData.kanta_weight = totalKaantaWeight;
            }
          }
        }

        paymentAdviceData.dana_deduction = danaDeduction > 0 ? danaDeduction : undefined;
        paymentAdviceData.final_weight = netWeight > 0 ? netWeight : undefined;
      }

      // Set updated_by from authenticated user
      if (req.user) {
        paymentAdviceData.updated_by = req.user.userId;
      }

      if (paymentAdviceData.amount !== undefined) {
        paymentAdviceData.amount = floorToMoneyStep(paymentAdviceData.amount);
      }

      const paymentAdvice = await paymentAdviceDAO.update(id, paymentAdviceData);
      if (!paymentAdvice) {
        throw new NotFoundError('Payment advice not found after update');
      }

      const charges = await paymentAdviceChargeDAO.findByPaymentAdviceId(id);
      const netPayable = await paymentAdviceChargeDAO.calculateNetPayable(id);

      const response: PaymentAdviceResponse = {
        id: paymentAdvice.id,
        sauda_id: paymentAdvice.sauda_id,
        inward_slip_pass_id: paymentAdvice.inward_slip_pass_id,
        payer_id: paymentAdvice.payer_id,
        recipient_id: paymentAdvice.recipient_id,
        sr_number: paymentAdvice.sr_number,
        party_name: paymentAdvice.party_name,
        party_address: paymentAdvice.party_address,
        broker_name: paymentAdvice.broker_name,
        invoice_number: paymentAdvice.invoice_number,
        invoice_date: paymentAdvice.invoice_date?.toISOString().split('T')[0] || null,
        bill_number: paymentAdvice.bill_number,
        truck_number: paymentAdvice.truck_number,
        item: paymentAdvice.item,
        total_bags: paymentAdvice.total_bags,
        due_date: paymentAdvice.due_date?.toISOString().split('T')[0] || null,
        bill_weight: paymentAdvice.bill_weight ? parseFloat(paymentAdvice.bill_weight.toString()) : null,
        kanta_weight: paymentAdvice.kanta_weight ? parseFloat(paymentAdvice.kanta_weight.toString()) : null,
        dana_deduction: paymentAdvice.dana_deduction ? parseFloat(paymentAdvice.dana_deduction.toString()) : null,
        final_weight: paymentAdvice.final_weight ? parseFloat(paymentAdvice.final_weight.toString()) : null,
        rate: paymentAdvice.rate ? parseFloat(paymentAdvice.rate.toString()) : null,
        amount: parseFloat(paymentAdvice.amount.toString()),
        transaction_id: paymentAdvice.transaction_id,
        date_of_payment: paymentAdvice.date_of_payment.toISOString().split('T')[0],
        status: paymentAdvice.status,
        payment_slip_image_url: paymentAdvice.payment_slip_image_url,
        notes: paymentAdvice.notes,
        created_at: paymentAdvice.created_at.toISOString(),
        updated_at: paymentAdvice.updated_at.toISOString(),
        charges: charges.map(charge => ({
          id: charge.id,
          payment_advice_id: charge.payment_advice_id,
          charge_name: charge.charge_name,
          charge_value: parseFloat(charge.charge_value.toString()),
          charge_type: charge.charge_type,
          created_at: charge.created_at.toISOString(),
          updated_at: charge.updated_at.toISOString(),
        })),
        net_payable: netPayable,
      };

      return ResponseHandler.success(res, response, 'Payment advice updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadSlip(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { transaction_id } = req.body;

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf']);

      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.paymentSlipsFolder
      );

      const updateData: UpdatePaymentAdviceDTO = {
        payment_slip_image_url: uploadResult.url,
        updated_by: req.user?.userId,
      };

      // If transaction_id is provided, update it and auto-complete status
      if (transaction_id) {
        updateData.transaction_id = transaction_id;
        updateData.status = 'completed';
      }

      const paymentAdvice = await paymentAdviceDAO.update(id, updateData);

      if (!paymentAdvice) {
        throw new NotFoundError('Payment advice not found');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Payment slip uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async addCharge(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const chargeData = validate<CreatePaymentAdviceChargeDTO>(createPaymentAdviceChargeSchema, req.body);

      // Check if payment advice exists
      const paymentAdvice = await paymentAdviceDAO.findById(id);
      if (!paymentAdvice) {
        throw new NotFoundError('Payment advice not found');
      }

      const charge = await paymentAdviceChargeDAO.create({
        ...chargeData,
        payment_advice_id: id,
      });

      const chargeResponse: PaymentAdviceChargeResponse = {
        id: charge.id,
        payment_advice_id: charge.payment_advice_id,
        charge_name: charge.charge_name,
        charge_value: parseFloat(charge.charge_value.toString()),
        charge_type: charge.charge_type,
        created_at: charge.created_at.toISOString(),
        updated_at: charge.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, chargeResponse, 'Charge added successfully');
    } catch (error) {
      next(error);
    }
  }

  async removeCharge(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const chargeId = validate<string>(uuidSchema, req.params.chargeId);

      // Check if charge exists and belongs to payment advice
      const charge = await paymentAdviceChargeDAO.findById(chargeId);
      if (!charge) {
        throw new NotFoundError('Charge not found');
      }

      if (charge.payment_advice_id !== id) {
        throw new ValidationError('Charge does not belong to this payment advice');
      }

      const deleted = await paymentAdviceChargeDAO.delete(chargeId);
      if (!deleted) {
        throw new NotFoundError('Charge not found after deletion');
      }

      return ResponseHandler.success(res, null, 'Charge removed successfully');
    } catch (error) {
      next(error);
    }
  }

  async getNetPayable(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      // Check if payment advice exists
      const paymentAdvice = await paymentAdviceDAO.findById(id);
      if (!paymentAdvice) {
        throw new NotFoundError('Payment advice not found');
      }

      const netPayable = await paymentAdviceChargeDAO.calculateNetPayable(id);

      return ResponseHandler.success(res, { net_payable: netPayable });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const paymentAdvice = await paymentAdviceDAO.findById(id);
      if (!paymentAdvice) {
        throw new NotFoundError('Payment advice not found');
      }

      const deleted = await paymentAdviceDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Payment advice not found or could not be deleted');
      }

      return ResponseHandler.success(res, null, 'Payment advice deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const paymentAdviceController = new PaymentAdviceController();

