export interface RefreshToken {
  refresh_token_id: string;
  phone: string;
  token_hash: string;
  expires_at: Date;
  revoked: boolean;
  revoked_at: Date | null;
  revoked_reason: string | null;
  device_info: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  last_used_at: Date | null;
  created_at: Date;
}

export interface CreateRefreshTokenData {
  phone: string;
  token_hash: string;
  expires_at: Date;
  ip?: string;
  user_agent?: string;
  device_info?: Record<string, unknown>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}
