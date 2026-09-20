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
    nic_code?: string;
  };
  errorMessage?: string;
}

export class MastersIndiaApiService {
  private tokenCache: { token: string; expiresAt: number } | null = null;

  clearTokenCache(): void {
    this.tokenCache = null;
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
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
    return this.fetchDistanceKm(params, false);
  }

  private async fetchDistanceKm(
    params: {
      fromPincode: string;
      toPincode: string;
      userGstin: string;
    },
    isRetry: boolean
  ): Promise<number> {
    const accessToken = await this.getAccessToken(isRetry);
    const config = appConfig.apis.mastersIndia;

    // MastersIndia: GET /distance?access_token=&fromPincode=&toPincode=
    const url = new URL(config.distanceUrl);
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('fromPincode', params.fromPincode);
    url.searchParams.set('toPincode', params.toPincode);
    if (params.userGstin) {
      url.searchParams.set('gstin', params.userGstin);
    }

    const response = await fetch(url.toString(), { method: 'GET' });
    const body = await this.parseJsonResponse<
      MastersIndiaResultsEnvelope<{ distance?: number }> & {
        results?: { distance?: number; code?: number; status?: string; message?: unknown };
      }
    >(response, 'distance');

    const results = body.results;
    let distance = NaN;
    if (results?.distance != null) {
      distance = Number(results.distance);
    } else if (
      results?.message &&
      typeof results.message === 'object' &&
      results.message !== null &&
      'distance' in results.message
    ) {
      distance = Number((results.message as { distance?: number }).distance);
    }

    if (results?.code === 200 && results.status === 'Success' && Number.isFinite(distance)) {
      return distance;
    }

    const message =
      typeof results?.message === 'string'
        ? results.message
        : JSON.stringify(results?.message ?? body);

    // Stale cached token — refresh once and retry
    if (!isRetry && /access token/i.test(message) && /invalid/i.test(message)) {
      logger.warn('MastersIndia distance rejected access token; refreshing and retrying', {
        fromPincode: params.fromPincode,
        toPincode: params.toPincode,
      });
      this.clearTokenCache();
      return this.fetchDistanceKm(params, true);
    }

    logger.error('MastersIndia distance API failed', {
      status: response.status,
      url: config.distanceUrl,
      fromPincode: params.fromPincode,
      toPincode: params.toPincode,
      body,
    });
    throw new BadRequestError(`Failed to calculate transportation distance: ${message}`);
  }

