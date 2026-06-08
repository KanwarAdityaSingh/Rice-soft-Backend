import { Router } from 'express';
import { kycController } from '../controllers/kyc.controller';
import { authenticate } from '../middleware/auth.middleware';

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
 * @route   POST /api/v1/kyc/driving-license/verify
 * @desc    Verify driving licence via Surepass
 * @access  Private
 * @body    license_number: string, dob: string (optional, YYYY-MM-DD)
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

export default router;
