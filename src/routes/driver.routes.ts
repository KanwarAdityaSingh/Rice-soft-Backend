import { Router } from 'express';
import { driverController } from '../controllers/driver.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/drivers
 * @desc    List drivers
 * @access  Private
 * @query   include_inactive: boolean (optional)
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
 * @route   GET /api/v1/drivers/:id
 * @desc    Get driver by id
 * @access  Private
 */
router.get('/:id', authenticate, driverController.getById.bind(driverController));

/**
 * @route   POST /api/v1/drivers
 * @desc    Create driver (Surepass verify flow to be added later)
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
 * @desc    Soft-delete driver
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'drivers'),
  driverController.delete.bind(driverController)
);

export default router;
