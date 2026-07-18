const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type DateFilterInput = string | Date | undefined;

/** Normalize Joi Date objects or strings to a value appendDateRangeConditions understands. */
export function normalizeDateFilterValue(value: DateFilterInput): string | undefined {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString().slice(0, 10);
  }
  return value;
}

/**
 * Append inclusive date-range conditions to a dynamic WHERE clause.
 * Date-only `YYYY-MM-DD` values: fromDate = start of calendar day, toDate = through end of day (DB session TZ).
 */
export function appendDateRangeConditions(
  conditions: string[],
  values: unknown[],
  column: string,
  fromDate?: DateFilterInput,
  toDate?: DateFilterInput
): void {
  const from = normalizeDateFilterValue(fromDate);
  const to = normalizeDateFilterValue(toDate);

  if (from) {
    conditions.push(
      DATE_ONLY.test(from)
        ? `${column} >= $${values.length + 1}::date`
        : `${column} >= $${values.length + 1}`
    );
    values.push(from);
  }
  if (to) {
    conditions.push(
      DATE_ONLY.test(to)
        ? `${column} < ($${values.length + 1}::date + interval '1 day')`
        : `${column} <= $${values.length + 1}`
    );
    values.push(to);
  }
}

/** Build ` AND ...` fragment for optional date range (param indices start at 1). */
export function buildDateRangeClause(
  column: string,
  fromDate?: DateFilterInput,
  toDate?: DateFilterInput
): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  appendDateRangeConditions(conditions, params, column, fromDate, toDate);
  return {
    clause: conditions.length ? ` AND ${conditions.join(' AND ')}` : '',
    params,
  };
}