  /** Parse JSON safely — MastersIndia often returns HTML error pages on bad URLs. */
  private async parseJsonResponse<T>(response: Response, label: string): Promise<T> {
    const text = await response.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('<')) {
      logger.error(`MastersIndia ${label} returned non-JSON`, {
        status: response.status,
        contentType: response.headers.get('content-type'),
        bodyPreview: trimmed.slice(0, 200),
      });
      throw new BadRequestError(
        `MastersIndia ${label} API returned an invalid response (HTTP ${response.status}). Check MASTERS_INDIA_DISTANCE_URL.`
      );
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      logger.error(`MastersIndia ${label} JSON parse failed`, {
        status: response.status,
        bodyPreview: trimmed.slice(0, 200),
      });
      throw new BadRequestError(`MastersIndia ${label} API returned invalid JSON`);
    }
  }

  async generateEInvoice(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const config = appConfig.apis.mastersIndia;
    const body = await this.postJson(config.eInvoiceUrl, payload, 'E-Invoice generation');
    return this.assertSuccess(body, 'E-Invoice generation');
  }

  async generateEWayBill(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const config = appConfig.apis.mastersIndia;
    const body = await this.postJson(config.eWayBillUrl, payload, 'E-Way Bill generation');
    return this.assertSuccess(body, 'E-Way Bill generation');
  }

  /**
   * Cancel an e-way bill on NIC via MastersIndia.
   * Uses the same OAuth access_token as generate (Authorization header + body).
   * NIC 312 ("already cancelled / not generated by you") is returned as alreadyCancelled
   * so the caller can mark the local row cancelled when we originated the bill.
   */
  async cancelEWayBill(params: {
    userGstin: string;
    ewayBillNumber: string;
    reasonOfCancel: string;
    cancelRemark: string;
  }): Promise<{
    alreadyCancelled: boolean;
    message: Record<string, unknown>;
  }> {
    const numericEwb = Number(String(params.ewayBillNumber).replace(/\D/g, ''));
    const ewayBillNumber =
      Number.isSafeInteger(numericEwb) && numericEwb > 0 ? numericEwb : params.ewayBillNumber;

    const config = appConfig.apis.mastersIndia;
    const payload = {
      userGstin: params.userGstin,
      eway_bill_number: ewayBillNumber,
      reason_of_cancel: params.reasonOfCancel,
      cancel_remark: params.cancelRemark,
      data_source: 'erp',
    };

    const body = await this.postJson(config.eWayBillCancelUrl, payload, 'E-Way Bill cancel', {
      authorizationHeader: true,
    });
    const results = body.results;
    const nicCode = String(results?.nic_code ?? '').trim();
    const messageText =
      typeof results?.message === 'string'
        ? results.message
        : typeof results?.message === 'object' && results?.message && 'error' in results.message
          ? String((results.message as { error?: unknown }).error ?? '')
          : '';

    if (results?.code === 200 && results.status === 'Success') {
      const message =
        results.message && typeof results.message === 'object'
          ? results.message
          : { raw: results.message };
      return { alreadyCancelled: false, message };
    }

    // 312: already cancelled, or not generated by this GSTIN.
    // Other 204s (invalid parameters) must still fail.
    const alreadyCancelled =
      nicCode === '312' ||
      /already cancelled|either not generated by you or cancelled/i.test(messageText);

    if (alreadyCancelled) {
      logger.warn('MastersIndia e-way bill cancel treated as already cancelled', {
        ewayBillNumber: params.ewayBillNumber,
        nicCode: nicCode || results?.code,
        body,
      });
      return {
        alreadyCancelled: true,
        message: {
          ewayBillNo: params.ewayBillNumber,
          nic_code: nicCode || String(results?.code ?? ''),
          detail: messageText || JSON.stringify(results?.message ?? body),
        },
      };
    }

    logger.error('MastersIndia E-Way Bill cancel failed', { body });
    const detail =
      body.errorMessage ||
      (typeof results?.message === 'string'
        ? results.message
        : JSON.stringify(results?.message ?? body));
    throw new BadRequestError(`E-Way Bill cancel failed: ${detail}`);
  }

  /**
   * POST JSON with the same OAuth access_token used by generate.
   * Generate/e-invoice put the token in the body. Cancel also sends Authorization
   * because /api/v1/ewayBillCancel/ documents that header.
   */
  private async postJson(
    url: string,
    payload: Record<string, unknown>,
    label: string,
    options: { isRetry?: boolean; authorizationHeader?: boolean } = {}
  ): Promise<MastersIndiaResultsEnvelope<Record<string, unknown>>> {
    const isRetry = options.isRetry === true;
    const accessToken = await this.getAccessToken(isRetry);
    const requestBody = { ...payload, access_token: accessToken };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.authorizationHeader) {
      headers.Authorization = accessToken;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const body = await this.parseJsonResponse<MastersIndiaResultsEnvelope<Record<string, unknown>>>(
      response,
      label
    );

    const message =
      typeof body.results?.message === 'string'
        ? body.results.message
        : body.errorMessage || '';
    if (!isRetry && /access token/i.test(message) && /invalid/i.test(message)) {
      logger.warn(`MastersIndia ${label} rejected access token; refreshing and retrying`);
      this.clearTokenCache();
      return this.postJson(url, payload, label, { ...options, isRetry: true });
    }

    return body;
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
