import { Router } from 'express';
import { saudaController } from '../controllers/sauda.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/saudas
 * @desc    Get all saudas
 * @access  Private
 * @query   include_inactive: boolean, status: draft|active|completed|cancelled, sauda_type: xgodown|for, purchaser_id: UUID
 */
router.get('/', authenticate, saudaController.getAll.bind(saudaController));

/**
 * @route   GET /api/v1/saudas/:id
 * @desc    Get sauda by ID
 * @access  Private
 */
router.get('/:id', authenticate, saudaController.getById.bind(saudaController));

/**
 * @route   POST /api/v1/saudas
 * @desc    Create new sauda
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'saudas'),
  saudaController.create.bind(saudaController)
);

/**
 * @route   PUT /api/v1/saudas/:id
 * @desc    Update sauda
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'saudas'),
  saudaController.update.bind(saudaController)
);

/**
 * @route   PATCH /api/v1/saudas/:id/status
 * @desc    Update sauda status
 * @access  Private
 */
router.patch(
  '/:id/status',
  authenticate,
  auditLog('UPDATE', 'saudas'),
  saudaController.updateStatus.bind(saudaController)
);

/**
 * @route   DELETE /api/v1/saudas/:id
 * @desc    Delete sauda
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'saudas'),
  saudaController.delete.bind(saudaController)
);

export default router;

