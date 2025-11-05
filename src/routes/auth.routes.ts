import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   POST /api/v1/auth/loginUser
 * @desc    Login user
 * @access  Public
 */
router.post('/loginUser', authController.login.bind(authController));

/**
 * @route   POST /api/v1/auth/logoutUser
 * @desc    Logout user
 * @access  Private
 */
router.post('/logoutUser', authenticate, authController.logout.bind(authController));

/**
 * @route   GET /api/v1/auth/getUserProfile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/getUserProfile', authenticate, authController.getProfile.bind(authController));

/**
 * @route   POST /api/v1/auth/changeUserPassword
 * @desc    Change user password
 * @access  Private
 */
router.post('/changeUserPassword', authenticate, authController.changePassword.bind(authController));

/**
 * @route   GET /api/v1/auth/getUserLoginHistory
 * @desc    Get user login history
 * @access  Private
 */
router.get('/getUserLoginHistory', authenticate, authController.getLoginHistory.bind(authController));

export default router;
