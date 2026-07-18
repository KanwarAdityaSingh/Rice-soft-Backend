/** Quality specs allowed on purchase sauda (subset of full lab parameters). */
export const SAUDA_PARAMETER_FIELD_NAMES = [
  'whiteness',
  'average_grain_length',
] as const;

export type SaudaParameterFieldName = (typeof SAUDA_PARAMETER_FIELD_NAMES)[number];

export type SaudaParametersInput = Partial<
  Record<SaudaParameterFieldName, string | null | undefined>
>;

export interface SaudaParametersSnapshot {
  id: string;
  whiteness: string | null;
  average_grain_length: string | null;
}
