/**
 * Internal invoice (Bill of Supply) number formats by Indian FY + godown GST state.
 *
 * Before FY 2026-27:
 *   Delhi   → 2025-26/001
 *   Haryana → AAPL/2025-26/1
 *
 * From FY 2026-27 onward:
 *   Haryana → A/HR/B/26-27/1
 *   Delhi   → A/DL/B/26-27/1
 */

/** FY start year when the unified A/{ST}/B/{YY-YY}/{n} format begins */
export const INVOICE_NUMBER_NEW_FORMAT_FY_START = 2026;

export const INVOICE_DOCUMENT_TYPE_BOS = 'BOS';

/** GSTIN first-2-digit state code → short alpha used in invoice numbers */
export const GST_STATE_CODE_TO_INVOICE_ALPHA: Record<string, string> = {
  '06': 'HR', // Haryana
  '07': 'DL', // Delhi
};

export function shortFinancialYearLabel(financialYearLabel: string): string {
  // "2026-2027" → "26-27"
  const parts = financialYearLabel.split('-');
  if (parts.length !== 2) {
    throw new Error(`Invalid financial year label: ${financialYearLabel}`);
  }
  return `${parts[0].slice(-2)}-${parts[1].slice(-2)}`;
}

export function invoiceStateAlphaFromGstin(gstin: string): string {
  const code = (gstin || '').trim().substring(0, 2).padStart(2, '0');
  const alpha = GST_STATE_CODE_TO_INVOICE_ALPHA[code];
  if (!alpha) {
    throw new Error(
      `Invoice numbering is not configured for GST state code ${code}. Supported: Haryana (06), Delhi (07).`
    );
  }
  return alpha;
}

export function buildInvoiceSeriesKey(
  stateAlpha: string,
  financialYearLabel: string,
  documentType: string = INVOICE_DOCUMENT_TYPE_BOS
): string {
  return `${documentType}:${stateAlpha}:${financialYearLabel}`;
}

export function formatInternalInvoiceNumber(params: {
  stateAlpha: string;
  financialYearLabel: string;
  fyStartYear: number;
  sequence: number;
}): string {
  const { stateAlpha, financialYearLabel, fyStartYear, sequence } = params;
  const shortFy = shortFinancialYearLabel(financialYearLabel);

  if (fyStartYear >= INVOICE_NUMBER_NEW_FORMAT_FY_START) {
    // A/HR/B/26-27/1
    return `A/${stateAlpha}/B/${shortFy}/${sequence}`;
  }

  // Legacy (pre 2026-27)
  if (stateAlpha === 'DL') {
    // 25-26/001
    return `${shortFy}/${String(sequence).padStart(3, '0')}`;
  }
  if (stateAlpha === 'HR') {
    // AAPL/25-26/1
    return `AAPL/${shortFy}/${sequence}`;
  }

  throw new Error(`No legacy invoice format for state ${stateAlpha}`);
}

export type ParsedInternalInvoiceNumber = {
  stateAlpha: string;
  sequence: number;
};

/**
 * Parse sequence + state from a stored internal invoice number.
 * Supports current and legacy formats used by formatInternalInvoiceNumber.
 */
export function parseInternalInvoiceNumber(
  internalInvoiceNumber: string
): ParsedInternalInvoiceNumber {
  const raw = (internalInvoiceNumber || '').trim();

  // A/HR/B/26-27/1
  const modern = raw.match(/^A\/(HR|DL)\/B\/\d{2}-\d{2}\/(\d+)$/i);
  if (modern) {
    return { stateAlpha: modern[1].toUpperCase(), sequence: parseInt(modern[2], 10) };
  }

  // AAPL/25-26/1 (legacy Haryana)
  const legacyHr = raw.match(/^AAPL\/\d{2}-\d{2}\/(\d+)$/i);
  if (legacyHr) {
    return { stateAlpha: 'HR', sequence: parseInt(legacyHr[1], 10) };
  }

  // 25-26/001 (legacy Delhi)
  const legacyDl = raw.match(/^\d{2}-\d{2}\/(\d+)$/);
  if (legacyDl) {
    return { stateAlpha: 'DL', sequence: parseInt(legacyDl[1], 10) };
  }

  // Older seed variants: 2025-26/001 or AAPL/2025-26/1
  const legacyDlLong = raw.match(/^\d{4}-\d{2}\/(\d+)$/);
  if (legacyDlLong) {
    return { stateAlpha: 'DL', sequence: parseInt(legacyDlLong[1], 10) };
  }
  const legacyHrLong = raw.match(/^AAPL\/\d{4}-\d{2}\/(\d+)$/i);
  if (legacyHrLong) {
    return { stateAlpha: 'HR', sequence: parseInt(legacyHrLong[1], 10) };
  }

  throw new Error(`Unrecognized internal invoice number format: ${internalInvoiceNumber}`);
}
