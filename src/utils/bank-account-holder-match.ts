import { BadRequestError } from './errors';

/**
 * Strict match only: trim, collapse internal whitespace, uppercase.
 * No fuzzy matching — "MILL" and "MILLS" are different.
 */
export function normalizeAccountHolderNameForComparison(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * After Surepass confirms the account, ensures the name stored on the vendor matches
 * the name returned by the bank (strict equality after normalization).
 */
export function assertEnteredAccountHolderMatchesBankRecord(
  entered: string | null | undefined,
  bankRecordName: string | null | undefined
): void {
  const bankTrimmed = (bankRecordName ?? '').trim();
  if (!bankTrimmed) {
    throw new BadRequestError(
      'Bank verification did not return an account holder name to compare against.'
    );
  }
  const enteredTrimmed = (entered ?? '').trim();
  if (!enteredTrimmed) {
    throw new BadRequestError(
      'Account holder name is required and must match bank records for verification.'
    );
  }
  if (
    normalizeAccountHolderNameForComparison(enteredTrimmed) !==
    normalizeAccountHolderNameForComparison(bankTrimmed)
  ) {
    throw new BadRequestError(
      `Account holder name does not match bank records. Bank: "${bankTrimmed}". Entered: "${enteredTrimmed}".`
    );
  }
}
