import type { RiceCategory } from '../constants/rice-categories';
import type { RiceType } from '../models/lead.model';
import type { Sauda } from '../models/sauda.model';
import { ValidationError } from './errors';

export interface LotRiceSnapshot {
  rice_category: RiceCategory;
  rice_code_id: string | null;
  rice_type: RiceType;
  rice_length_id: string | null;
}

type SaudaRiceSource = Pick<
  Sauda,
  'rice_category' | 'rice_code_id' | 'rice_type' | 'rice_length_id'
>;

function snapshotFromSauda(sauda: SaudaRiceSource): LotRiceSnapshot {
  return {
    rice_category: sauda.rice_category,
    rice_code_id: sauda.rice_code_id,
    rice_type: sauda.rice_type,
    rice_length_id: sauda.rice_length_id,
  };
}

function nullableEqual(a: string | null | undefined, b: string | null): boolean {
  return (a ?? null) === b;
}

/** Lots always inherit rice fields from their sauda; optional client values must match exactly. */
export function resolveLotRiceFromSauda(
  sauda: SaudaRiceSource,
  input?: Partial<LotRiceSnapshot>
): LotRiceSnapshot {
  const inherited = snapshotFromSauda(sauda);

  if (input?.rice_category !== undefined && input.rice_category !== inherited.rice_category) {
    throw new ValidationError('Lot rice_category must match the linked sauda');
  }
  if (input?.rice_code_id !== undefined && !nullableEqual(input.rice_code_id, inherited.rice_code_id)) {
    throw new ValidationError('Lot rice_code_id must match the linked sauda');
  }
  if (input?.rice_type !== undefined && input.rice_type !== inherited.rice_type) {
    throw new ValidationError('Lot rice_type must match the linked sauda');
  }
  if (
    input?.rice_length_id !== undefined &&
    !nullableEqual(input.rice_length_id, inherited.rice_length_id)
  ) {
    throw new ValidationError('Lot rice_length_id must match the linked sauda');
  }

  return inherited;
}

export function saudaRiceFieldsAreChanging(
  update: Partial<LotRiceSnapshot>,
  existing: SaudaRiceSource
): boolean {
  if (update.rice_category !== undefined && update.rice_category !== existing.rice_category) {
    return true;
  }
  if (update.rice_code_id !== undefined && !nullableEqual(update.rice_code_id, existing.rice_code_id)) {
    return true;
  }
  if (update.rice_type !== undefined && update.rice_type !== existing.rice_type) {
    return true;
  }
  if (
    update.rice_length_id !== undefined &&
    !nullableEqual(update.rice_length_id, existing.rice_length_id)
  ) {
    return true;
  }
  return false;
}
