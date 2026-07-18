import { AuthRequest } from '../middleware/auth.middleware';
import { ValidationError } from './errors';
import type {
  AadhaarOcrResult,
  GstOcrResult,
  PanOcrResult,
  VehicleRcOcrResult,
} from '../services/gst-lookup.service';

export function parseDocumentOcrUpload(req: AuthRequest): {
  file: Express.Multer.File;
  usePdf: boolean;
} {
  const file = req.file;
  if (!file) {
    throw new ValidationError('file is required');
  }

  const rawUsePdf = req.body?.use_pdf;
  const usePdf =
    rawUsePdf === true ||
    rawUsePdf === 'true' ||
    rawUsePdf === '1' ||
    rawUsePdf === 1 ||
    file.mimetype === 'application/pdf';

  return { file, usePdf };
}

export function gstOcrPayload(mapped: GstOcrResult) {
  return {
    client_id: mapped.client_id,
    gstin: mapped.gstin,
    confidence: mapped.confidence,
    document_type: mapped.document_type,
    standard_document: mapped.standard_document,
  };
}

export function panOcrPayload(mapped: PanOcrResult) {
  return {
    client_id: mapped.client_id,
    pan_number: mapped.pan_number,
    full_name: mapped.full_name,
    father_name: mapped.father_name,
    dob: mapped.date_of_birth,
    date_of_birth: mapped.date_of_birth,
    confidences: mapped.confidences,
  };
}

export function aadhaarOcrPayload(mapped: AadhaarOcrResult) {
  return {
    client_id: mapped.client_id,
    aadhaar_number: mapped.aadhaar_number,
    full_name: mapped.full_name,
    gender: mapped.gender,
    mother_name: mapped.mother_name,
    dob: mapped.date_of_birth,
    date_of_birth: mapped.date_of_birth,
    is_masked: mapped.is_masked,
    document_type: mapped.document_type,
    confidences: mapped.confidences,
  };
}

export function vehicleRcOcrPayload(mapped: VehicleRcOcrResult) {
  return {
    client_id: mapped.client_id,
    registration_number: mapped.registration_number,
    chassis_number: mapped.chassis_number,
    engine_number: mapped.engine_number,
    owner_name: mapped.owner_name,
    relative: mapped.relative,
    address: mapped.address,
    fuel_used: mapped.fuel_used,
    date_of_registration: mapped.date_of_registration,
    registration_validity: mapped.registration_validity,
    owner_sr_no: mapped.owner_sr_no,
    state: mapped.state,
    vehicle_weight: mapped.vehicle_weight,
  };
}
