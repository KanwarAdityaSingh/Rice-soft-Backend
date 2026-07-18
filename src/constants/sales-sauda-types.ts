/**
 * Sales sauda commercial type (code-only enum).
 * ex = Ex-godown; for = FOR (freight on road / destination).
 */
export const SALES_SAUDA_TYPES = ['ex', 'for'] as const;

export type SalesSaudaType = (typeof SALES_SAUDA_TYPES)[number];

export const SALES_SAUDA_TYPE_OPTIONS: ReadonlyArray<{ value: SalesSaudaType; label: string }> = [
  { value: 'ex', label: 'Ex' },
  { value: 'for', label: 'FOR' },
];
