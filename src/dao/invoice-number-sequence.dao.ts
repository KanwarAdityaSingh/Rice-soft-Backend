import { PoolClient } from 'pg';
import { db } from '../database/connection';

export class InvoiceNumberSequenceDAO {
  /**
   * Atomically increment and return the next sequence value for a series.
   */
  async allocateNext(
    seriesKey: string,
    financialYear: string,
    stateCode: string,
    documentType: string,
    client?: PoolClient
  ): Promise<number> {
    const query = `
      INSERT INTO invoice_number_sequences (
        series_key, financial_year, state_code, document_type, last_value, updated_at
      )
      VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (series_key) DO UPDATE SET
        last_value = invoice_number_sequences.last_value + 1,
        updated_at = CURRENT_TIMESTAMP
      RETURNING last_value
    `;
    const params = [seriesKey, financialYear, stateCode, documentType];
    const result = client
      ? await client.query<{ last_value: number }>(query, params)
      : await db.query<{ last_value: number }>(query, params);
    return Number(result.rows[0].last_value);
  }
}

export const invoiceNumberSequenceDAO = new InvoiceNumberSequenceDAO();
