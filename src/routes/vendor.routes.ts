import { Router } from 'express';
import { vendorController } from '../controllers/vendor.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/vendors/lookupGST
 * @desc    Lookup GST number and get business details
 * @access  Private
 * @query   gst_number: string (15 chars)
 */
router.get('/lookupGST', authenticate, vendorController.lookupGST.bind(vendorController));

/**
 * @route   GET /api/v1/vendors/lookupPAN
 * @desc    Lookup PAN number and get business details
 * @access  Private
 * @query   pan_number: string (10 chars)
 */
router.get('/lookupPAN', authenticate, vendorController.lookupPAN.bind(vendorController));

/**
 * @route   GET /api/v1/vendors/checkExists
 * @desc    Check if vendor exists by GST or PAN number
 * @access  Private
 * @query   gst_number: string (optional, 15 chars) OR pan_number: string (optional, 10 chars)
 */
router.get('/checkExists', authenticate, vendorController.checkVendorExists.bind(vendorController));

/**
 * @route   POST /api/v1/vendors/quickCreateFromGST
 * @desc    Quick create vendor from GST number
 * @access  Private
 */
router.post(
  '/quickCreateFromGST',
  authenticate,
  auditLog('CREATE', 'vendors'),
  vendorController.createFromGST.bind(vendorController)
);

/**
 * @route   POST /api/v1/vendors/quickCreateFromPAN
 * @desc    Quick create vendor from PAN number
 * @access  Private
 */
router.post(
  '/quickCreateFromPAN',
  authenticate,
  auditLog('CREATE', 'vendors'),
  vendorController.createFromPAN.bind(vendorController)
);

/**
 * @route   GET /api/v1/vendors/getAllVendors
 * @desc    Get all vendors
 * @access  Private
 * @query   include_inactive: boolean, type: purchaser|seller|both
 */
router.get('/getAllVendors', authenticate, vendorController.getAll.bind(vendorController));

/**
 * @route   GET /api/v1/vendors/getVendorById/:id
 * @desc    Get vendor by ID
 * @access  Private
 */
router.get('/getVendorById/:id', authenticate, vendorController.getById.bind(vendorController));

/**
 * @route   POST /api/v1/vendors/createVendor
 * @desc    Create new vendor
 * @access  Private
 */
router.post(
  '/createVendor',
  authenticate,
  auditLog('CREATE', 'vendors'),
  vendorController.create.bind(vendorController)
);

/**
 * @route   POST /api/v1/vendors/updateVendor/:id
 * @desc    Update vendor
 * @access  Private
 */
router.post(
  '/updateVendor/:id',
  authenticate,
  auditLog('UPDATE', 'vendors'),
  vendorController.update.bind(vendorController)
);

/**
 * @route   POST /api/v1/vendors/deleteVendor/:id
 * @desc    Delete vendor
 * @access  Private
 */
router.post(
  '/deleteVendor/:id',
  authenticate,
  auditLog('DELETE', 'vendors'),
  vendorController.delete.bind(vendorController)
);

export default router;