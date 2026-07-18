/** Top-level classification: Basmati vs Non Basmati */
export const RICE_CATEGORY_VALUES = ['basmati', 'non_basmati'] as const;
export type RiceCategory = (typeof RICE_CATEGORY_VALUES)[number];

export const RICE_CATEGORY_OPTIONS = [
  { value: 'basmati' as const, label: 'Basmati' },
  { value: 'non_basmati' as const, label: 'Non Basmati' },
];

/** Processing / grade variants shown after rice code is selected */
export const BASMATI_VARIANT_VALUES = [
  'raw_basmati',
  'steam_basmati',
  'white_sella',
  'golden_sella',
] as const;

export const NON_BASMATI_VARIANT_VALUES = ['non_basmati', 'parboiled', 'raw'] as const;

export type BasmatiVariant = (typeof BASMATI_VARIANT_VALUES)[number];
export type NonBasmatiVariant = (typeof NON_BASMATI_VARIANT_VALUES)[number];
export type RiceVariant = BasmatiVariant | NonBasmatiVariant;

export const BASMATI_VARIANT_OPTIONS = [
  { value: 'raw_basmati' as const, label: 'Raw Basmati' },
  { value: 'steam_basmati' as const, label: 'Steam Basmati' },
  { value: 'white_sella' as const, label: 'White Sella (Parboiled)' },
  { value: 'golden_sella' as const, label: 'Golden Sella (Parboiled)' },
];

export const NON_BASMATI_VARIANT_OPTIONS = [
  { value: 'non_basmati' as const, label: 'Non Basmati' },
  { value: 'parboiled' as const, label: 'Parboiled' },
  { value: 'raw' as const, label: 'Raw' },
];

export function variantsForCategory(category: RiceCategory): readonly RiceVariant[] {
  return category === 'basmati' ? BASMATI_VARIANT_VALUES : NON_BASMATI_VARIANT_VALUES;
}

export function isVariantAllowedForCategory(category: RiceCategory, variant: string): boolean {
  return (variantsForCategory(category) as readonly string[]).includes(variant);
}

export function inferCategoryFromLegacyRiceType(riceType: string): RiceCategory {
  if (
    riceType === 'basmati' ||
    riceType === 'raw_basmati' ||
    riceType === 'steam_basmati' ||
    riceType === 'white_sella' ||
    riceType === 'golden_sella'
  ) {
    return 'basmati';
  }
  return 'non_basmati';
}

export function normalizeLegacyRiceTypeToVariant(riceType: string, category: RiceCategory): RiceVariant {
  if (category === 'basmati') {
    if (riceType === 'basmati') return 'raw_basmati';
    if ((BASMATI_VARIANT_VALUES as readonly string[]).includes(riceType)) {
      return riceType as BasmatiVariant;
    }
    return 'raw_basmati';
  }
  if (riceType === 'basmati') return 'non_basmati';
  if ((NON_BASMATI_VARIANT_VALUES as readonly string[]).includes(riceType)) {
    return riceType as NonBasmatiVariant;
  }
  return 'non_basmati';
}
