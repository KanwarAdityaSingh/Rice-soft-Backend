export interface PublicOtpVerification {
  otp_verification_id: string;
  phone: string;
  otp: string;
  purpose: string;
  verified: boolean;
  expires_at: Date;
  verified_at: Date | null;
  attempts: number;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface SendOtpRequest {
  phone: string;
  purpose?: string;
}

export interface VerifyOtpRequest {
  phone: string;
  otp: string;
  purpose?: string;
}

export interface PublicAuthToken {
  token: string;
  phone: string;
  expiresAt: string;
}
