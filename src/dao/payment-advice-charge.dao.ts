import { db } from '../database/connection';
import { PaymentAdviceCharge, CreatePaymentAdviceChargeDTO, UpdatePaymentAdviceChargeDTO } from '../models/payment-advice-charge.model';
import { logger } from '../utils/logger';
import { floorToMoneyStep } from '../utils/money';

export class PaymentAdviceChargeDAO {
  async findByPaymentAdviceId(paymentAdviceId: string): Promise<PaymentAdviceCharge[]> {
    const query = `
      SELECT id, payment_advice_id, charge_name, charge_value, charge_type, created_at, updated_at
      FROM payment_advice_charges
      WHERE payment_advice_id = $1
      ORDER BY created_at ASC
    `;
    const result = await db.query<PaymentAdviceCharge>(query, [paymentAdviceId]);
    return result.rows;
  }

  async findById(id: string): Promise<PaymentAdviceCharge | null> {
    const query = `
      SELECT id, payment_advice_id, charge_name, charge_value, charge_type, created_at, updated_at
      FROM payment_advice_charges
      WHERE id = $1
    `;
    const result = await db.query<PaymentAdviceCharge>(query, [id]);
    return result.rows[0] || null;
  }

  async create(chargeData: CreatePaymentAdviceChargeDTO & { payment_advice_id: string }): Promise<PaymentAdviceCharge> {
    const query = `
      INSERT INTO payment_advice_charges (payment_advice_id, charge_name, charge_value, charge_type)
      VALUES ($1, $2, $3, $4)
      RETURNING id, payment_advice_id, charge_name, charge_value, charge_type, created_at, updated_at
    `;
    
    const values = [
      chargeData.payment_advice_id,
      chargeData.charge_name,
      chargeData.charge_value,
      chargeData.charge_type || null,
    ];

    try {
      const result = await db.query<PaymentAdviceCharge>(query, values);
      logger.info('Payment advice charge created', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating payment advice charge', { error, chargeData });
      throw error;
    }
  }

  async createMany(charges: (CreatePaymentAdviceChargeDTO & { payment_advice_id: string })[]): Promise<PaymentAdviceCharge[]> {
    if (charges.length === 0) {
      return [];
    }

    const createdCharges: PaymentAdviceCharge[] = [];
    for (const charge of charges) {
      const created = await this.create(charge);
      createdCharges.push(created);
    }
    return createdCharges;
  }

  async update(id: string, chargeData: UpdatePaymentAdviceChargeDTO): Promise<PaymentAdviceCharge | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (chargeData.charge_name !== undefined) {
      fields.push(`charge_name = $${paramCount++}`);
      values.push(chargeData.charge_name);
    }
    if (chargeData.charge_value !== undefined) {
      fields.push(`charge_value = $${paramCount++}`);
      values.push(chargeData.charge_value);
    }
    if (chargeData.charge_type !== undefined) {
      fields.push(`charge_type = $${paramCount++}`);
      values.push(chargeData.charge_type || null);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE payment_advice_charges
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, payment_advice_id, charge_name, charge_value, charge_type, created_at, updated_at
    `;

    try {
      const result = await db.query<PaymentAdviceCharge>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Payment advice charge updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating payment advice charge', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM payment_advice_charges WHERE id = $1`;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Payment advice charge deleted', { id });
    }
    return deleted;
  }

  /** Replace all charges for a payment advice (used on PUT when charges[] is sent). */
  async replaceAllForPaymentAdvice(
    paymentAdviceId: string,
    charges: CreatePaymentAdviceChargeDTO[]
  ): Promise<PaymentAdviceCharge[]> {
    return db.transaction(async (client) => {
      await client.query(
        'DELETE FROM payment_advice_charges WHERE payment_advice_id = $1',
        [paymentAdviceId]
      );

      if (charges.length === 0) {
        return [];
      }

      const created: PaymentAdviceCharge[] = [];
      for (const charge of charges) {
        const result = await client.query<PaymentAdviceCharge>(
          `INSERT INTO payment_advice_charges (payment_advice_id, charge_name, charge_value, charge_type)
           VALUES ($1, $2, $3, $4)
           RETURNING id, payment_advice_id, charge_name, charge_value, charge_type, created_at, updated_at`,
          [
            paymentAdviceId,
            charge.charge_name,
            charge.charge_value,
            charge.charge_type || null,
          ]
        );
        created.push(result.rows[0]);
      }

      logger.info('Payment advice charges replaced', {
        paymentAdviceId,
        count: created.length,
      });
      return created;
    });
  }

  async calculateNetPayable(paymentAdviceId: string): Promise<number> {
    const paymentAdvice = await db.query<{ amount: number }>(
      'SELECT amount FROM payment_advices WHERE id = $1',
      [paymentAdviceId]
    );

    if (paymentAdvice.rows.length === 0) {
      throw new Error('Payment advice not found');
    }

    const charges = await this.findByPaymentAdviceId(paymentAdviceId);
    const totalCharges = charges.reduce(
      (sum, charge) => sum + floorToMoneyStep(parseFloat(charge.charge_value.toString())),
      0
    );
    const netPayable =
      parseFloat(paymentAdvice.rows[0].amount.toString()) - totalCharges;

    return floorToMoneyStep(netPayable);
  }
}

export const paymentAdviceChargeDAO = new PaymentAdviceChargeDAO();

