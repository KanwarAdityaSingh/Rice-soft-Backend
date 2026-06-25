import type { EntityKycVerificationDetails } from '../models/kyc-verification.model';
import type { BankVerificationResult } from '../services/gst-lookup.service';
import {
  buildAccountHolderMismatchMessage,
  normalizeAccountHolderNameForComparison,
} from './bank-account-holder-match';

export type BankSnapshotVerificationStatus =
  | 'verified'
  | 'name_mismatch'
  | 'account_mismatch'
  | 'ifsc_mismatch'
  | 'missing_snapshot';

export interface BankSnapshotVerificationResult {
  status: BankSnapshotVerificationStatus;
  message?: string;
  bank_account_holder_name?: string;
  entered_account_holder_name?: string;
}

function accountDigits(value: string | undefined | null): string {
  return (value ?? '').replace(/\D/g, '');
}

function normalizeIfsc(value: string | undefined | null): string {
  return (value ?? '').trim().toUpperCase();
}

/** Holder name from a prior GET /kyc/bank/verify snapshot (mapped or raw). */
export function extractBankAccountHolderFromKyc(
  kyc: EntityKycVerificationDetails | undefined | null
): string | null {
  const bank = kyc?.bank;
  if (!bank || typeof bank !== 'object') {
    return null;
  }

  const mapped = bank.mapped as BankVerificationResult | undefined;
  if (mapped?.account_holder_name?.trim()) {
    return mapped.account_holder_name.trim();
  }

  const raw = bank.raw as { data?: { full_name?: string } } | undefined;
  if (raw?.data?.full_name?.trim()) {
    return raw.data.full_name.trim();
  }

  return null;
}

function extractBankMappedFromKyc(
  kyc: EntityKycVerificationDetails | undefined | null
): BankVerificationResult | null {
  const mapped = kyc?.bank?.mapped;
  if (!mapped || typeof mapped !== 'object') {
    return null;
  }
  return mapped as BankVerificationResult;
}

/**
 * Compare stored bank_details against a Surepass bank snapshot from a prior lookup.
 * Does not call Surepass — frontend must call GET /kyc/bank/verify separately first.
 */
export function compareBankDetailsWithKycSnapshot(
  bankDetails: {
    account_holder_name?: string | null;
    account_number?: string | null;
    ifsc_code?: string | null;
  },
  kyc: EntityKycVerificationDetails | undefined | null
): BankSnapshotVerificationResult {
  const bankHolderName = extractBankAccountHolderFromKyc(kyc);
  if (!bankHolderName) {
    return {
      status: 'missing_snapshot',
      message:
        'Bank verification snapshot is required. Call GET /api/v1/kyc/bank/verify first and include kyc_verification_details.bank on create/update.',
    };
  }

  const mapped = extractBankMappedFromKyc(kyc);
  if (mapped?.account_number) {
    const enteredAccount = accountDigits(bankDetails.account_number);
    const snapshotAccount = accountDigits(mapped.account_number);
    if (enteredAccount && snapshotAccount && enteredAccount !== snapshotAccount) {
      return {
        status: 'account_mismatch',
        message: 'Account number does not match the bank verification snapshot.',
      };
    }
  }

  if (mapped?.ifsc_code) {
    const enteredIfsc = normalizeIfsc(bankDetails.ifsc_code);
    const snapshotIfsc = normalizeIfsc(mapped.ifsc_code);
    if (enteredIfsc && snapshotIfsc && enteredIfsc !== snapshotIfsc) {
      return {
        status: 'ifsc_mismatch',
        message: 'IFSC does not match the bank verification snapshot.',
      };
    }
  }

  const enteredName = (bankDetails.account_holder_name ?? '').trim();
  if (!enteredName) {
    return {
      status: 'name_mismatch',
      message: 'Account holder name is required for bank verification.',
      bank_account_holder_name: bankHolderName,
      entered_account_holder_name: enteredName,
    };
  }

  if (
    normalizeAccountHolderNameForComparison(enteredName) !==
    normalizeAccountHolderNameForComparison(bankHolderName)
  ) {
    return {
      status: 'name_mismatch',
      message: buildAccountHolderMismatchMessage(bankHolderName, enteredName),
      bank_account_holder_name: bankHolderName,
      entered_account_holder_name: enteredName,
    };
  }

  return { status: 'verified' };
}
