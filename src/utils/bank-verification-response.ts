import type { SuccessResponseExtras } from './response';
import type { BankSnapshotVerificationResult } from './bank-verification-from-snapshot';

export const BANK_VERIFY_EXACT_SUCCESS_MESSAGE = 'Bank details verified successfully.';

export function isBankVerificationSuccess(result: BankSnapshotVerificationResult): boolean {
  return result.status === 'verified';
}

export function bankVerificationSuccessExtras(
  result: BankSnapshotVerificationResult
): SuccessResponseExtras {
  if (
    result.verification_method === 'llm_similarity' &&
    result.name_similarity_score !== undefined
  ) {
    return {
      verification_message: `Verified via name similarity: ${result.name_similarity_score}%`,
      bank_name_similarity_score: result.name_similarity_score,
      bank_verification_method: 'llm_similarity',
    };
  }

  return {
    verification_message: BANK_VERIFY_EXACT_SUCCESS_MESSAGE,
    bank_verification_method: 'exact',
  };
}
