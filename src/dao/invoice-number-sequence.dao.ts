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

  /**
   * Lock series row and return current tip (last_value). Ensures row exists.
   */
  async lockAndGetLastValue(
    seriesKey: string,
    financialYear: string,
    stateCode: string,
    documentType: string,
    client: PoolClient
  ): Promise<number> {
    await client.query(
      `
      INSERT INTO invoice_number_sequences (
        series_key, financial_year, state_code, document_type, last_value, updated_at
      )
      VALUES ($1, $2, $3, $4, 0, CURRENT_TIMESTAMP)
      ON CONFLICT (series_key) DO NOTHING
      `,
      [seriesKey, financialYear, stateCode, documentType]
    );

    const result = await client.query<{ last_value: number }>(
      `SELECT last_value FROM invoice_number_sequences WHERE series_key = $1 FOR UPDATE`,
      [seriesKey]
    );
    return Number(result.rows[0].last_value);
  }

  /**
   * Decrement tip by 1 only when last_value still matches the deleted sequence.
   */
  async releaseTip(
    seriesKey: string,
    expectedLastValue: number,
    client: PoolClient
  ): Promise<boolean> {
    const result = await client.query<{ last_value: number }>(
      `
      UPDATE invoice_number_sequences
      SET last_value = last_value - 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE series_key = $1
        AND last_value = $2
        AND last_value > 0
      RETURNING last_value
      `,
      [seriesKey, expectedLastValue]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const invoiceNumberSequenceDAO = new InvoiceNumberSequenceDAO();
