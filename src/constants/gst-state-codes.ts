/** GST state numeric code → full name (India). */
export const GST_STATE_CODE_TO_NAME: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

const NAME_TO_CODE = Object.fromEntries(
  Object.entries(GST_STATE_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code])
);

export function gstStateNameFromCode(code: string): string {
  return GST_STATE_CODE_TO_NAME[code.padStart(2, '0')] ?? code;
}

export function gstStateCodeFromGstin(gstin: string): string {
  return (gstin || '').trim().substring(0, 2);
}

export function resolveGstStateName(stateOrCode: string | null | undefined, gstin?: string | null): string {
  const raw = (stateOrCode || '').trim();
  if (/^\d{1,2}$/.test(raw)) {
    return gstStateNameFromCode(raw.padStart(2, '0'));
  }
  if (raw) {
    const byName = NAME_TO_CODE[raw.toLowerCase()];
    if (byName) {
      return GST_STATE_CODE_TO_NAME[byName];
    }
    return raw;
  }
  if (gstin && gstin.length >= 2) {
    return gstStateNameFromCode(gstStateCodeFromGstin(gstin));
  }
  return 'Unknown';
}

export function resolveGstStateCode(stateOrCode: string | null | undefined, gstin?: string | null): string {
  const raw = (stateOrCode || '').trim();
  if (/^\d{1,2}$/.test(raw)) {
    return raw.padStart(2, '0');
  }
  if (raw) {
    const code = NAME_TO_CODE[raw.toLowerCase()];
    if (code) return code;
  }
  if (gstin && gstin.length >= 2) {
    return gstStateCodeFromGstin(gstin);
  }
  return '00';
}

export function isInterStateSupply(sellerGstin: string, buyerGstin: string): boolean {
  if (!sellerGstin || !buyerGstin || sellerGstin.length < 2 || buyerGstin.length < 2) {
    return false;
  }
  return gstStateCodeFromGstin(sellerGstin) !== gstStateCodeFromGstin(buyerGstin);
}
