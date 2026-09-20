import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { ConflictError } from './errors';

export type SequentialSerialTable =
  | 'inward_slip_lots'
  | 'invoice_dispatches'
  | 'packaging_material_purchases';

export interface InvoiceDispatchSerialScope {
  godownId: string;
  financialYear: string;
}

const TABLE_LABEL: Record<SequentialSerialTable, string> = {
  inward_slip_lots: 'lot',
  invoice_dispatches: 'invoice dispatch',
  packaging_material_purchases: 'packaging material purchase',
};

/**
 * Only the current tip serial(s) may be deleted within the relevant scope.
 * Lots / packaging material purchases: global.
 * Invoice dispatches: godown_id + financial_year.
 * A set is allowed iff it equals {max - n + 1, ..., max} in that scope.
 */
export async function assertCanDeleteSerialNumbers(
  table: SequentialSerialTable,
  serialNumbers: number[],
  client?: PoolClient,
  scope?: InvoiceDispatchSerialScope
): Promise<void> {
  const unique = [...new Set(serialNumbers.filter((n) => Number.isInteger(n) && n > 0))].sort(
    (a, b) => a - b
  );
  if (unique.length === 0) {
    throw new ConflictError(`Cannot delete ${TABLE_LABEL[table]}: missing serial_number`);
  }

  let sql: string;
  let params: unknown[] = [];

  if (table === 'invoice_dispatches') {
    if (!scope?.godownId || !scope.financialYear) {
      throw new ConflictError(
        'Cannot delete invoice dispatch: godown and financial year are required for serial check'
      );
    }
    sql = `
      SELECT MAX(serial_number)::text AS max
      FROM invoice_dispatches
      WHERE godown_id = $1 AND financial_year = $2
    `;
    params = [scope.godownId, scope.financialYear];
  } else if (table === 'packaging_material_purchases') {
    sql = `SELECT MAX(serial_number)::text AS max FROM packaging_material_purchases`;
  } else {
    sql = `SELECT MAX(serial_number)::text AS max FROM inward_slip_lots`;
  }

  const maxResult = client
    ? await client.query<{ max: string | null }>(sql, params)
    : await db.query<{ max: string | null }>(sql, params);
  const scopeMax = parseInt(maxResult.rows[0]?.max ?? '0', 10);
  if (!(scopeMax > 0)) {
    throw new ConflictError(`Cannot delete ${TABLE_LABEL[table]}: no serial numbers found`);
  }

  const expected = Array.from({ length: unique.length }, (_, i) => scopeMax - unique.length + 1 + i);
  const matches =
    unique.length === expected.length && unique.every((n, i) => n === expected[i]);

  if (!matches) {
    const tip = unique[unique.length - 1];
    throw new ConflictError(
      `Cannot delete this ${TABLE_LABEL[table]} (serial ${tip}): a higher serial still exists ` +
        `(current tip is ${scopeMax}). Delete newer records first.`
    );
  }
}

export async function assertCanDeleteSerialNumber(
  table: SequentialSerialTable,
  serialNumber: number,
  client?: PoolClient,
  scope?: InvoiceDispatchSerialScope
): Promise<void> {
  await assertCanDeleteSerialNumbers(table, [serialNumber], client, scope);
}
