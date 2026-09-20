/**
 * Shared list pagination helpers.
 * Query: page (1-based, default 1), limit (default 50, max 100).
 */

export const PAGINATION_DEFAULT_PAGE = 1;
export const PAGINATION_DEFAULT_LIMIT = 50;
export const PAGINATION_MAX_LIMIT = 100;

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/**
 * Parse `page` / `limit` from Express query (or plain object).
 * Invalid values fall back to defaults; limit is capped at PAGINATION_MAX_LIMIT.
 */
export function parsePaginationQuery(query: {
  page?: unknown;
  limit?: unknown;
}): PaginationParams {
  const page = parsePositiveInt(query.page, PAGINATION_DEFAULT_PAGE);
  const rawLimit = parsePositiveInt(query.limit, PAGINATION_DEFAULT_LIMIT);
  const limit = Math.min(rawLimit, PAGINATION_MAX_LIMIT);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function toPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  return {
    items,
    total: Math.max(0, Math.floor(total)),
    page,
    limit,
  };
}
