/**
 * Invoice-dispatch document policy, keyed off MastersIndia pincode distance.
 *
 * Preferred document (warning):
 *   Under 100 km → receiving (POD). 100 km+ → bilti / LR.
 *
 * Next-invoice gate: after 3 calendar days from dispatch_date (IST), create is
 * blocked only while BOTH receiving and bilti/LR are missing. Uploading either
 * unblocks create; the preferred document stays a recommendation until it is
 * uploaded too.
 */
export const DISPATCH_DISTANCE_KM_THRESHOLD = 100;
export const DISPATCH_DOCUMENT_GRACE_DAYS = 3;

export type DispatchDistanceBand = 'under_100' | 'over_100' | 'unknown';
export type DispatchRequiredDocument = 'receiving_doc' | 'bilti';
