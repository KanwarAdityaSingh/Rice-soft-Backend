/** Commission types a salesman may be enabled for; one is applied per sales sauda. */
export const SALESMAN_COMMISSION_TYPES = [
  'per_kg',
  'percent_of_sale',
  'fixed_per_transaction',
  'by_rice_quality',
  'by_customer',
] as const;

export type SalesmanCommissionType = (typeof SALESMAN_COMMISSION_TYPES)[number];

export const SALESMAN_COMMISSION_TYPE_OPTIONS = [
  { value: 'per_kg', label: 'Fixed amount per kg' },
  { value: 'percent_of_sale', label: 'Percentage on sale value' },
  { value: 'fixed_per_transaction', label: 'Fixed amount per transaction' },
  { value: 'by_rice_quality', label: 'Commission by rice quality' },
  { value: 'by_customer', label: 'Commission by customer' },
] as const;

/** Rice quality keys used for by_rice_quality rates (matches products.rice_type). */
export const COMMISSION_RICE_TYPES = [
  'basmati',
  'non_basmati',
  'parboiled',
  'raw',
  'raw_basmati',
  'steam_basmati',
  'white_sella',
  'golden_sella',
] as const;

export type CommissionRiceType = (typeof COMMISSION_RICE_TYPES)[number];

export type SalesmanCommissionByCustomerBasis = 'per_kg' | 'percent_of_sale';

export interface PerKgCommissionConfig {
  rate_per_kg: number;
}

export interface PercentOfSaleCommissionConfig {
  percent: number;
}

export interface FixedPerTransactionCommissionConfig {
  amount: number;
}

export interface ByRiceQualityCommissionConfig {
  rates: Array<{ rice_type: CommissionRiceType; rate_per_kg: number }>;
}

export interface ByCustomerCommissionConfig {
  basis: SalesmanCommissionByCustomerBasis;
  value: number;
}

export type SalesmanCommissionConfig =
  | PerKgCommissionConfig
  | PercentOfSaleCommissionConfig
  | FixedPerTransactionCommissionConfig
  | ByRiceQualityCommissionConfig
  | ByCustomerCommissionConfig;

export interface CommissionLineBasis {
  rice_type: CommissionRiceType | string | null;
  quantity_kg: number;
  sale_amount: number;
}

export interface ComputeSalesmanCommissionInput {
  type: SalesmanCommissionType;
  config: SalesmanCommissionConfig;
  /** Total kg (used when type does not need per-line breakdown). */
  quantity_kg: number;
  /** Total sale amount (₹). */
  sale_amount: number;
  /** Required for by_rice_quality; optional otherwise. */
  lines?: CommissionLineBasis[];
}
