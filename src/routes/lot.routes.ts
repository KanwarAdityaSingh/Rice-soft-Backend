import { Router } from 'express';
import { lotController } from '../controllers/lot.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/lots
 * @desc    Get all lots
 * @access  Private
 * @query   sauda_id: UUID (optional filter)
 */
router.get('/', authenticate, lotController.getAll.bind(lotController));

/**
 * @route   GET /api/v1/lots/:id
 * @desc    Get lot by ID
 * @access  Private
 */
router.get('/:id', authenticate, lotController.getById.bind(lotController));

/**
 * @route   POST /api/v1/lots
 * @desc    Create new lot
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'inward_slip_lots'),
  lotController.create.bind(lotController)
);

/**
 * @route   PUT /api/v1/lots/:id
 * @desc    Update lot
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'inward_slip_lots'),
  lotController.update.bind(lotController)
);

/**
 * @route   DELETE /api/v1/lots/:id
 * @desc    Delete lot
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'inward_slip_lots'),
  lotController.delete.bind(lotController)
);

export default router;

