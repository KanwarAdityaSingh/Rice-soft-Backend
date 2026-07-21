import { ValidationError } from '../utils/errors';
import {
  COMMISSION_RICE_TYPES,
  CommissionRiceType,
  ComputeSalesmanCommissionInput,
  SalesmanCommissionConfig,
  SalesmanCommissionType,
  SALESMAN_COMMISSION_TYPES,
} from '../constants/salesman-commission-types';

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertNonNegNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a number`);
  }
  if (value < 0) {
    throw new ValidationError(`${field} must be >= 0`);
  }
  return value;
}

export function isSalesmanCommissionType(value: unknown): value is SalesmanCommissionType {
  return (
    typeof value === 'string' &&
    (SALESMAN_COMMISSION_TYPES as readonly string[]).includes(value)
  );
}

export function normalizeCommissionTypes(types: unknown): SalesmanCommissionType[] {
  if (types == null) return [];
  if (!Array.isArray(types)) {
    throw new ValidationError('commission_types must be an array');
  }
  const seen = new Set<string>();
  const result: SalesmanCommissionType[] = [];
  for (const item of types) {
    if (!isSalesmanCommissionType(item)) {
      throw new ValidationError(
        `Invalid commission type: ${String(item)}. Allowed: ${SALESMAN_COMMISSION_TYPES.join(', ')}`
      );
    }
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/**
 * Validate and normalize commission config for a given type.
 * Returns a clean JSON-serializable object.
 */
export function parseSalesmanCommissionConfig(
  type: SalesmanCommissionType,
  config: unknown
): SalesmanCommissionConfig {
  if (!isPlainObject(config)) {
    throw new ValidationError('salesman_commission_config must be an object');
  }

  switch (type) {
    case 'per_kg': {
      const rate_per_kg = assertNonNegNumber(config.rate_per_kg, 'rate_per_kg');
      return { rate_per_kg };
    }
    case 'percent_of_sale': {
      const percent = assertNonNegNumber(config.percent, 'percent');
      if (percent > 100) {
        throw new ValidationError('percent cannot exceed 100');
      }
      return { percent };
    }
    case 'fixed_per_transaction': {
      const amount = assertNonNegNumber(config.amount, 'amount');
      return { amount };
    }
    case 'by_rice_quality': {
      if (!Array.isArray(config.rates) || config.rates.length === 0) {
        throw new ValidationError('by_rice_quality requires a non-empty rates array');
      }
      const seen = new Set<string>();
      const rates: Array<{ rice_type: CommissionRiceType; rate_per_kg: number }> = [];
      for (const row of config.rates) {
        if (!isPlainObject(row)) {
          throw new ValidationError('each rates entry must be an object');
        }
        const riceType = row.rice_type;
        if (
          typeof riceType !== 'string' ||
          !(COMMISSION_RICE_TYPES as readonly string[]).includes(riceType)
        ) {
          throw new ValidationError(
            `Invalid rice_type in commission rates: ${String(riceType)}. Allowed: ${COMMISSION_RICE_TYPES.join(', ')}`
          );
        }
        if (seen.has(riceType)) {
          throw new ValidationError(`Duplicate rice_type in commission rates: ${riceType}`);
        }
        seen.add(riceType);
        rates.push({
          rice_type: riceType as CommissionRiceType,
          rate_per_kg: assertNonNegNumber(row.rate_per_kg, 'rate_per_kg'),
        });
      }
      return { rates };
    }
    case 'by_customer': {
      const basis = config.basis;
      if (basis !== 'per_kg' && basis !== 'percent_of_sale') {
        throw new ValidationError("by_customer basis must be 'per_kg' or 'percent_of_sale'");
      }
      const value = assertNonNegNumber(config.value, 'value');
      if (basis === 'percent_of_sale' && value > 100) {
        throw new ValidationError('value cannot exceed 100 for percent_of_sale basis');
      }
      return { basis, value };
    }
    default: {
      const _exhaustive: never = type;
      throw new ValidationError(`Unsupported commission type: ${String(_exhaustive)}`);
    }
  }
}

/** Ensure every distinct rice_type on lines has a rate (ignore null rice_type). */
export function assertRiceQualityRatesCoverLines(
  config: SalesmanCommissionConfig,
  lineRiceTypes: Array<string | null | undefined>
): void {
  if (!('rates' in config) || !Array.isArray(config.rates)) {
    throw new ValidationError('by_rice_quality config is required');
  }
  const rateMap = new Set(config.rates.map((r) => r.rice_type));
  const needed = [
    ...new Set(
      lineRiceTypes.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    ),
  ];
  const missing = needed.filter((t) => !rateMap.has(t as CommissionRiceType));
  if (missing.length > 0) {
    throw new ValidationError(
      `Commission rates missing for rice qualities on lines: ${missing.join(', ')}`
    );
  }
}

/**
 * Pure commission calculator. Amount is always rounded to 2 decimal places.
 */
export function computeSalesmanCommission(input: ComputeSalesmanCommissionInput): number {
  const { type, config, quantity_kg, sale_amount, lines } = input;
  const qty = Number(quantity_kg) || 0;
  const sale = Number(sale_amount) || 0;

  switch (type) {
    case 'per_kg': {
      const c = config as { rate_per_kg: number };
      return round2(qty * c.rate_per_kg);
    }
    case 'percent_of_sale': {
      const c = config as { percent: number };
      return round2((sale * c.percent) / 100);
    }
    case 'fixed_per_transaction': {
      const c = config as { amount: number };
      return round2(c.amount);
    }
    case 'by_rice_quality': {
      const c = config as { rates: Array<{ rice_type: string; rate_per_kg: number }> };
      const rateByType = new Map(c.rates.map((r) => [r.rice_type, r.rate_per_kg]));
      const basisLines = lines ?? [];
      let total = 0;
      for (const line of basisLines) {
        const riceType = line.rice_type;
        if (riceType == null || String(riceType).trim() === '') {
          throw new ValidationError(
            'by_rice_quality commission requires rice_type on every line with quantity'
          );
        }
        const rate = rateByType.get(String(riceType));
        if (rate == null) {
          throw new ValidationError(
            `No commission rate for rice_type: ${riceType}`
          );
        }
        total += (Number(line.quantity_kg) || 0) * rate;
      }
      return round2(total);
    }
    case 'by_customer': {
      const c = config as { basis: 'per_kg' | 'percent_of_sale'; value: number };
      if (c.basis === 'per_kg') {
        return round2(qty * c.value);
      }
      return round2((sale * c.value) / 100);
    }
    default: {
      const _exhaustive: never = type;
      throw new ValidationError(`Unsupported commission type: ${String(_exhaustive)}`);
    }
  }
}
