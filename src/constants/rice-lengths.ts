/**
 * Rice length / cut grades (e.g. Dubar, Tibar, Wand) for dropdowns and validation.
 * Values are stable API identifiers; labels are for display.
 */
export const RICE_LENGTH_OPTIONS = [
  { value: 'dubar', label: 'Dubar (Double)' },
  { value: 'tibar', label: 'Tibar' },
  { value: 'wand', label: 'Wand' },
] as const;

export type RiceLength = (typeof RICE_LENGTH_OPTIONS)[number]['value'];
