import { BadRequestError } from './errors';

/**
 * Strict match after normalizing formatting differences common in bank records:
 * trim, uppercase, treat periods as spaces (B.R ↔ B. R.), collapse whitespace.
 * No fuzzy matching on substantive words — "MILL" and "MILLS" remain different.
 */
export function normalizeAccountHolderNameForComparison(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    throw new BadRequestError(buildAccountHolderMismatchMessage(bankTrimmed, enteredTrimmed));
  }
}

export function buildAccountHolderMismatchMessage(
  bankRecordName: string,
  enteredName: string
): string {
  return `Account holder name does not match bank records. Bank: "${bankRecordName}". Entered: "${enteredName}".`;
}
