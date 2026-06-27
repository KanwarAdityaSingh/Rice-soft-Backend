import { AuthRequest } from '../middleware/auth.middleware';
import { ValidationError } from './errors';

export function parseLicenseOcrUpload(req: AuthRequest): {
  front: Express.Multer.File;
  back?: Express.Multer.File;
  usePdf: boolean;
} {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const front = files?.front?.[0];
  if (!front) {
    throw new ValidationError('front file is required');
  }

  const back = files?.back?.[0];
  const rawUsePdf = req.body?.use_pdf;
  const usePdf =
    rawUsePdf === true ||
    rawUsePdf === 'true' ||
    rawUsePdf === '1' ||
    rawUsePdf === 1;

  return { front, back, usePdf };
}

export function drivingLicenseOcrPayload(
  mapped: import('../services/gst-lookup.service').DrivingLicenseOcrResult
) {
  return {
    client_id: mapped.client_id,
    license_number: mapped.license_number,
    name: mapped.full_name,
    full_name: mapped.full_name,
    dob: mapped.date_of_birth,
    date_of_birth: mapped.date_of_birth,
    address: mapped.address,
    pincode: mapped.pincode,
    state: mapped.state,
  };
}
