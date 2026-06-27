import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import {
  authLimiter,
  refreshTokenLimiter,
  requestOtpLimiter,
  verifyOtpLimiter,
} from '../middleware/rate-limit.middleware';

const router = Router();

/**
 * @route   POST /api/v1/auth/loginUser
 * @desc    Login user (sets httpOnly refresh cookie + returns short-lived access token)
 * @access  Public
 */
router.post('/loginUser', authLimiter, authController.login.bind(authController));

/**
 * @route   POST /api/v1/auth/refreshToken
 * @desc    Rotate refresh cookie and issue new access token
 * @access  Public (requires refreshToken httpOnly cookie)
 */
router.post('/refreshToken', refreshTokenLimiter, authController.refreshToken.bind(authController));

/**
 * @route   POST /api/v1/auth/requestOtp
 * @desc    Request OTP for passwordless login
 * @access  Public
 */
router.post('/requestOtp', requestOtpLimiter, authController.requestOtp.bind(authController));

/**
 * @route   POST /api/v1/auth/verifyOtp
 * @desc    Verify OTP and login
 * @access  Public
 */
router.post('/verifyOtp', verifyOtpLimiter, authController.verifyOtp.bind(authController));

/**
 * @route   POST /api/v1/auth/logoutUser
 * @desc    Logout user
 * @access  Private
 */
router.post('/logoutUser', authenticate, authController.logout.bind(authController));

/**
 * @route   GET /api/v1/auth/getUserProfile
 * @route   GET /api/v1/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/getUserProfile', authenticate, authController.getProfile.bind(authController));
router.get('/profile', authenticate, authController.getProfile.bind(authController));

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
