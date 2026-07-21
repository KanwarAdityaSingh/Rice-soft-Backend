export const SALES_MOVEMENT_TYPES = ['sale', 'godown_transfer'] as const;

export type SalesMovementType = (typeof SALES_MOVEMENT_TYPES)[number];

export const SALES_MOVEMENT_TYPE_OPTIONS = [
  { value: 'sale', label: 'Sale' },
  { value: 'godown_transfer', label: 'Godown transfer' },
] as const;
