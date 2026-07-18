import {
  SAUDA_PARAMETER_FIELD_NAMES,
  SaudaParametersInput,
  SaudaParametersSnapshot,
} from '../constants/sauda-parameters';
import type { Parameter } from '../models/parameter.model';

export function normalizeSaudaParametersInput(
  input: SaudaParametersInput | null | undefined
): Record<(typeof SAUDA_PARAMETER_FIELD_NAMES)[number], string | null> {
  const out = {} as Record<(typeof SAUDA_PARAMETER_FIELD_NAMES)[number], string | null>;
  for (const key of SAUDA_PARAMETER_FIELD_NAMES) {
    const raw = input?.[key];
    out[key] = raw === undefined || raw === '' ? null : raw;
  }
  return out;
}

export function saudaParametersSnapshotFromRow(row: Parameter): SaudaParametersSnapshot {
  const snapshot = { id: row.id } as SaudaParametersSnapshot;
  for (const key of SAUDA_PARAMETER_FIELD_NAMES) {
    snapshot[key] = row[key];
  }
  return snapshot;
}

export function saudaParametersHasAnyValue(
  values: Record<(typeof SAUDA_PARAMETER_FIELD_NAMES)[number], string | null>
): boolean {
  return SAUDA_PARAMETER_FIELD_NAMES.some((key) => values[key] != null);
}
