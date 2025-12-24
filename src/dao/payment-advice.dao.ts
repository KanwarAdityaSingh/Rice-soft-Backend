import { db } from '../database/connection';
import { PaymentAdvice, CreatePaymentAdviceDTO, UpdatePaymentAdviceDTO, PaymentAdviceStatus } from '../models/payment-advice.model';
import { logger } from '../utils/logger';

export class PaymentAdviceDAO {
  async findAll(saudaId?: string, ispId?: string, status?: PaymentAdviceStatus): Promise<PaymentAdvice[]> {
    let query = `
      SELECT id, sauda_id, inward_slip_pass_id, payer_id, recipient_id, sr_number, party_name, party_address,
             broker_name, invoice_number, invoice_date, truck_number, item, total_bags,
             due_date, bill_weight, kanta_weight, dana_deduction, final_weight, rate, amount, transaction_id,
             date_of_payment, status, payment_slip_image_url, notes, created_at, updated_at,
             created_by, updated_by
      FROM payment_advices
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (saudaId) {
      query += ` AND sauda_id = $${paramCount++}`;
      params.push(saudaId);
    }

    if (ispId) {
      query += ` AND inward_slip_pass_id = $${paramCount++}`;
      params.push(ispId);
    }

    if (status) {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }

    query += ` ORDER BY date_of_payment DESC, created_at DESC`;

    const result = await db.query<PaymentAdvice>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<PaymentAdvice | null> {
    const query = `
      SELECT id, sauda_id, inward_slip_pass_id, payer_id, recipient_id, sr_number, party_name, party_address,
             broker_name, invoice_number, invoice_date, truck_number, item, total_bags,
             due_date, bill_weight, kanta_weight, dana_deduction, final_weight, rate, amount, transaction_id,
             date_of_payment, status, payment_slip_image_url, notes, created_at, updated_at,
             created_by, updated_by
      FROM payment_advices
      WHERE id = $1
    `;
    const result = await db.query<PaymentAdvice>(query, [id]);
    return result.rows[0] || null;
  }

  async create(paymentAdviceData: CreatePaymentAdviceDTO): Promise<PaymentAdvice> {
    const query = `
      INSERT INTO payment_advices (sauda_id, inward_slip_pass_id, payer_id, recipient_id, sr_number, party_name,
                                  party_address, broker_name, invoice_number, invoice_date,
                                  truck_number, item, total_bags, due_date, bill_weight,
                                  kanta_weight, dana_deduction, final_weight, rate, amount, transaction_id,
                                  date_of_payment, status, payment_slip_image_url, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING id, sauda_id, inward_slip_pass_id, payer_id, recipient_id, sr_number, party_name, party_address,
                broker_name, invoice_number, invoice_date, truck_number, item, total_bags,
                due_date, bill_weight, kanta_weight, dana_deduction, final_weight, rate, amount, transaction_id,
                date_of_payment, status, payment_slip_image_url, notes, created_at, updated_at,
                created_by, updated_by
    `;
    
    const values = [
      paymentAdviceData.sauda_id || null,
      paymentAdviceData.inward_slip_pass_id || null,
      paymentAdviceData.payer_id,
      paymentAdviceData.recipient_id,
      paymentAdviceData.sr_number || null,
      paymentAdviceData.party_name || null,
      paymentAdviceData.party_address || null,
      paymentAdviceData.broker_name || null,
      paymentAdviceData.invoice_number || null,
      paymentAdviceData.invoice_date || null,
      paymentAdviceData.truck_number || null,
      paymentAdviceData.item || null,
      paymentAdviceData.total_bags || null,
      paymentAdviceData.due_date || null,
      paymentAdviceData.bill_weight || null,
      paymentAdviceData.kanta_weight || null,
      paymentAdviceData.dana_deduction || null,
      paymentAdviceData.final_weight || null,
      paymentAdviceData.rate || null,
      paymentAdviceData.amount,
      paymentAdviceData.transaction_id || null,
      paymentAdviceData.date_of_payment,
      paymentAdviceData.status || 'pending',
      paymentAdviceData.payment_slip_image_url || null,
      paymentAdviceData.notes || null,
      paymentAdviceData.created_by || null,
    ];

    try {
      const result = await db.query<PaymentAdvice>(query, values);
      logger.info('Payment advice created', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating payment advice', { error, paymentAdviceData });
      throw error;
    }
  }

  async update(id: string, paymentAdviceData: UpdatePaymentAdviceDTO): Promise<PaymentAdvice | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (paymentAdviceData.sauda_id !== undefined) {
      fields.push(`sauda_id = $${paramCount++}`);
      values.push(paymentAdviceData.sauda_id || null);
    }
    if (paymentAdviceData.inward_slip_pass_id !== undefined) {
      fields.push(`inward_slip_pass_id = $${paramCount++}`);
      values.push(paymentAdviceData.inward_slip_pass_id || null);
    }
    if (paymentAdviceData.payer_id !== undefined) {
      fields.push(`payer_id = $${paramCount++}`);
      values.push(paymentAdviceData.payer_id);
    }
    if (paymentAdviceData.recipient_id !== undefined) {
      fields.push(`recipient_id = $${paramCount++}`);
      values.push(paymentAdviceData.recipient_id);
    }
    if (paymentAdviceData.sr_number !== undefined) {
      fields.push(`sr_number = $${paramCount++}`);
      values.push(paymentAdviceData.sr_number || null);
    }
    if (paymentAdviceData.party_name !== undefined) {
      fields.push(`party_name = $${paramCount++}`);
      values.push(paymentAdviceData.party_name || null);
    }
    if (paymentAdviceData.party_address !== undefined) {
      fields.push(`party_address = $${paramCount++}`);
      values.push(paymentAdviceData.party_address || null);
    }
    if (paymentAdviceData.broker_name !== undefined) {
      fields.push(`broker_name = $${paramCount++}`);
      values.push(paymentAdviceData.broker_name || null);
    }
    if (paymentAdviceData.invoice_number !== undefined) {
      fields.push(`invoice_number = $${paramCount++}`);
      values.push(paymentAdviceData.invoice_number || null);
    }
    if (paymentAdviceData.invoice_date !== undefined) {
      fields.push(`invoice_date = $${paramCount++}`);
      values.push(paymentAdviceData.invoice_date || null);
    }
    if (paymentAdviceData.truck_number !== undefined) {
      fields.push(`truck_number = $${paramCount++}`);
      values.push(paymentAdviceData.truck_number || null);
    }
    if (paymentAdviceData.item !== undefined) {
      fields.push(`item = $${paramCount++}`);
      values.push(paymentAdviceData.item || null);
    }
    if (paymentAdviceData.total_bags !== undefined) {
      fields.push(`total_bags = $${paramCount++}`);
      values.push(paymentAdviceData.total_bags || null);
    }
    if (paymentAdviceData.due_date !== undefined) {
      fields.push(`due_date = $${paramCount++}`);
      values.push(paymentAdviceData.due_date || null);
    }
    if (paymentAdviceData.bill_weight !== undefined) {
      fields.push(`bill_weight = $${paramCount++}`);
      values.push(paymentAdviceData.bill_weight || null);
    }
    if (paymentAdviceData.kanta_weight !== undefined) {
      fields.push(`kanta_weight = $${paramCount++}`);
      values.push(paymentAdviceData.kanta_weight || null);
    }
    if (paymentAdviceData.dana_deduction !== undefined) {
      fields.push(`dana_deduction = $${paramCount++}`);
      values.push(paymentAdviceData.dana_deduction || null);
    }
    if (paymentAdviceData.final_weight !== undefined) {
      fields.push(`final_weight = $${paramCount++}`);
      values.push(paymentAdviceData.final_weight || null);
    }
    if (paymentAdviceData.rate !== undefined) {
      fields.push(`rate = $${paramCount++}`);
      values.push(paymentAdviceData.rate || null);
    }
    if (paymentAdviceData.amount !== undefined) {
      fields.push(`amount = $${paramCount++}`);
      values.push(paymentAdviceData.amount);
    }
    if (paymentAdviceData.transaction_id !== undefined) {
      fields.push(`transaction_id = $${paramCount++}`);
      values.push(paymentAdviceData.transaction_id || null);
    }
    if (paymentAdviceData.date_of_payment !== undefined) {
      fields.push(`date_of_payment = $${paramCount++}`);
      values.push(paymentAdviceData.date_of_payment);
    }
    if (paymentAdviceData.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(paymentAdviceData.status);
    }
    if (paymentAdviceData.payment_slip_image_url !== undefined) {
      fields.push(`payment_slip_image_url = $${paramCount++}`);
      values.push(paymentAdviceData.payment_slip_image_url || null);
    }
    
    // Auto-update status to 'completed' when both payment slip and transaction_id are present
    // Check if both are being set in this update
    const hasTransactionId = paymentAdviceData.transaction_id !== undefined;
    const hasPaymentSlip = paymentAdviceData.payment_slip_image_url !== undefined;
    
    // Also check existing record if needed
    if ((hasTransactionId || hasPaymentSlip) && paymentAdviceData.status === undefined) {
      const existing = await this.findById(id);
      if (existing) {
        const willHaveTransactionId = hasTransactionId ? paymentAdviceData.transaction_id : existing.transaction_id;
        const willHavePaymentSlip = hasPaymentSlip ? paymentAdviceData.payment_slip_image_url : existing.payment_slip_image_url;
        
        if (willHaveTransactionId && willHavePaymentSlip) {
          const statusAlreadySet = fields.some(f => f.includes('status ='));
          if (!statusAlreadySet) {
            fields.push(`status = $${paramCount++}`);
            values.push('completed');
          }
        }
      }
    }
    if (paymentAdviceData.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(paymentAdviceData.notes || null);
    }
    if (paymentAdviceData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(paymentAdviceData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE payment_advices
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, sauda_id, inward_slip_pass_id, payer_id, recipient_id, sr_number, party_name, party_address,
                broker_name, invoice_number, invoice_date, truck_number, item, total_bags,
                due_date, bill_weight, kanta_weight, dana_deduction, final_weight, rate, amount, transaction_id,
                date_of_payment, status, payment_slip_image_url, notes, created_at, updated_at,
                created_by, updated_by
    `;

    try {
      const result = await db.query<PaymentAdvice>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Payment advice updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating payment advice', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM payment_advices WHERE id = $1`;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Payment advice deleted', { id });
    }
    return deleted;
  }
}

export const paymentAdviceDAO = new PaymentAdviceDAO();

