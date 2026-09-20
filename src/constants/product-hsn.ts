import type { RiceCategory } from './rice-categories';
import type { HsnCode } from './hsn-codes';
import { HSN_CODES } from './hsn-codes';

/** Default HSN by rice category — both map to 100630 today; extend when codes diverge. */
export function defaultHsnForRiceCategory(_category: RiceCategory): HsnCode {
  return HSN_CODES[0];
}
