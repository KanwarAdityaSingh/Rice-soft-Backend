import { ValidationError } from './errors';

/** 10-digit Indian mobile, or null if the input is not a usable number. */
export function normalizeIndianMobile(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  if (digits.length === 10) {
    return digits;
  }
  return null;
}

export function requireIndianMobile(value: string | null | undefined): string {
  const normalized = normalizeIndianMobile(value);
  if (!normalized) {
    throw new ValidationError(
      'Invalid mobile number. Expected a 10-digit Indian mobile number.'
    );
  }
  return normalized;
}

/** Surepass HLR expects 91 + 10-digit local number. */
export function indianMobileWithCountryCode(value: string | null | undefined): string {
  return `91${requireIndianMobile(value)}`;
}
