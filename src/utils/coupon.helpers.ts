import { appConfig } from '../config/app.config';

/** Normalize Indian phone to 10-digit local form */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 10) {
    return digits;
  }
  throw new Error('Invalid phone number');
}

/**
 * Resolve public redeem page base URL (no query string).
 * Prefer explicit batch override; otherwise COUPON_REDEEM_BASE_URL / app default.
 * Trailing slash is stripped so callers can append `?code=…` cleanly.
 */
export function resolveRedeemBaseUrl(override?: string | null): string {
  const fromOverride = (override ?? '').trim();
  if (fromOverride) {
    return fromOverride.replace(/\/+$/, '');
  }
  return (appConfig.coupons.redeemBaseUrl || '').trim().replace(/\/+$/, '');
}

/** Build `{base}?code={code}` for QR / CSV export. Empty string if no base configured. */
export function buildRedeemUrl(code: string, baseUrlOverride?: string | null): string {
  const base = resolveRedeemBaseUrl(baseUrlOverride);
  if (!base) return '';
  return `${base}?code=${encodeURIComponent(code)}`;
}

/** Normalize coupon code to uppercase trimmed */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidCouponCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}

export function generatePublicRef(): string {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `RED-${year}-${suffix}`;
}

export interface BankDetailsPayload {
  account_holder_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc: string | null;
}

export interface PayoutDetailsPayload {
  upi_vpa: string | null;
  bank: BankDetailsPayload | null;
}

function trimOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Structured bank fields for admin UI (avoid concatenating into one string). */
export function buildBankDetails(fields: {
  account_holder_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc?: string | null;
}): BankDetailsPayload | null {
  const account_holder_name = trimOrNull(fields.account_holder_name);
  const bank_name = trimOrNull(fields.bank_name);
  const account_number = trimOrNull(fields.account_number);
  const ifsc = trimOrNull(fields.ifsc);

  if (!account_holder_name && !bank_name && !account_number && !ifsc) {
    return null;
  }

  return { account_holder_name, bank_name, account_number, ifsc };
}

/** UPI + bank snapshot for a redemption row. */
export function buildPayoutDetails(fields: {
  upi_vpa?: string | null;
  account_holder_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc?: string | null;
}): PayoutDetailsPayload | null {
  const upi_vpa = trimOrNull(fields.upi_vpa);
  const bank = buildBankDetails(fields);
  if (!upi_vpa && !bank) {
    return null;
  }
  return { upi_vpa, bank };
}
