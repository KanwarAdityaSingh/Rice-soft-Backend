import { db } from '../database/connection';
import { InwardSlipPass, CreateInwardSlipPassDTO, UpdateInwardSlipPassDTO } from '../models/inward-slip-pass.model';
import { logger } from '../utils/logger';
import { calculatePurchaseAmount } from '../utils/purchase-calculations';

export class InwardSlipPassDAO {
  async findAll(saudaId?: string): Promise<InwardSlipPass[]> {
    let query = `
      SELECT id, slip_number, date, vehicle_number, party_name, party_address,
             party_gst_number, party_pan_number, transporter_id, transportation_cost, status, inward_slip_bill_image_url, transportation_bill_image_url,
             bill_pdf_url, bilti_image_url, bilti_pdf_url, eway_bill_number, eway_bill_url,
             notes, created_at, updated_at, created_by, updated_by
      FROM inward_slip_passes
      WHERE 1=1
    `;
    
    const params: any[] = [];

    if (saudaId) {
      query += ` AND id IN (
        SELECT inward_slip_pass_id 
        FROM inward_slip_pass_saudas 
        WHERE sauda_id = $1
      )`;
      params.push(saudaId);
    }

    query += ` ORDER BY date DESC, created_at DESC`;

    const result = await db.query<InwardSlipPass>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<InwardSlipPass | null> {
    const query = `
      SELECT id, slip_number, date, vehicle_number, party_name, party_address,
             party_gst_number, party_pan_number, transporter_id, transportation_cost, status, inward_slip_bill_image_url, transportation_bill_image_url,
             bill_pdf_url, bilti_image_url, bilti_pdf_url, eway_bill_number, eway_bill_url,
             notes, created_at, updated_at, created_by, updated_by
      FROM inward_slip_passes
      WHERE id = $1
    `;
    const result = await db.query<InwardSlipPass>(query, [id]);
    return result.rows[0] || null;
  }

  async create(inwardSlipPassData: CreateInwardSlipPassDTO): Promise<InwardSlipPass> {
    const query = `
      INSERT INTO inward_slip_passes (slip_number, date, vehicle_number, party_name,
                                      party_address, party_gst_number, party_pan_number, transporter_id, transportation_cost, status, inward_slip_bill_image_url,
                                      transportation_bill_image_url, bill_pdf_url, bilti_image_url,
                                      bilti_pdf_url, eway_bill_number, eway_bill_url, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id, slip_number, date, vehicle_number, party_name, party_address,
                party_gst_number, transporter_id, transportation_cost, status, inward_slip_bill_image_url, transportation_bill_image_url,
                bill_pdf_url, bilti_image_url, bilti_pdf_url, eway_bill_number, eway_bill_url,
                notes, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      inwardSlipPassData.slip_number,
      inwardSlipPassData.date,
      inwardSlipPassData.vehicle_number,
      inwardSlipPassData.party_name,
      inwardSlipPassData.party_address || null,
      inwardSlipPassData.party_gst_number || null,
      inwardSlipPassData.party_pan_number || null,
      inwardSlipPassData.transporter_id || null,
      inwardSlipPassData.transportation_cost || null,
      inwardSlipPassData.status || 'pending',
      inwardSlipPassData.inward_slip_bill_image_url || null,
      inwardSlipPassData.transportation_bill_image_url || null,
      inwardSlipPassData.bill_pdf_url || null,
      inwardSlipPassData.bilti_image_url || null,
      inwardSlipPassData.bilti_pdf_url || null,
      inwardSlipPassData.eway_bill_number || null,
      inwardSlipPassData.eway_bill_url || null,
      inwardSlipPassData.notes || null,
      inwardSlipPassData.created_by || null,
    ];

    try {
      const result = await db.query<InwardSlipPass>(query, values);
      logger.info('Inward slip pass created', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating inward slip pass', { error, inwardSlipPassData });
      throw error;
    }
  }

  async update(id: string, inwardSlipPassData: UpdateInwardSlipPassDTO): Promise<InwardSlipPass | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (inwardSlipPassData.slip_number !== undefined) {
      fields.push(`slip_number = $${paramCount++}`);
      values.push(inwardSlipPassData.slip_number);
    }
    if (inwardSlipPassData.date !== undefined) {
      fields.push(`date = $${paramCount++}`);
      values.push(inwardSlipPassData.date);
    }
    if (inwardSlipPassData.vehicle_number !== undefined) {
      fields.push(`vehicle_number = $${paramCount++}`);
      values.push(inwardSlipPassData.vehicle_number);
    }
    if (inwardSlipPassData.party_name !== undefined) {
      fields.push(`party_name = $${paramCount++}`);
      values.push(inwardSlipPassData.party_name);
    }
    if (inwardSlipPassData.party_address !== undefined) {
      fields.push(`party_address = $${paramCount++}`);
      values.push(inwardSlipPassData.party_address || null);
    }
    if (inwardSlipPassData.party_gst_number !== undefined) {
      fields.push(`party_gst_number = $${paramCount++}`);
      values.push(inwardSlipPassData.party_gst_number || null);
    }
    if (inwardSlipPassData.party_pan_number !== undefined) {
      fields.push(`party_pan_number = $${paramCount++}`);
      values.push(inwardSlipPassData.party_pan_number || null);
    }
    if (inwardSlipPassData.transporter_id !== undefined) {
      fields.push(`transporter_id = $${paramCount++}`);
      values.push(inwardSlipPassData.transporter_id || null);
    }
    if (inwardSlipPassData.transportation_cost !== undefined) {
      fields.push(`transportation_cost = $${paramCount++}`);
      values.push(inwardSlipPassData.transportation_cost || null);
    }
    if (inwardSlipPassData.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(inwardSlipPassData.status);
    }
    if (inwardSlipPassData.inward_slip_bill_image_url !== undefined) {
      fields.push(`inward_slip_bill_image_url = $${paramCount++}`);
      values.push(inwardSlipPassData.inward_slip_bill_image_url || null);
    }
    if (inwardSlipPassData.transportation_bill_image_url !== undefined) {
      fields.push(`transportation_bill_image_url = $${paramCount++}`);
      values.push(inwardSlipPassData.transportation_bill_image_url || null);
    }
    if (inwardSlipPassData.bill_pdf_url !== undefined) {
      fields.push(`bill_pdf_url = $${paramCount++}`);
      values.push(inwardSlipPassData.bill_pdf_url || null);
    }
    if (inwardSlipPassData.bilti_image_url !== undefined) {
      fields.push(`bilti_image_url = $${paramCount++}`);
      values.push(inwardSlipPassData.bilti_image_url || null);
    }
    if (inwardSlipPassData.bilti_pdf_url !== undefined) {
      fields.push(`bilti_pdf_url = $${paramCount++}`);
      values.push(inwardSlipPassData.bilti_pdf_url || null);
    }
    if (inwardSlipPassData.eway_bill_number !== undefined) {
      fields.push(`eway_bill_number = $${paramCount++}`);
      values.push(inwardSlipPassData.eway_bill_number || null);
    }
    if (inwardSlipPassData.eway_bill_url !== undefined) {
      fields.push(`eway_bill_url = $${paramCount++}`);
      values.push(inwardSlipPassData.eway_bill_url || null);
    }
    if (inwardSlipPassData.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(inwardSlipPassData.notes || null);
    }
    if (inwardSlipPassData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(inwardSlipPassData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE inward_slip_passes
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, slip_number, date, vehicle_number, party_name, party_address,
                party_gst_number, transporter_id, transportation_cost, status, inward_slip_bill_image_url, transportation_bill_image_url,
                bill_pdf_url, bilti_image_url, bilti_pdf_url, eway_bill_number, eway_bill_url,
                notes, created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<InwardSlipPass>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Inward slip pass updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating inward slip pass', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    // Get the linked sauda_ids before deletion to recalculate purchases
    const saudaIdsQuery = `
      SELECT sauda_id
      FROM inward_slip_pass_saudas
      WHERE inward_slip_pass_id = $1
    `;
    const saudaIdsResult = await db.query<{ sauda_id: string }>(saudaIdsQuery, [id]);
    const saudaIds = saudaIdsResult.rows.map(row => row.sauda_id);

    const query = `DELETE FROM inward_slip_passes WHERE id = $1`;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    
    if (deleted) {
      logger.info('Inward slip pass deleted', { id, saudaIds });
      
      // Recalculate purchase totals from remaining inward slip passes for each linked sauda
      // This aggregates total_weight and total_amount from all inward slip lots
      for (const saudaId of saudaIds) {
      await this.recalculatePurchaseTotals(saudaId);
      }
    }
    
    return deleted;
  }

  /**
   * Recalculate purchase totals from inward slip passes for a given sauda
   * Aggregates total_weight and total_amount from all inward slip lots
   * Applies: cash_discount (subtract), broker_commission (add), transportation_cost (add for xgodown), IGST (add)
   */
  private async recalculatePurchaseTotals(saudaId: string): Promise<void> {
    try {
      // Get all purchases for this sauda
      const purchaseQuery = `
        SELECT id, igst_percentage, broker_commission
        FROM purchases
        WHERE sauda_id = $1
      `;
      const purchases = await db.query(purchaseQuery, [saudaId]);
      
      for (const purchase of purchases.rows) {
        // Use utility function to calculate purchase amount with all factors
        const calculation = await calculatePurchaseAmount(
          saudaId,
          purchase.broker_commission,
          purchase.igst_percentage
        );
        
        // Update purchase with recalculated totals
        const updatePurchasesQuery = `
          UPDATE purchases
          SET 
            total_weight = $1,
            total_amount = $2,
            igst_amount = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
        `;
        
        await db.query(updatePurchasesQuery, [
          calculation.totalWeight || null,
          calculation.finalTotalAmount || null,
          calculation.igstAmount || null,
          purchase.id
        ]);
        
        // Update payment advice amount if it's linked to this purchase
        // Payment advice amount should match the purchase total_amount
        const paymentAdviceQuery = `
          SELECT id, amount
          FROM payment_advices
          WHERE purchase_id = $1
        `;
        const paymentAdvices = await db.query(paymentAdviceQuery, [purchase.id]);
        
        for (const paymentAdvice of paymentAdvices.rows) {
          // Update payment advice amount to match new purchase total
          const updatePaymentAdviceQuery = `
            UPDATE payment_advices
            SET 
              amount = $1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `;
          
          await db.query(updatePaymentAdviceQuery, [
            calculation.finalTotalAmount || null,
            paymentAdvice.id
          ]);
          
          logger.info('Payment advice amount updated', {
            paymentAdviceId: paymentAdvice.id,
            purchaseId: purchase.id,
            newAmount: calculation.finalTotalAmount,
            oldAmount: paymentAdvice.amount
          });
        }
        
        logger.info('Purchase totals recalculated', {
          purchaseId: purchase.id,
          saudaId,
          ...calculation
        });
      }
    } catch (error) {
      logger.error('Error recalculating purchase totals', { error, saudaId });
      // Don't throw - deletion should succeed even if recalculation fails
    }
  }
}

export const inwardSlipPassDAO = new InwardSlipPassDAO();

