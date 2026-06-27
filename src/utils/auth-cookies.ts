import { CookieOptions, Response } from 'express';
import { appConfig, isProduction } from '../config/app.config';
import { refreshCookieMaxAgeSec } from './refresh-token';

function refreshCookieOptions(): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: appConfig.auth.refreshCookieSameSite,
    path: appConfig.auth.refreshCookiePath,
  };

  // Session cookie: omit maxAge so the browser clears it on close.
  if (!appConfig.auth.refreshCookieSession) {
    options.maxAge = refreshCookieMaxAgeSec() * 1000;
  }

  return options;
}

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(appConfig.auth.refreshCookieName, refreshToken, refreshCookieOptions());
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(appConfig.auth.refreshCookieName, refreshCookieOptions());
}
