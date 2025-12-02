import { db } from '../database/connection';
import { Purchase, CreatePurchaseDTO, UpdatePurchaseDTO } from '../models/purchase.model';
import { logger } from '../utils/logger';
import { purchaseSaudaDAO } from './purchase-sauda.dao';
import { purchaseInwardSlipPassDAO } from './purchase-inward-slip-pass.dao';
import { purchaseLotDAO } from './purchase-lot.dao';

export class PurchaseDAO {
  async findAll(vendorId?: string): Promise<Purchase[]> {
    let query = `
      SELECT id, vendor_id, broker_id, broker_commission, payment_advice_id,
             cash_discount, transportation_cost, invoice_number, invoice_date, rate, total_weight, total_amount,
             igst_amount, igst_percentage, freight_status,
             truck_number, transport_name, goods_dispatched_from, goods_dispatched_to,
             purchase_date, expected_quantity, notes, created_at, updated_at, created_by, updated_by
      FROM purchases
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (vendorId) {
      query += ` AND vendor_id = $${paramCount++}`;
      params.push(vendorId);
    }

    query += ` ORDER BY purchase_date DESC, created_at DESC`;

    const result = await db.query<Purchase>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Purchase | null> {
    const query = `
      SELECT id, vendor_id, broker_id, broker_commission, payment_advice_id,
             cash_discount, transportation_cost, invoice_number, invoice_date, rate, total_weight, total_amount,
             igst_amount, igst_percentage, freight_status,
             truck_number, transport_name, goods_dispatched_from, goods_dispatched_to,
             purchase_date, expected_quantity, notes, created_at, updated_at, created_by, updated_by
      FROM purchases
      WHERE id = $1
    `;
    const result = await db.query<Purchase>(query, [id]);
    return result.rows[0] || null;
  }

  async create(purchaseData: CreatePurchaseDTO & { rate: number }): Promise<Purchase> {
    const query = `
      INSERT INTO purchases (vendor_id, broker_id, broker_commission, payment_advice_id,
                            cash_discount, transportation_cost, invoice_number,
                            invoice_date, rate, total_weight, total_amount, igst_amount,
                            igst_percentage, freight_status, truck_number, transport_name,
                            goods_dispatched_from, goods_dispatched_to, purchase_date,
                            expected_quantity, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING id, vendor_id, broker_id, broker_commission, payment_advice_id,
                cash_discount, transportation_cost, invoice_number, invoice_date, rate, total_weight, total_amount,
                igst_amount, igst_percentage, freight_status,
                truck_number, transport_name, goods_dispatched_from, goods_dispatched_to,
                purchase_date, expected_quantity, notes, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      purchaseData.vendor_id,
      purchaseData.broker_id || null,
      purchaseData.broker_commission || null,
      null, // payment_advice_id - set later via update
      purchaseData.cash_discount || null,
      purchaseData.transportation_cost || null,
      purchaseData.invoice_number || null,
      purchaseData.invoice_date || null,
      purchaseData.rate,
      purchaseData.total_weight || null,
      purchaseData.total_amount || null,
      purchaseData.igst_amount || null,
      purchaseData.igst_percentage || null,
      purchaseData.freight_status || null,
      purchaseData.truck_number || null,
      purchaseData.transport_name || null,
      purchaseData.goods_dispatched_from || null,
      purchaseData.goods_dispatched_to || null,
      purchaseData.purchase_date,
      purchaseData.expected_quantity || null,
      purchaseData.notes || null,
      purchaseData.created_by || null,
    ];

    try {
      const result = await db.query<Purchase>(query, values);
      logger.info('Purchase created', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating purchase', { error, purchaseData });
      throw error;
    }
  }

  async update(id: string, purchaseData: UpdatePurchaseDTO): Promise<Purchase | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (purchaseData.broker_id !== undefined) {
      fields.push(`broker_id = $${paramCount++}`);
      values.push(purchaseData.broker_id || null);
    }
    if (purchaseData.broker_commission !== undefined) {
      fields.push(`broker_commission = $${paramCount++}`);
      values.push(purchaseData.broker_commission || null);
    }
    if (purchaseData.payment_advice_id !== undefined) {
      fields.push(`payment_advice_id = $${paramCount++}`);
      values.push(purchaseData.payment_advice_id || null);
    }
    if (purchaseData.cash_discount !== undefined) {
      fields.push(`cash_discount = $${paramCount++}`);
      values.push(purchaseData.cash_discount || null);
    }
    if (purchaseData.transportation_cost !== undefined) {
      fields.push(`transportation_cost = $${paramCount++}`);
      values.push(purchaseData.transportation_cost || null);
    }
    if (purchaseData.invoice_number !== undefined) {
      fields.push(`invoice_number = $${paramCount++}`);
      values.push(purchaseData.invoice_number || null);
    }
    if (purchaseData.invoice_date !== undefined) {
      fields.push(`invoice_date = $${paramCount++}`);
      values.push(purchaseData.invoice_date || null);
    }
    if (purchaseData.rate !== undefined) {
      fields.push(`rate = $${paramCount++}`);
      values.push(purchaseData.rate);
    }
    if (purchaseData.total_weight !== undefined) {
      fields.push(`total_weight = $${paramCount++}`);
      values.push(purchaseData.total_weight || null);
    }
    if (purchaseData.total_amount !== undefined) {
      fields.push(`total_amount = $${paramCount++}`);
      values.push(purchaseData.total_amount || null);
    }
    if (purchaseData.igst_amount !== undefined) {
      fields.push(`igst_amount = $${paramCount++}`);
      values.push(purchaseData.igst_amount || null);
    }
    if (purchaseData.igst_percentage !== undefined) {
      fields.push(`igst_percentage = $${paramCount++}`);
      values.push(purchaseData.igst_percentage || null);
    }
    if (purchaseData.freight_status !== undefined) {
      fields.push(`freight_status = $${paramCount++}`);
      values.push(purchaseData.freight_status || null);
    }
    if (purchaseData.truck_number !== undefined) {
      fields.push(`truck_number = $${paramCount++}`);
      values.push(purchaseData.truck_number || null);
    }
    if (purchaseData.transport_name !== undefined) {
      fields.push(`transport_name = $${paramCount++}`);
      values.push(purchaseData.transport_name || null);
    }
    if (purchaseData.goods_dispatched_from !== undefined) {
      fields.push(`goods_dispatched_from = $${paramCount++}`);
      values.push(purchaseData.goods_dispatched_from || null);
    }
    if (purchaseData.goods_dispatched_to !== undefined) {
      fields.push(`goods_dispatched_to = $${paramCount++}`);
      values.push(purchaseData.goods_dispatched_to || null);
    }
    if (purchaseData.purchase_date !== undefined) {
      fields.push(`purchase_date = $${paramCount++}`);
      values.push(purchaseData.purchase_date);
    }
    if (purchaseData.expected_quantity !== undefined) {
      fields.push(`expected_quantity = $${paramCount++}`);
      values.push(purchaseData.expected_quantity || null);
    }
    if (purchaseData.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(purchaseData.notes || null);
    }
    if (purchaseData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(purchaseData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE purchases
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, vendor_id, broker_id, broker_commission, payment_advice_id,
                cash_discount, transportation_cost, invoice_number, invoice_date, rate, total_weight, total_amount,
                igst_amount, igst_percentage, freight_status,
                truck_number, transport_name, goods_dispatched_from, goods_dispatched_to,
                purchase_date, expected_quantity, notes, created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<Purchase>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Purchase updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating purchase', { error, id });
      throw error;
    }
  }

  // Junction table methods - Delegated to separate DAOs for better separation of concerns
  // These methods maintain backward compatibility with existing controller code
  
  async linkSaudas(purchaseId: string, saudaIds: string[]): Promise<void> {
    return purchaseSaudaDAO.linkSaudas(purchaseId, saudaIds);
  }

  async linkInwardSlipPasses(purchaseId: string, ispIds: string[]): Promise<void> {
    return purchaseInwardSlipPassDAO.linkInwardSlipPasses(purchaseId, ispIds);
  }

  async linkLots(purchaseId: string, lotIds: string[]): Promise<void> {
    return purchaseLotDAO.linkLots(purchaseId, lotIds);
  }

  async unlinkSauda(purchaseId: string, saudaId: string): Promise<boolean> {
    return purchaseSaudaDAO.unlinkSauda(purchaseId, saudaId);
  }

  async unlinkInwardSlipPass(purchaseId: string, ispId: string): Promise<boolean> {
    return purchaseInwardSlipPassDAO.unlinkInwardSlipPass(purchaseId, ispId);
  }

  async unlinkLot(purchaseId: string, lotId: string): Promise<boolean> {
    return purchaseLotDAO.unlinkLot(purchaseId, lotId);
  }

  async getLinkedSaudaIds(purchaseId: string): Promise<string[]> {
    return purchaseSaudaDAO.getLinkedSaudaIds(purchaseId);
  }

  async getLinkedInwardSlipPassIds(purchaseId: string): Promise<string[]> {
    return purchaseInwardSlipPassDAO.getLinkedInwardSlipPassIds(purchaseId);
  }

  async getLinkedLotIds(purchaseId: string): Promise<string[]> {
    return purchaseLotDAO.getLinkedLotIds(purchaseId);
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM purchases WHERE id = $1`;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Purchase deleted', { id });
    }
    return deleted;
  }
}

export const purchaseDAO = new PurchaseDAO();

