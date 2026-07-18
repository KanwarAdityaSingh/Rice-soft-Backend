import type { CalculationPolicyId } from './calculation-policies';

/** FY 2026–27 (Apr 2026) and later use current purchase calculation rules. */
export const CURRENT_FY_POLICY_THRESHOLD_START_YEAR = 2026;

/** Sorted descending — first matching `fromYear` wins when resolving policy by FY start year. */
export const POLICY_BY_FY_START_YEAR: ReadonlyArray<{
  fromYear: number;
  policyId: CalculationPolicyId;
}> = [
  { fromYear: CURRENT_FY_POLICY_THRESHOLD_START_YEAR, policyId: 'current_fy' },
  { fromYear: 0, policyId: 'legacy_fy' },
];

export function parsePolicyDate(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(`${value}T12:00:00.000Z`);
}

/** Indian FY start calendar year (Apr–Mar). e.g. 2026-03-15 → 2025; 2026-04-01 → 2026. */
export function getIndianFinancialYearStartYear(date: Date): number {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return month >= 4 ? year : year - 1;
}

export function formatFinancialYearLabel(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

export function financialYearFromDate(value: Date | string): {
  startYear: number;
  label: string;
} {
  const date = parsePolicyDate(value);
  const startYear = getIndianFinancialYearStartYear(date);
  return { startYear, label: formatFinancialYearLabel(startYear) };
}

export function resolvePolicyIdFromFinancialYearStartYear(fyStartYear: number): CalculationPolicyId {
  for (const entry of POLICY_BY_FY_START_YEAR) {
    if (fyStartYear >= entry.fromYear) {
      return entry.policyId;
    }
  }
  return 'legacy_fy';
}

export function resolvePolicyFromDate(value: Date | string): {
  financialYear: string;
  policyId: CalculationPolicyId;
} {
  const { startYear, label } = financialYearFromDate(value);
  return {
    financialYear: label,
    policyId: resolvePolicyIdFromFinancialYearStartYear(startYear),
  };
}
