import type { EntityKycVerificationDetails } from '../models/kyc-verification.model';
import { appConfig } from '../config/app.config';
import { scoreAccountHolderNameSimilarity } from '../services/name-similarity.service';
import { ValidationError } from './errors';
import { logger } from './logger';
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

async function tryLlmNameSimilarityVerification(
  result: BankSnapshotVerificationResult
): Promise<BankSnapshotVerificationResult> {
  if (
    result.status !== 'name_mismatch' ||
    !result.bank_account_holder_name ||
    !result.entered_account_holder_name
  ) {
    return result;
  }

  const score = await scoreAccountHolderNameSimilarity(
    result.bank_account_holder_name,
    result.entered_account_holder_name
  );

  if (score === null) {
    return result;
  }

  const threshold = appConfig.openai.bankNameSimilarityThreshold;
  if (score >= threshold) {
    logger.info('Bank account holder name verified via LLM similarity', {
      score,
      threshold,
      bank: result.bank_account_holder_name,
      entered: result.entered_account_holder_name,
    });
    return {
      status: 'verified',
      verification_method: 'llm_similarity',
      name_similarity_score: score,
      bank_account_holder_name: result.bank_account_holder_name,
      entered_account_holder_name: result.entered_account_holder_name,
    };
  }

  logger.info('Bank account holder name below LLM similarity threshold', {
    score,
    threshold,
    bank: result.bank_account_holder_name,
    entered: result.entered_account_holder_name,
  });

  return {
    ...result,
    message: `${result.message ?? 'Account holder name does not match bank records.'} Name similarity score: ${score} (minimum ${threshold}).`,
    name_similarity_score: score,
  };
}

/**
 * Compare bank_details to a prior Surepass snapshot; mark verified or flag mismatch.
 * On name mismatch, optionally verifies via OpenAI name similarity when score >= threshold.
 * Never calls Surepass.
 */
export async function applyBankVerificationFromSnapshot(
  options: ApplyBankVerificationFromSnapshotOptions
): Promise<BankSnapshotVerificationResult> {
  const { bankDetails, kycVerificationDetails, userId, markVerified, setVerificationError } =
    options;

  let result = compareBankDetailsWithKycSnapshot(bankDetails, kycVerificationDetails);

  if (result.status === 'missing_snapshot') {
    throw new ValidationError(result.message ?? 'Bank verification snapshot is required');
  }

  if (result.status === 'name_mismatch') {
    result = await tryLlmNameSimilarityVerification(result);
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
