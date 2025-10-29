import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/users/getAllUsers
 * @desc    Get all users
 * @access  Private (All authenticated users)
 */
router.get('/getAllUsers', authenticate, userController.getAll.bind(userController));

/**
 * @route   GET /api/v1/users/getUserById/:id
 * @desc    Get user by ID
 * @access  Private (All authenticated users)
 */
router.get('/getUserById/:id', authenticate, userController.getById.bind(userController));

/**
 * @route   POST /api/v1/users/createUser
 * @desc    Create new user
 * @access  Private (All authenticated users)
 */
router.post(
  '/createUser',
  authenticate,
  auditLog('CREATE', 'users'),
  userController.create.bind(userController)
);

/**
 * @route   POST /api/v1/users/updateUser/:id
 * @desc    Update user
 * @access  Private (All authenticated users)
 */
router.post(
  '/updateUser/:id',
  authenticate,
  auditLog('UPDATE', 'users'),
  userController.update.bind(userController)
);

/**
 * @route   POST /api/v1/users/deleteUser/:id
 * @desc    Delete user
 * @access  Private (All authenticated users)
 */
router.post(
  '/deleteUser/:id',
  authenticate,
  auditLog('DELETE', 'users'),
  userController.delete.bind(userController)
);

export default router;

