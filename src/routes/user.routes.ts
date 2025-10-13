import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/users
 * @desc    Get all users
 * @access  Private (Admin only)
 */
router.get('/', authenticate, authorize('admin'), userController.getAll.bind(userController));

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID
 * @access  Private (Admin or self)
 */
router.get('/:id', authenticate, userController.getById.bind(userController));

/**
 * @route   POST /api/v1/users
 * @desc    Create new user
 * @access  Private (Admin only)
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  auditLog('CREATE', 'users'),
  userController.create.bind(userController)
);

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update user
 * @access  Private (Admin or self)
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'users'),
  userController.update.bind(userController)
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user
 * @access  Private (Admin only)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  auditLog('DELETE', 'users'),
  userController.delete.bind(userController)
);

export default router;

