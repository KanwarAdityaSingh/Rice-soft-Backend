import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { couponAnalyticsController } from '../controllers/coupon-analytics.controller';

const router = Router();

router.use(authenticate);

router.get('/getOverview', couponAnalyticsController.getOverview.bind(couponAnalyticsController));
router.get('/getBatchPerformance', couponAnalyticsController.getBatchPerformance.bind(couponAnalyticsController));
router.get('/getRedemptionTrends', couponAnalyticsController.getRedemptionTrends.bind(couponAnalyticsController));
router.get('/getPayoutSummary', couponAnalyticsController.getPayoutSummary.bind(couponAnalyticsController));
router.get('/getRedeemerLeaderboard', couponAnalyticsController.getRedeemerLeaderboard.bind(couponAnalyticsController));
router.get('/getFraudSignals', couponAnalyticsController.getFraudSignals.bind(couponAnalyticsController));
router.get(
  '/getPromotionRulePerformance',
  couponAnalyticsController.getPromotionRulePerformance.bind(couponAnalyticsController)
);

export default router;
