import { appConfig } from '../config/app.config';
import { BadRequestError, InternalServerError } from '../utils/errors';
import { logger } from '../utils/logger';

interface MastersIndiaTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface MastersIndiaResultsEnvelope<T = unknown> {
  results?: {
    code?: number;
    status?: string;
    message?: T;
  };
  errorMessage?: string;
}

export class MastersIndiaApiService {
  private tokenCache: { token: string; expiresAt: number } | null = null;

  async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    const config = appConfig.apis.mastersIndia;
    if (!config.username || !config.password || !config.clientId || !config.clientSecret) {
      throw new InternalServerError('MastersIndia API credentials not configured');
    }

    const response = await fetch(config.authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: config.username,
        password: config.password,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'password',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('MastersIndia auth failed', { status: response.status, error: errorText });
      throw new InternalServerError('Failed to authenticate with MastersIndia API');
    }

    const tokenData = (await response.json()) as MastersIndiaTokenResponse;
    if (!tokenData.access_token) {
      throw new InternalServerError('Invalid token response from MastersIndia API');
    }

    const ttlMs = (tokenData.expires_in ?? 3600) * 1000;
    this.tokenCache = {
      token: tokenData.access_token,
      expiresAt: Date.now() + ttlMs - 60_000,
    };
    return tokenData.access_token;
  }

  async calculateDistanceKm(params: {
    fromPincode: string;
    toPincode: string;
    userGstin: string;
  }): Promise<number> {
    const accessToken = await this.getAccessToken();
    const config = appConfig.apis.mastersIndia;

    const response = await fetch(config.distanceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        fromPincode: params.fromPincode,
        toPincode: params.toPincode,
        gstin: params.userGstin,
        action: 'GETDISTANCE',
      }),
    });

    const body = (await response.json()) as MastersIndiaResultsEnvelope<{ distance?: number }>;
    const results = body.results;
    if (results?.code === 200 && results.status === 'Success' && results.message?.distance != null) {
      return Number(results.message.distance);
    }

    const message =
      typeof results?.message === 'string'
        ? results.message
        : JSON.stringify(results?.message ?? body);
    logger.error('MastersIndia distance API failed', { body });
    throw new BadRequestError(`Failed to calculate transportation distance: ${message}`);
  }

  async generateEInvoice(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const config = appConfig.apis.mastersIndia;
    const accessToken = await this.getAccessToken();
    const requestBody = { ...payload, access_token: accessToken };

    const response = await fetch(config.eInvoiceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const body = (await response.json()) as MastersIndiaResultsEnvelope<Record<string, unknown>>;
    return this.assertSuccess(body, 'E-Invoice generation');
  }

  async generateEWayBill(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const config = appConfig.apis.mastersIndia;
    const accessToken = await this.getAccessToken();
    const requestBody = { ...payload, access_token: accessToken };

    const response = await fetch(config.eWayBillUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const body = (await response.json()) as MastersIndiaResultsEnvelope<Record<string, unknown>>;
    return this.assertSuccess(body, 'E-Way Bill generation');
  }

  private assertSuccess(
    body: MastersIndiaResultsEnvelope<Record<string, unknown>>,
    label: string
  ): Record<string, unknown> {
    const results = body.results;
    if (results?.code === 200 && results.status === 'Success' && results.message) {
      return results.message;
    }

    logger.error(`MastersIndia ${label} failed`, { body });
    const detail =
      body.errorMessage ||
      (typeof results?.message === 'string' ? results.message : JSON.stringify(results?.message ?? body));
    throw new BadRequestError(`${label} failed: ${detail}`);
  }
}

export const mastersIndiaApiService = new MastersIndiaApiService();
