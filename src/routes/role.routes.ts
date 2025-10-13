import { Router } from 'express';
import { roleController } from '../controllers/role.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/roles
 * @desc    Get all roles
 * @access  Private
 */
router.get('/', authenticate, roleController.getAll.bind(roleController));

/**
 * @route   GET /api/v1/roles/:id
 * @desc    Get role by ID
 * @access  Private
 */
router.get('/:id', authenticate, roleController.getById.bind(roleController));

/**
 * @route   POST /api/v1/roles
 * @desc    Create new role
 * @access  Private (Admin only)
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  auditLog('CREATE', 'roles'),
  roleController.create.bind(roleController)
);

/**
 * @route   PUT /api/v1/roles/:id
 * @desc    Update role
 * @access  Private (Admin only)
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  auditLog('UPDATE', 'roles'),
  roleController.update.bind(roleController)
);

/**
 * @route   DELETE /api/v1/roles/:id
 * @desc    Delete role
 * @access  Private (Admin only)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  auditLog('DELETE', 'roles'),
  roleController.delete.bind(roleController)
);

export default router;

