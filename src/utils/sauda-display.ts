/**
 * Compact sauda label for UI, emails, and WhatsApp (first 4 hex chars of UUID, uppercase).
 */
export function formatSaudaDisplayId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 4).toUpperCase();
}
