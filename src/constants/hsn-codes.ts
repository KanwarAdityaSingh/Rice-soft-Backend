/**
 * Allowed HSN codes for products.
 * Code-only enum — validated in app layer; DB stores VARCHAR (not a Postgres enum).
 * Add new values here when HSN codes expand.
 */
export const HSN_CODES = ['100630'] as const;

export type HsnCode = (typeof HSN_CODES)[number];

export const HSN_CODE_OPTIONS: ReadonlyArray<{ value: HsnCode; label: string }> = [
  { value: '100630', label: '100630' },
];
