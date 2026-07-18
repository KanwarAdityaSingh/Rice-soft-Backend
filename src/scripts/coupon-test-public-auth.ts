import { db } from '../database/connection';

export type PublicSession = {
  accessToken: string;
  refreshToken: string;
  phone: string;
};

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 10) {
    return digits;
  }
  throw new Error(`Invalid test phone: ${phone}`);
}

export function createPublicAuthHelper(baseUrl: string) {
  const cache = new Map<string, PublicSession>();

  async function fetchOtpFromDb(phone: string): Promise<string> {
    const result = await db.query<{ otp: string }>(
      `SELECT otp FROM public_otp_verifications
       WHERE phone = $1 AND purpose = 'login' AND verified = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );
    const otp = result.rows[0]?.otp;
    if (!otp) {
      throw new Error(
        `No OTP in DB for phone ${phone}. Ensure server is running and sendOtp succeeded.`
      );
    }
    return otp;
  }

  async function login(phone: string): Promise<PublicSession> {
    const normalized = normalizePhone(phone);
    const cached = cache.get(normalized);
    if (cached) {
      return cached;
    }

    let sendRes: Response | null = null;
    let sendJson: { success?: boolean; error?: string } = {};
    for (let attempt = 0; attempt < 12; attempt++) {
      sendRes = await fetch(`${baseUrl}/coupons/public/sendOtp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      });
      sendJson = (await sendRes.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (sendRes.status !== 429) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 7000));
    }
    if (!sendRes || !sendRes.ok || !sendJson.success) {
      throw new Error(`sendOtp failed (${sendRes?.status ?? 'unknown'}): ${JSON.stringify(sendJson)}`);
    }

    const otp = await fetchOtpFromDb(normalized);

    let verifyRes: Response | null = null;
    let verifyJson: {
      success?: boolean;
      error?: string;
      data?: { accessToken?: string; refreshToken?: string; phone?: string };
    } = {};
    for (let attempt = 0; attempt < 12; attempt++) {
      verifyRes = await fetch(`${baseUrl}/coupons/public/verifyOtp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, otp }),
      });
      verifyJson = (await verifyRes.json().catch(() => ({}))) as typeof verifyJson;
      if (verifyRes.status !== 429) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 7000));
    }
    if (!verifyRes || !verifyRes.ok || !verifyJson.success) {
      throw new Error(`verifyOtp failed (${verifyRes?.status ?? 'unknown'}): ${JSON.stringify(verifyJson)}`);
    }

    const data = verifyJson.data;
    if (!data?.accessToken || !data.refreshToken) {
      throw new Error('verifyOtp response missing tokens');
    }

    const session: PublicSession = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      phone: data.phone ?? normalized,
    };
    cache.set(normalized, session);
    return session;
  }

  async function getAccessToken(phone: string): Promise<string> {
    return (await login(phone)).accessToken;
  }

  function clearCache(): void {
    cache.clear();
  }

  return { login, getAccessToken, clearCache, normalizePhone };
}
