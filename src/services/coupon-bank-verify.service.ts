import { gstLookupService } from './gst-lookup.service';
import type { EntityKycVerificationDetails } from '../models/kyc-verification.model';
import type { SurepassApiEnvelope } from '../models/kyc-verification.model';
import type { BankVerificationResult } from './gst-lookup.service';
import { ValidationError } from '../utils/errors';
import {
  compareBankDetailsWithKycSnapshot,
  type BankSnapshotVerificationResult,
} from '../utils/bank-verification-from-snapshot';

export interface CouponBankVerifyResponse {
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string | null;
  kyc_verification_details: EntityKycVerificationDetails;
}

function buildKycSnapshotFromEnvelope(
  envelope: SurepassApiEnvelope<BankVerificationResult>
): EntityKycVerificationDetails {
  return {
    bank: {
      provider: 'surepass',
      verified_at: new Date().toISOString(),
      raw: envelope.raw,
      mapped: envelope.mapped,
    },
  };
}

export class CouponBankVerifyService {
  async verifyBankAccount(
    accountNumber: string,
    ifscCode: string
  ): Promise<CouponBankVerifyResponse> {
    const envelope = await gstLookupService.verifyBankAccount(accountNumber, ifscCode, {
      includeIfscDetails: true,
    });

    const kyc = buildKycSnapshotFromEnvelope(envelope);

    return {
      accountHolderName: envelope.mapped.account_holder_name,
      accountNumber: envelope.mapped.account_number,
      ifscCode: envelope.mapped.ifsc_code,
      bankName: envelope.mapped.bank_name ?? null,
      kyc_verification_details: kyc,
    };
  }

  /**
   * Compare redeem bank fields to a prior Surepass snapshot. Does not call Surepass.
   * Exact match only (account, IFSC, holder name). Throws ValidationError on failure.
   */
  assertBankVerifiedFromSnapshot(
    bankDetails: {
      account_holder_name?: string | null;
      account_number?: string | null;
      ifsc?: string | null;
    },
    kyc: EntityKycVerificationDetails | undefined | null
  ): BankSnapshotVerificationResult {
    const result = compareBankDetailsWithKycSnapshot(
      {
        account_holder_name: bankDetails.account_holder_name,
        account_number: bankDetails.account_number,
        ifsc_code: bankDetails.ifsc,
      },
      kyc
    );

    if (result.status === 'missing_snapshot') {
      throw new ValidationError(
        result.message ??
          'Bank verification snapshot is required. Call GET /api/v1/coupons/public/verifyBankAccount first.'
      );
    }

    if (result.status !== 'verified') {
      throw new ValidationError(result.message ?? 'Bank verification failed');
    }

    return result;
  }
}

export const couponBankVerifyService = new CouponBankVerifyService();
