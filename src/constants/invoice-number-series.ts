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
    // 2025-26/001
    return `${shortFy}/${String(sequence).padStart(3, '0')}`;
  }
  if (stateAlpha === 'HR') {
    // AAPL/2025-26/1
    return `AAPL/${shortFy}/${sequence}`;
  }

  throw new Error(`No legacy invoice format for state ${stateAlpha}`);
}
