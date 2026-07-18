import { Router } from 'express';
import { driverController } from '../controllers/driver.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { licenseOcrUpload } from '../middleware/upload.middleware';

const router = Router();

/**
 * @route   GET /api/v1/drivers
 * @desc    List drivers (active only by default)
 * @access  Private
 * @query   include_inactive: boolean, is_active: boolean, is_verified: boolean
 */
router.get('/', authenticate, driverController.getAll.bind(driverController));

/**
 * @route   GET /api/v1/drivers/by-license/:licenseNumber
 * @desc    Get driver by normalized driving license number (URL-encoded)
 * @access  Private
 */
router.get(
  '/by-license/:licenseNumber',
  authenticate,
  driverController.getByLicenseNumber.bind(driverController)
);

/**
 * @route   GET /api/v1/drivers/checkExists
 * @desc    Check if a driving licence number is already registered
 * @access  Private
 * @query   license_number: string (required), exclude_id: uuid (optional, when editing)
 */
router.get(
  '/checkExists',
  authenticate,
  driverController.checkLicenseExists.bind(driverController)
);

/**
 * @route   POST /api/v1/drivers/verify
 * @desc    Verify driving licence via Surepass; auto-updates driver when driver_id or matching license exists
 * @access  Private
 * @body    license_number or id_number, dob (optional), driver_id (optional)
 */
router.post('/verify', authenticate, driverController.verifyDriver.bind(driverController));

/**
 * @route   POST /api/v1/drivers/ocr
 * @desc    OCR driving licence images via Surepass; optionally prefill driver when driver_id is sent
 * @access  Private
 * @form    front: file (required), back: file (optional), use_pdf: boolean (optional, set true for PDF uploads), driver_id: string (optional)
 */
router.post(
  '/ocr',
  authenticate,
  licenseOcrUpload,
  driverController.ocrDriver.bind(driverController)
);

/**
 * @route   POST /api/v1/drivers/:id/verify
 * @desc    Verify a saved driver via Surepass DL API; sets is_verified and profile fields
 * @access  Private
 * @body    license_number or id_number (optional, defaults to stored license), dob (optional)
 */
router.post(
  '/:id/verify',
  authenticate,
  auditLog('UPDATE', 'drivers'),
  driverController.verifyById.bind(driverController)
);

/**
 * @route   GET /api/v1/drivers/:id
 * @desc    Get driver by id
 * @access  Private
 */
router.get('/:id', authenticate, driverController.getById.bind(driverController));

/**
 * @route   POST /api/v1/drivers
 * @desc    Create driver
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'drivers'),
  driverController.create.bind(driverController)
);

/**
 * @route   PUT /api/v1/drivers/:id
 * @desc    Update driver
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'drivers'),
  driverController.update.bind(driverController)
);

/**
 * @route   DELETE /api/v1/drivers/:id
 * @desc    Delete driver permanently (blocked when linked elsewhere)
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'drivers'),
  driverController.delete.bind(driverController)
);

export default router;
