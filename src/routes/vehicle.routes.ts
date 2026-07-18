import { Router } from 'express';
import { vehicleController } from '../controllers/vehicle.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   POST /api/v1/vehicles/verify
 * @desc    Verify vehicle via Surepass RC verification API (does NOT create vehicle)
 * @access  Private
 * @body    { vehicle_number: string }
 */
router.post('/verify', authenticate, vehicleController.verifyVehicle.bind(vehicleController));

/**
 * @route   GET /api/v1/vehicles
 * @desc    Get vehicles (active only by default)
 * @access  Private
 * @query   transporter_id: UUID (optional), is_active: boolean (optional), include_inactive: boolean (optional, all when true)
 */
router.get('/', authenticate, vehicleController.getAll.bind(vehicleController));

/**
 * @route   GET /api/v1/vehicles/byNumber/:vehicleNumber
 * @desc    Get vehicle by vehicle number
 * @access  Private
 */
router.get('/byNumber/:vehicleNumber', authenticate, vehicleController.getByVehicleNumber.bind(vehicleController));

/**
 * @route   GET /api/v1/vehicles/:id
 * @desc    Get vehicle by ID
 * @access  Private
 */
router.get('/:id', authenticate, vehicleController.getById.bind(vehicleController));

/**
 * @route   POST /api/v1/vehicles
 * @desc    Create new vehicle
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'vehicles'),
  vehicleController.create.bind(vehicleController)
);

/**
 * @route   PUT /api/v1/vehicles/:id
 * @desc    Update vehicle
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'vehicles'),
  vehicleController.update.bind(vehicleController)
);

/**
 * @route   DELETE /api/v1/vehicles/:id
 * @desc    Delete vehicle
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'vehicles'),
  vehicleController.delete.bind(vehicleController)
);

export default router;


