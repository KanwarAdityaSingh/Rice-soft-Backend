/**
 * Shared list free-text search helpers.
 *
 * Matching is punctuation/spacing/case insensitive via alphanumeric folding
 * (e.g. "M.R.T" ↔ "mrt"). Tokens from whitespace are AND-combined; columns are OR'd.
 * Always combine with exact filters and apply COUNT + LIMIT/OFFSET on the filtered set.
 */

export function normalizeSearchTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Split on whitespace, normalize each token, drop empties.
 * "m.r.t traders" → ["mrt", "traders"]
 * "singh traders" → ["singh", "traders"]
 */
export function tokenizeSearchQuery(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .map(normalizeSearchTerm)
    .filter((t) => t.length > 0);
}

/** Escape `\`, `%`, `_` for use inside a LIKE pattern with ESCAPE '\'. */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Parse `search` (preferred) or `q` from Express query.
 */
export function parseSearchQuery(query: {
  search?: unknown;
  q?: unknown;
}): string | undefined {
  const raw = query.search ?? query.q;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const s = String(raw).trim();
  return s || undefined;
}

export interface NormalizedSearchClause {
  /** SQL starting with ` AND (...)`, or empty string when no tokens */
  sql: string;
  params: string[];
  nextParamIndex: number;
}

/**
 * Build a WHERE fragment: each token must match at least one column (normalized).
 *
 * @param columns SQL expressions castable to text (e.g. `p.name`, `serial_number::text`)
 * @param search Raw user search string
 * @param paramStart Next `$n` index to use (1-based)
 */
export function buildNormalizedSearchClause(
  columns: string[],
  search: string | undefined | null,
  paramStart: number
): NormalizedSearchClause {
  const tokens = tokenizeSearchQuery(search ?? '');
  if (tokens.length === 0 || columns.length === 0) {
    return { sql: '', params: [], nextParamIndex: paramStart };
  }

  const params: string[] = [];
  let paramIndex = paramStart;
  const tokenClauses: string[] = [];

  for (const token of tokens) {
    const p = `$${paramIndex++}`;
    params.push(escapeLikePattern(token));
    const colClauses = columns.map(
      (col) =>
        `regexp_replace(lower(coalesce((${col})::text, '')), '[^a-z0-9]', '', 'g') LIKE '%' || ${p} || '%' ESCAPE '\\'`
    );
    tokenClauses.push(`(${colClauses.join(' OR ')})`);
  }

  return {
    sql: ` AND (${tokenClauses.join(' AND ')})`,
    params,
    nextParamIndex: paramIndex,
  };
}
