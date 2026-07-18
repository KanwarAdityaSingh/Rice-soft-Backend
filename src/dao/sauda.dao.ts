import { db } from '../database/connection';
import { PoolClient } from 'pg';
import { Sauda, CreateSaudaDTO, UpdateSaudaDTO, SaudaStatus, SaudaType } from '../models/sauda.model';
import { logger } from '../utils/logger';

/**
 * Format a Date object to YYYY-MM-DD string using UTC
 * When PostgreSQL returns a DATE column, it's a Date object at midnight UTC,
 * so we need to use UTC methods to get the correct date value
 * For input dates, if they're Date objects, we also use UTC to avoid timezone issues
 */
function formatDateToLocalString(date: Date): string {
  // Use UTC methods to avoid timezone conversion issues
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const SAUDA_SELECT = `
  s.id, s.sauda_type, s.rice_category, s.rice_type, s.rice_length_id, s.rice_code_id, s.rate, s.broker_id, s.broker_commission, s.broker_commission_type,
  s.quantity, s.no_of_bags, s.bag_weight, s.received_until_now, s.completion_percentage, s.cash_discount, s.cash_discount_type, s.estimated_delivery_time,
  s.purchaser_id, s.cooked_rice_image_url, s.uncooked_rice_image_url, s.status, s.notes, s.is_dana_required,
  TO_CHAR(s.sauda_date, 'YYYY-MM-DD') as sauda_date,
  s.created_at, s.updated_at, s.created_by, s.updated_by,
  rl.name AS rice_length_name
`;

const SAUDA_FROM = `
  FROM saudas s
  LEFT JOIN rice_lengths rl ON rl.rice_length_id = s.rice_length_id
`;

export class SaudaDAO {
  async findAll(
    includeInactive = false,
    status?: SaudaStatus,
    saudaType?: SaudaType,
    purchaserId?: string
  ): Promise<Sauda[]> {
    let query = `
      SELECT ${SAUDA_SELECT}
      ${SAUDA_FROM}
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (!includeInactive && !status) {
      query += ` AND status != 'cancelled'`;
    }

    if (status) {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }

    if (saudaType) {
      query += ` AND sauda_type = $${paramCount++}`;
      params.push(saudaType);
    }

    if (purchaserId) {
      query += ` AND purchaser_id = $${paramCount++}`;
      params.push(purchaserId);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query<Sauda>(query, params);
    return result.rows;
  }

  async findById(id: string, client?: PoolClient): Promise<Sauda | null> {
    const query = `
      SELECT ${SAUDA_SELECT}
      ${SAUDA_FROM}
      WHERE s.id = $1
    `;
    const result = client
      ? await client.query<Sauda>(query, [id])
      : await db.query<Sauda>(query, [id]);
    return result.rows[0] || null;
  }

  async create(saudaData: CreateSaudaDTO, client?: PoolClient): Promise<Sauda> {
    const query = `
      INSERT INTO saudas (sauda_type, rice_category, rice_type, rice_length_id, rice_code_id, rate, broker_id, broker_commission, broker_commission_type,
                         quantity, no_of_bags, bag_weight, cash_discount, cash_discount_type, estimated_delivery_time,
                         purchaser_id, cooked_rice_image_url, uncooked_rice_image_url, status, notes, is_dana_required, sauda_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING id
    `;
    
    const values = [
      saudaData.sauda_type,
      saudaData.rice_category,
      saudaData.rice_type,
      saudaData.rice_length_id ?? null,
      saudaData.rice_code_id || null,
      saudaData.rate,
      saudaData.broker_id || null,
      saudaData.broker_commission || null,
      saudaData.broker_commission_type || 'percentage',
      saudaData.quantity || null,
      saudaData.no_of_bags ?? null,
      saudaData.bag_weight ?? null,
      saudaData.cash_discount || null,
      saudaData.cash_discount_type || 'rupees',
      saudaData.estimated_delivery_time || null,
      saudaData.purchaser_id,
      saudaData.cooked_rice_image_url || null,
      saudaData.uncooked_rice_image_url || null,
      saudaData.status || 'draft',
      saudaData.notes || null,
      saudaData.is_dana_required !== undefined ? saudaData.is_dana_required : null,
      saudaData.sauda_date !== undefined && saudaData.sauda_date !== null
        ? (typeof saudaData.sauda_date === 'string'
            ? saudaData.sauda_date
            : formatDateToLocalString(saudaData.sauda_date))
        : null,
      saudaData.created_by || null,
    ];

    try {
      const result = client
        ? await client.query<{ id: string }>(query, values)
        : await db.query<{ id: string }>(query, values);
      const createdId = result.rows[0].id;
      logger.info('Sauda created', { id: createdId });
      const created = await this.findById(createdId, client);
      if (!created) {
        throw new Error('Sauda not found after create');
      }
      return created;
    } catch (error) {
      logger.error('Error creating sauda', { error, saudaData });
      throw error;
    }
  }

  async update(id: string, saudaData: UpdateSaudaDTO, client?: PoolClient): Promise<Sauda | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (saudaData.sauda_type !== undefined) {
      fields.push(`sauda_type = $${paramCount++}`);
      values.push(saudaData.sauda_type);
    }
    if (saudaData.rice_category !== undefined) {
      fields.push(`rice_category = $${paramCount++}`);
      values.push(saudaData.rice_category);
    }
    if (saudaData.rice_type !== undefined) {
      fields.push(`rice_type = $${paramCount++}`);
      values.push(saudaData.rice_type);
    }
    if (saudaData.rice_length_id !== undefined) {
      fields.push(`rice_length_id = $${paramCount++}`);
      values.push(saudaData.rice_length_id ?? null);
    }
    if (saudaData.rice_code_id !== undefined) {
      fields.push(`rice_code_id = $${paramCount++}`);
      values.push(saudaData.rice_code_id || null);
    }
    if (saudaData.rate !== undefined) {
      fields.push(`rate = $${paramCount++}`);
      values.push(saudaData.rate);
    }
    if (saudaData.broker_id !== undefined) {
      fields.push(`broker_id = $${paramCount++}`);
      values.push(saudaData.broker_id || null);
    }
    if (saudaData.broker_commission !== undefined) {
      fields.push(`broker_commission = $${paramCount++}`);
      values.push(saudaData.broker_commission || null);
    }
    if (saudaData.broker_commission_type !== undefined) {
      fields.push(`broker_commission_type = $${paramCount++}`);
      values.push(saudaData.broker_commission_type);
    }
    if (saudaData.quantity !== undefined) {
      fields.push(`quantity = $${paramCount++}`);
      values.push(saudaData.quantity || null);
    }
    if (saudaData.no_of_bags !== undefined) {
      fields.push(`no_of_bags = $${paramCount++}`);
      values.push(saudaData.no_of_bags ?? null);
    }
    if (saudaData.bag_weight !== undefined) {
      fields.push(`bag_weight = $${paramCount++}`);
      values.push(saudaData.bag_weight ?? null);
    }
    if (saudaData.cash_discount !== undefined) {
      fields.push(`cash_discount = $${paramCount++}`);
      values.push(saudaData.cash_discount || null);
    }
    if (saudaData.cash_discount_type !== undefined) {
      fields.push(`cash_discount_type = $${paramCount++}`);
      values.push(saudaData.cash_discount_type);
    }
    if (saudaData.estimated_delivery_time !== undefined) {
      fields.push(`estimated_delivery_time = $${paramCount++}`);
      values.push(saudaData.estimated_delivery_time || null);
    }
    if (saudaData.purchaser_id !== undefined) {
      fields.push(`purchaser_id = $${paramCount++}`);
      values.push(saudaData.purchaser_id);
    }
    if (saudaData.cooked_rice_image_url !== undefined) {
      fields.push(`cooked_rice_image_url = $${paramCount++}`);
      values.push(saudaData.cooked_rice_image_url || null);
    }
    if (saudaData.uncooked_rice_image_url !== undefined) {
      fields.push(`uncooked_rice_image_url = $${paramCount++}`);
      values.push(saudaData.uncooked_rice_image_url || null);
    }
    if (saudaData.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(saudaData.status);
    }
    if (saudaData.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(saudaData.notes || null);
    }
    if (saudaData.is_dana_required !== undefined) {
      fields.push(`is_dana_required = $${paramCount++}`);
      values.push(saudaData.is_dana_required);
    }
    if (saudaData.sauda_date !== undefined) {
      fields.push(`sauda_date = $${paramCount++}`);
      let dateValue: string | null = null;
      if (saudaData.sauda_date !== null) {
        if (typeof saudaData.sauda_date === 'string') {
          // If it's already a string, use it directly (assuming YYYY-MM-DD format)
          dateValue = saudaData.sauda_date;
        } else if (saudaData.sauda_date instanceof Date) {
          // If it's a Date object, convert to YYYY-MM-DD format using local timezone
          dateValue = formatDateToLocalString(saudaData.sauda_date);
        }
      }
      values.push(dateValue);
    }
    if (saudaData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(saudaData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE saudas
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
    `;

    try {
      const result = client
        ? await client.query(query, values)
        : await db.query(query, values);
      if ((result.rowCount || 0) === 0) {
        return null;
      }
      logger.info('Sauda updated', { id });
      return this.findById(id, client);
    } catch (error) {
      logger.error('Error updating sauda', { error, id });
      throw error;
    }
  }

  /**
   * Recalculate received_until_now for a sauda by summing all kaanta weights
   * This method is called when kaantas are created, updated, or deleted
   */
  async recalculateReceivedWeight(saudaId: string): Promise<void> {
    const query = `
      UPDATE saudas
      SET received_until_now = COALESCE((
        SELECT SUM(COALESCE(kaanta_weight, 0))
        FROM kaantas
        WHERE sauda_id = $1
      ), 0)
      WHERE id = $1
    `;
    
    try {
      await db.query(query, [saudaId]);
      logger.info('Sauda received weight recalculated', { saudaId });
    } catch (error) {
      logger.error('Error recalculating sauda received weight', { error, saudaId });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    // Check if sauda exists
    const sauda = await this.findById(id);
    if (!sauda) {
      return false;
    }

    // Delete related records in the correct order to avoid foreign key constraint violations
    
    // 1. Delete payment advice charges linked to payment advices for this sauda
    const deletePaymentAdviceChargesQuery = `
      DELETE FROM payment_advice_charges
      WHERE payment_advice_id IN (
        SELECT id FROM payment_advices WHERE sauda_id = $1
      )
    `;
    await db.query(deletePaymentAdviceChargesQuery, [id]);

    // 2. Delete payment advices linked to this sauda
    const deletePaymentAdvicesQuery = `
      DELETE FROM payment_advices WHERE sauda_id = $1
    `;
    await db.query(deletePaymentAdvicesQuery, [id]);

    // 3. Unlink inward slip passes from this sauda (via junction table)
    //    Note: ISPs are not deleted as they can be linked to multiple saudas
    const unlinkInwardSlipPassesQuery = `DELETE FROM inward_slip_pass_saudas WHERE sauda_id = $1`;
    await db.query(unlinkInwardSlipPassesQuery, [id]);

    // 5. Delete inward slip lots linked to this sauda
    //    (lots have sauda_id directly and use ON DELETE RESTRICT)
    const deleteLotsQuery = `DELETE FROM inward_slip_lots WHERE sauda_id = $1`;
    await db.query(deleteLotsQuery, [id]);

    // 6. Now delete the sauda
    const query = `DELETE FROM saudas WHERE id = $1`;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Sauda deleted', { id });
    }
    return deleted;
  }
}

export const saudaDAO = new SaudaDAO();

