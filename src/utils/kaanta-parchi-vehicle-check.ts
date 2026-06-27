import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { vehicleDAO } from '../dao/vehicle.dao';
import { normalizeVehicleNumber } from './vehicle-number';

export interface ParchiVehicleCheckResult {
  checked: boolean;
  isp_vehicle_number: string | null;
  parchi_vehicle_number: string | null;
  matches: boolean | null;
  mismatch_flagged: boolean;
}

/**
 * Compares an optional parchi vehicle number against the inward slip pass vehicle.
 * Never throws — mismatch is flagged, not rejected.
 */
export async function checkParchiVehicleAgainstInwardSlipPass(
  parchiVehicleNumber: string | null | undefined,
  inwardSlipPassId: string | undefined
): Promise<ParchiVehicleCheckResult> {
  const trimmedParchi = parchiVehicleNumber?.trim() || null;

  if (!inwardSlipPassId) {
    return {
      checked: false,
      isp_vehicle_number: null,
      parchi_vehicle_number: trimmedParchi,
      matches: null,
      mismatch_flagged: false,
    };
  }

  const isp = await inwardSlipPassDAO.findById(inwardSlipPassId);
  if (!isp?.vehicle_id) {
    return {
      checked: true,
      isp_vehicle_number: null,
      parchi_vehicle_number: trimmedParchi,
      matches: trimmedParchi ? null : null,
      mismatch_flagged: false,
    };
  }

  const vehicle = await vehicleDAO.findById(isp.vehicle_id);
  const ispVehicleNumber = vehicle?.vehicle_number?.trim() || null;

  if (!trimmedParchi || !ispVehicleNumber) {
    return {
      checked: true,
      isp_vehicle_number: ispVehicleNumber,
      parchi_vehicle_number: trimmedParchi,
      matches: null,
      mismatch_flagged: false,
    };
  }

  const matches =
    normalizeVehicleNumber(trimmedParchi) === normalizeVehicleNumber(ispVehicleNumber);

  return {
    checked: true,
    isp_vehicle_number: ispVehicleNumber,
    parchi_vehicle_number: trimmedParchi,
    matches,
    mismatch_flagged: !matches,
  };
}

/**
 * Returns whether vehicle numbers mismatch (for persisting on kaanta create/update).
 */
export async function resolveVehicleNumberMismatchFlag(
  parchiVehicleNumber: string | null | undefined,
  inwardSlipPassId: string
): Promise<boolean> {
  const result = await checkParchiVehicleAgainstInwardSlipPass(
    parchiVehicleNumber,
    inwardSlipPassId
  );
  return result.mismatch_flagged;
}
