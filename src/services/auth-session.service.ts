import { randomUUID } from 'crypto';
import { userDAO } from '../dao/user.dao';
import { appConfig } from '../config/app.config';
import { JWTService } from '../utils/jwt';
import { RefreshAuthError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  computeRefreshExpiresAt,
  generateRefreshToken,
  hashRefreshToken,
  parseSessionIdFromRefreshToken,
} from '../utils/refresh-token';
import { User } from '../models/user.model';

export interface SessionCredentials {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
  sessionId: string;
}

function refreshGraceUntil(): Date {
  return new Date(Date.now() + appConfig.auth.refreshGracePeriodSec * 1000);
}

function isWithinGrace(user: User): boolean {
  if (!user.previous_refresh_token_hash || !user.previous_refresh_token_valid_until) {
    return false;
  }
  return new Date() <= user.previous_refresh_token_valid_until;
}

export class AuthSessionService {
  async createSession(userId: string, username: string): Promise<SessionCredentials> {
    const sessionId = randomUUID();
    const refreshToken = generateRefreshToken(sessionId);
    const refreshTokenExpiresAt = computeRefreshExpiresAt();

    await userDAO.updateSession(userId, {
      activeSessionId: sessionId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      refreshTokenExpiresAt,
      previousRefreshTokenHash: null,
      previousRefreshTokenValidUntil: null,
    });

    const accessToken = JWTService.generateToken({
      userId,
      username,
      sessionId,
    });

    logger.info('Session created', { userId, sessionId });

    return {
      accessToken,
      refreshToken,
      sessionId,
      accessExpiresIn: appConfig.jwt.expiresIn,
      refreshExpiresIn: appConfig.jwt.refreshExpiresIn,
    };
  }

  private async issueRotatedTokens(
    user: User,
    sessionId: string,
    currentRefreshHash: string
  ): Promise<SessionCredentials & { userId: string }> {
    const newRefreshToken = generateRefreshToken(sessionId);
    const refreshTokenExpiresAt = computeRefreshExpiresAt();

    await userDAO.updateSession(user.id, {
      activeSessionId: sessionId,
      refreshTokenHash: hashRefreshToken(newRefreshToken),
      refreshTokenExpiresAt,
      previousRefreshTokenHash: currentRefreshHash,
      previousRefreshTokenValidUntil: refreshGraceUntil(),
    });

    const accessToken = JWTService.generateToken({
      userId: user.id,
      username: user.username,
      sessionId,
    });

    logger.info('Refresh token rotated', { userId: user.id, sessionId });

    return {
      userId: user.id,
      accessToken,
      refreshToken: newRefreshToken,
      sessionId,
      accessExpiresIn: appConfig.jwt.expiresIn,
      refreshExpiresIn: appConfig.jwt.refreshExpiresIn,
    };
  }

  async rotateRefreshToken(refreshToken: string): Promise<SessionCredentials & { userId: string }> {
    const sessionId = parseSessionIdFromRefreshToken(refreshToken);
    if (!sessionId) {
      throw new RefreshAuthError('Invalid refresh token', false);
    }

    const user = await userDAO.findByActiveSessionId(sessionId);
    if (!user) {
      throw new RefreshAuthError('Invalid refresh token', false);
    }

    if (!user.is_active) {
      await userDAO.clearSession(user.id);
      throw new RefreshAuthError('Account is inactive', true);
    }

    if (!user.refresh_token_hash || !user.refresh_token_expires_at) {
      throw new RefreshAuthError('Session expired. Please log in again.', false);
    }

    if (new Date() > user.refresh_token_expires_at) {
      await userDAO.clearSession(user.id);
      throw new RefreshAuthError('Refresh token expired', true);
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const currentHash = user.refresh_token_hash;
    const previousHash = user.previous_refresh_token_hash;

    if (tokenHash === currentHash) {
      return this.issueRotatedTokens(user, sessionId, currentHash);
    }

    if (previousHash && tokenHash === previousHash) {
      if (isWithinGrace(user)) {
        return this.issueRotatedTokens(user, sessionId, currentHash);
      }

      await userDAO.clearSession(user.id);
      logger.warn('Refresh token reuse detected — session revoked', { userId: user.id, sessionId });
      throw new RefreshAuthError('Session revoked. Please log in again.', true);
    }

    // Unknown token — reject without revoking (avoids logout on bad/missing cookie retries)
    logger.warn('Refresh token rejected', { userId: user.id, sessionId });
    throw new RefreshAuthError('Invalid refresh token', false);
  }

  async revokeSession(userId: string): Promise<void> {
    await userDAO.clearSession(userId);
    logger.info('Session revoked', { userId });
  }
}

export const authSessionService = new AuthSessionService();
