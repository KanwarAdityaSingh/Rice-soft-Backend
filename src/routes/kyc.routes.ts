import { Router } from 'express';
import { kycController } from '../controllers/kyc.controller';
import { authenticate } from '../middleware/auth.middleware';
import { licenseOcrUpload, documentOcrUpload } from '../middleware/upload.middleware';

const router = Router();

/**
 * @route   GET /api/v1/kyc/aadhaar/validate
 * @desc    Validate Aadhaar via Surepass
 * @access  Private
 * @query   aadhaar_number: string (12 digits)
 */
router.get(
  '/aadhaar/validate',
  authenticate,
  kycController.validateAadhaar.bind(kycController)
);

/**
 * @route   POST /api/v1/kyc/aadhaar/ocr
 * @desc    OCR Aadhaar card via Surepass
 * @access  Private
 * @form    file: file (required), use_pdf: boolean (optional, set true for PDF uploads)
 */
router.post(
  '/aadhaar/ocr',
  authenticate,
  documentOcrUpload,
  kycController.ocrAadhaar.bind(kycController)
);

/**
 * @route   GET /api/v1/kyc/bank/verify
 * @desc    Verify bank account via Surepass
 * @access  Private
 * @query   account_number: string, ifsc_code: string, ifsc_details: boolean (optional, default true)
 */
router.get(
  '/bank/verify',
  authenticate,
  kycController.verifyBankAccount.bind(kycController)
);

/**
 * @route   POST /api/v1/kyc/driving-license/ocr
 * @desc    OCR driving licence front/back via Surepass license-v2
 * @access  Private
 * @form    front: file (required), back: file (optional), use_pdf: boolean (optional, set true for PDF uploads)
 */
router.post(
  '/driving-license/ocr',
  authenticate,
  licenseOcrUpload,
  kycController.ocrDrivingLicense.bind(kycController)
);

/**
 * @route   POST /api/v1/kyc/driving-license/verify
 * @desc    Verify driving licence via Surepass (same as Surepass POST driving-license/driving-license)
 * @access  Private
 * @body    license_number or id_number: string, dob: string (optional, YYYY-MM-DD), entity_type?, entity_id? (persist)
 */
router.post(
  '/driving-license/verify',
  authenticate,
  kycController.verifyDrivingLicense.bind(kycController)
);

/**
 * @route   GET /api/v1/kyc/email/verify
 * @desc    Verify email via Surepass
 * @access  Private
 * @query   email: string
 */
router.get(
  '/email/verify',
  authenticate,
  kycController.verifyEmail.bind(kycController)
);

/**
 * @route   GET /api/v1/kyc/gstin/advanced
 * @desc    Lookup GSTIN via Surepass Advanced API
 * @access  Private
 * @query   gst_number: string (15 chars)
 */
router.get(
  '/gstin/advanced',
  authenticate,
  kycController.lookupGSTAdvanced.bind(kycController)
);

/**
 * @route   POST /api/v1/kyc/gstin/ocr
 * @desc    OCR GST certificate via Surepass
 * @access  Private
 * @form    file: file (required), use_pdf: boolean (optional, set true for PDF uploads)
 */
router.post(
  '/gstin/ocr',
  authenticate,
  documentOcrUpload,
  kycController.ocrGst.bind(kycController)
);

/**
 * @route   GET /api/v1/kyc/pan/comprehensive
 * @desc    Lookup PAN via Surepass Comprehensive API
 * @access  Private
 * @query   pan_number: string (10 chars)
 */
router.get(
  '/pan/comprehensive',
  authenticate,
  kycController.lookupPANComprehensive.bind(kycController)
);

/**
 * @route   POST /api/v1/kyc/pan/ocr
 * @desc    OCR PAN card via Surepass
 * @access  Private
 * @form    file: file (required), use_pdf: boolean (optional, set true for PDF uploads)
 */
router.post(
  '/pan/ocr',
  authenticate,
  documentOcrUpload,
  kycController.ocrPan.bind(kycController)
);

/**
 * @route   GET /api/v1/kyc/gstin/by-pan
 * @desc    List GSTINs for a PAN via Surepass Corporate GSTIN-by-PAN API
 * @access  Private
 * @query   pan_number: string (10 chars), entity_type?, entity_id? (optional persist)
 */
router.get(
  '/gstin/by-pan',
  authenticate,
  kycController.lookupGstinByPan.bind(kycController)
);

/**
 * @route   GET /api/v1/kyc/pan/contact
 * @desc    Lookup emails and mobiles linked to a PAN via Surepass
 * @access  Private
 * @query   pan_number: string (10 chars), entity_type?, entity_id? (optional persist)
 */
router.get(
  '/pan/contact',
  authenticate,
  kycController.lookupPanContact.bind(kycController)
);

/**
 * @route   POST /api/v1/kyc/rc/challan-details
 * @desc    Fetch RC challan details via Surepass
 * @access  Private
 * @body    rc_number, chassis_number, engine_number, state_only (optional), state_portal (optional)
 */
router.post(
  '/rc/challan-details',
  authenticate,
  kycController.lookupRcChallanDetails.bind(kycController)
);

/**
 * @route   POST /api/v1/kyc/rc/full
 * @desc    Fetch full RC details via Surepass
 * @access  Private
 * @body    id_number: string (vehicle registration number)
 */
router.post(
  '/rc/full',
  authenticate,
  kycController.lookupRcFull.bind(kycController)
);

/**
 * @route   POST /api/v1/kyc/rc/ocr
 * @desc    OCR vehicle RC via Surepass
 * @access  Private
 * @form    file: file (required), use_pdf: boolean (optional, set true for PDF uploads)
 */
router.post(
  '/rc/ocr',
  authenticate,
  documentOcrUpload,
  kycController.ocrVehicleRc.bind(kycController)
);

export default router;
