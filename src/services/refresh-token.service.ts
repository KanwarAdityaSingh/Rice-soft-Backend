import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config/app.config';
import { RefreshTokenDAO } from '../dao/refresh-token.dao';
import { TokenPair } from '../models/refresh-token.model';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

export class RefreshTokenService {
  private readonly ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days

  constructor(private refreshTokenDAO = new RefreshTokenDAO()) {}

  /**
   * Generate cryptographically secure refresh token
   */
  private generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('base64url'); // 43 chars, URL-safe
  }

  /**
   * Hash refresh token for storage (SHA-256)
   * Never store plaintext tokens in database
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate JWT access token
   */
  private generateAccessToken(phone: string): { token: string; expiresAt: Date } {
    const token = jwt.sign(
      {
        phone,
        type: 'public',
      },
      appConfig.jwt.secret,
      { expiresIn: this.ACCESS_TOKEN_EXPIRY }
    );

    // Calculate expiry (15 minutes from now)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    return { token, expiresAt };
  }

  /**
   * Issue token pair after OTP verification
   */
  async issueTokenPair(
    phone: string,
    context?: { ip?: string; user_agent?: string; device_info?: Record<string, unknown> }
  ): Promise<TokenPair> {
    // Generate access token (15 min)
    const { token: accessToken, expiresAt: accessExpiresAt } = this.generateAccessToken(phone);

    // Generate refresh token (7 days)
    const refreshToken = this.generateRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // Hash refresh token before storing
    const tokenHash = this.hashToken(refreshToken);

    // Store refresh token in database
    await this.refreshTokenDAO.create({
      phone,
      token_hash: tokenHash,
      expires_at: refreshExpiresAt,
      ip: context?.ip,
      user_agent: context?.user_agent,
      device_info: context?.device_info,
    });

    logger.info('Token pair issued', { phone, accessExpiresAt, refreshExpiresAt });

    return {
      accessToken,
      refreshToken, // Send plaintext to client (only time it's visible)
      accessTokenExpiresAt: accessExpiresAt.toISOString(),
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  /**
   * Refresh access token using refresh token
   * Implements token rotation: old refresh token is revoked, new one issued
   */
  async refreshAccessToken(
    refreshToken: string,
    context?: { ip?: string; user_agent?: string }
  ): Promise<TokenPair> {
    // Hash the incoming refresh token
    const tokenHash = this.hashToken(refreshToken);

    // Find refresh token in database
    const storedToken = await this.refreshTokenDAO.findByTokenHash(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Update last used timestamp
    await this.refreshTokenDAO.updateLastUsed(storedToken.refresh_token_id);

    // Revoke old refresh token (rotation for security)
    await this.refreshTokenDAO.revoke(storedToken.refresh_token_id, 'rotated');

    // Issue new token pair
    const newTokenPair = await this.issueTokenPair(storedToken.phone, {
      ip: context?.ip,
      user_agent: context?.user_agent,
    });

    logger.info('Access token refreshed', { phone: storedToken.phone });

    return newTokenPair;
  }

  /**
   * Revoke a specific refresh token (logout)
   */
  async revokeToken(refreshToken: string, reason: string = 'user_logout'): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshTokenDAO.revokeByTokenHash(tokenHash, reason);
    logger.info('Refresh token revoked', { reason });
  }

  /**
   * Revoke all refresh tokens for a phone (logout from all devices)
   */
  async revokeAllTokens(phone: string, reason: string = 'logout_all'): Promise<number> {
    const count = await this.refreshTokenDAO.revokeAllByPhone(phone, reason);
    logger.info('All refresh tokens revoked', { phone, count, reason });
    return count;
  }

  /**
   * Get active sessions for a phone
   */
  async getActiveSessions(phone: string) {
    const tokens = await this.refreshTokenDAO.findActiveByPhone(phone);
    return tokens.map((t) => ({
      sessionId: t.refresh_token_id,
      createdAt: t.created_at,
      lastUsedAt: t.last_used_at,
      expiresAt: t.expires_at,
      ip: t.ip,
      userAgent: t.user_agent,
      deviceInfo: t.device_info,
    }));
  }

  /**
   * Cleanup expired tokens (cron job)
   */
  async cleanupExpired(): Promise<number> {
    const count = await this.refreshTokenDAO.cleanupExpired();
    logger.info('Expired refresh tokens cleaned up', { count });
    return count;
  }
}

export const refreshTokenService = new RefreshTokenService();
