import type { EntityKycVerificationDetails } from '../models/kyc-verification.model';
import { ValidationError } from './errors';
import {
  compareBankDetailsWithKycSnapshot,
  type BankSnapshotVerificationResult,
} from './bank-verification-from-snapshot';

export interface BankDetailsForSnapshotVerify {
  account_holder_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
}

export interface ApplyBankVerificationFromSnapshotOptions {
  bankDetails: BankDetailsForSnapshotVerify;
  kycVerificationDetails: EntityKycVerificationDetails | undefined | null;
  userId: string | undefined;
  markVerified: (userId: string) => Promise<void>;
  setVerificationError: (message: string | null) => Promise<void>;
}

/**
 * Compare bank_details to a prior Surepass snapshot; mark verified or flag mismatch.
 * Never calls Surepass.
 */
export async function applyBankVerificationFromSnapshot(
  options: ApplyBankVerificationFromSnapshotOptions
): Promise<BankSnapshotVerificationResult> {
  const { bankDetails, kycVerificationDetails, userId, markVerified, setVerificationError } =
    options;

  const result = compareBankDetailsWithKycSnapshot(bankDetails, kycVerificationDetails);

  if (result.status === 'missing_snapshot') {
    throw new ValidationError(result.message ?? 'Bank verification snapshot is required');
  }

  if (result.status === 'verified') {
    if (!userId) {
      throw new ValidationError('Bank verification requires an authenticated user');
    }
    await setVerificationError(null);
    await markVerified(userId);
    return result;
  }

  await setVerificationError(result.message ?? 'Bank verification failed');
  return result;
}
