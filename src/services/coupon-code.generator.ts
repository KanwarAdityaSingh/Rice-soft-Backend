import { randomBytes } from 'crypto';
import {
  COUPON_CODE_CHARSET,
  COUPON_CODE_GENERATION_CHUNK_SIZE,
  COUPON_CODE_LENGTH,
} from '../constants/coupon-status';

export function generateCouponCode(): string {
  const bytes = randomBytes(COUPON_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < COUPON_CODE_LENGTH; i++) {
    code += COUPON_CODE_CHARSET[bytes[i] % COUPON_CODE_CHARSET.length];
  }
  return code;
}

export function generateCouponCodeChunk(size: number): string[] {
  const codes = new Set<string>();
  while (codes.size < size) {
    codes.add(generateCouponCode());
  }
  return Array.from(codes);
}

export { COUPON_CODE_GENERATION_CHUNK_SIZE };
