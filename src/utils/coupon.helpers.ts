import { appConfig } from '../config/app.config';
import {
  COUPON_BATCH_SERIES_PAD,
  COUPON_SERIAL_SEQ_PAD,
} from '../constants/coupon-status';

const IST = 'Asia/Kolkata';
const MONTH_ABBR = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

export interface IndiaCalendarParts {
  /** YYYY-MM-DD in Asia/Kolkata */
  seriesDate: string;
  mon: string;
  yyyy: string;
  ddmm: string;
}

/** Calendar parts for coupon batch codes (IST). */
export function getIndiaCalendarParts(date: Date = new Date()): IndiaCalendarParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const monthIndex = parseInt(month, 10) - 1;

  return {
    seriesDate: `${year}-${month}-${day}`,
    mon: MONTH_ABBR[monthIndex] ?? 'JAN',
    yyyy: year,
    ddmm: `${day}${month}`,
  };
}

/** Format batch code: JUL-2026-2307-001 */
export function formatCouponBatchCode(
  parts: Pick<IndiaCalendarParts, 'mon' | 'yyyy' | 'ddmm'>,
  series: number
): string {
  return `${parts.mon}-${parts.yyyy}-${parts.ddmm}-${String(series).padStart(COUPON_BATCH_SERIES_PAD, '0')}`;
}

/** Format coupon serial: JUL-2026-2307-001-000001 */
export function formatCouponSerial(batchCode: string, sequence: number): string {
  return `${batchCode}-${String(sequence).padStart(COUPON_SERIAL_SEQ_PAD, '0')}`;
}

/**
 * Parse `{batch_code}-{NNNNNN}` → sequence number.
 * Returns null if serial does not belong to batchCode or seq is invalid.
 */
export function parseCouponSerialSequence(
  serial: string,
  batchCode: string
): number | null {
  const trimmed = serial.trim().toUpperCase();
  const prefix = `${batchCode.toUpperCase()}-`;
  if (!trimmed.startsWith(prefix)) return null;
  const seqPart = trimmed.slice(prefix.length);
  if (!/^\d+$/.test(seqPart)) return null;
  const seq = parseInt(seqPart, 10);
  if (!Number.isFinite(seq) || seq < 1) return null;
  return seq;
}

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
