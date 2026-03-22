/**
 * Bag material / product types for kaanta, bags_inventory, and related audit rows.
 * Matches DB CHECK constraints (migration 115_extend_bag_type_values).
 */
export const BAG_TYPE_VALUES = [
  'jute', // Jute bags/sacks
  'pp', // PP woven (bulk industry standard)
  'bopp_laminated', // BOPP laminated woven PP
  'non_woven', // Non-woven retail bags
  'vacuum_pouch', // Vacuum-sealed / PA-PE pouches
] as const;

export type BagType = (typeof BAG_TYPE_VALUES)[number];
