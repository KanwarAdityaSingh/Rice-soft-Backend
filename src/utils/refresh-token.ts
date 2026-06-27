import { createHash, randomBytes } from 'crypto';
import { appConfig } from '../config/app.config';

const REFRESH_SECRET_BYTES = 32;

/** Opaque token: `{sessionId}.{randomSecret}` — sessionId enables lookup without exposing userId. */
export function generateRefreshToken(sessionId: string): string {
  const secret = randomBytes(REFRESH_SECRET_BYTES).toString('hex');
  return `${sessionId}.${secret}`;
}

export function parseSessionIdFromRefreshToken(token: string): string | null {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0 || dotIndex >= token.length - 1) {
    return null;
  }
  const sessionId = token.slice(0, dotIndex);
  const secret = token.slice(dotIndex + 1);
  // UUID session id + 64-char hex secret
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[0-9a-f]{64}$/i.test(secret)) {
    return null;
  }
  return sessionId;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Parse durations like 7d, 24h, 30m into milliseconds. */
export function parseDurationMs(value: string): number {
  const match = value.trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new Error(`Invalid duration format: ${value}`);
  }
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * multipliers[unit];
}

export function computeRefreshExpiresAt(): Date {
  const ms = parseDurationMs(appConfig.jwt.refreshExpiresIn);
  return new Date(Date.now() + ms);
}

export function refreshCookieMaxAgeSec(): number {
  return Math.floor(parseDurationMs(appConfig.jwt.refreshExpiresIn) / 1000);
}
