import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { couponPublicController } from '../controllers/coupon-public.controller';
import { authenticatePublicUser } from '../middleware/public-auth.middleware';

const router = Router();

const couponPublicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.COUPON_PUBLIC_RATE_LIMIT_MAX || '20', 10),
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // More restrictive for OTP endpoints
  message: 'Too many OTP requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP endpoints (no auth required, but rate-limited)
router.post('/sendOtp', otpLimiter, couponPublicController.sendOtp.bind(couponPublicController));
router.post('/verifyOtp', otpLimiter, couponPublicController.verifyOtp.bind(couponPublicController));

// Token refresh (no auth required - uses refresh token)
router.post('/refreshToken', couponPublicLimiter, couponPublicController.refreshToken.bind(couponPublicController));

// All coupon operations require authentication
router.use(couponPublicLimiter);
router.use(authenticatePublicUser);

// Authenticated coupon endpoints
router.get(
  '/verifyBankAccount',
  couponPublicController.verifyBankAccount.bind(couponPublicController)
);
router.post('/verifyCoupon', couponPublicController.verifyCoupon.bind(couponPublicController));
router.post('/redeemCoupon', couponPublicController.redeemCoupon.bind(couponPublicController));

// Profile and history endpoints
router.get('/myRedemptions', couponPublicController.getMyRedemptions.bind(couponPublicController));
router.get('/myProfile', couponPublicController.getMyProfile.bind(couponPublicController));
router.get('/payoutStatus/:publicRef', couponPublicController.checkPayoutStatus.bind(couponPublicController));

// Session management endpoints
router.post('/logout', couponPublicController.logout.bind(couponPublicController));
router.post('/logoutAll', couponPublicController.logoutAll.bind(couponPublicController));
router.get('/sessions', couponPublicController.getSessions.bind(couponPublicController));

export default router;
