import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { couponAdminController } from '../controllers/coupon-admin.controller';

const router = Router();

router.post(
  '/webhooks/cashfree',
  couponAdminController.cashfreeWebhook.bind(couponAdminController)
);

router.use(authenticate);

router.post('/createCouponBatch', couponAdminController.createCouponBatch.bind(couponAdminController));
router.post('/generateBatchCodes/:batchId', couponAdminController.generateBatchCodes.bind(couponAdminController));
router.get('/getAllCouponBatches', couponAdminController.getAllCouponBatches.bind(couponAdminController));
router.get('/getCouponBatchById/:batchId', couponAdminController.getCouponBatchById.bind(couponAdminController));
router.get('/exportBatchCodes/:batchId', couponAdminController.exportBatchCodes.bind(couponAdminController));
router.post('/markBatchPrinted/:batchId', couponAdminController.markBatchPrinted.bind(couponAdminController));
router.post('/markBatchAllotted/:batchId', couponAdminController.markBatchAllotted.bind(couponAdminController));
router.post('/archiveCouponBatch/:batchId', couponAdminController.archiveCouponBatch.bind(couponAdminController));
router.post('/voidCouponBatch/:batchId', couponAdminController.voidCouponBatch.bind(couponAdminController));
router.post('/deleteCouponBatch/:batchId', couponAdminController.deleteCouponBatch.bind(couponAdminController));
router.post('/lockCouponBatch/:batchId', couponAdminController.lockCouponBatch.bind(couponAdminController));
router.post('/unlockCouponBatch/:batchId', couponAdminController.unlockCouponBatch.bind(couponAdminController));

router.get('/getAllCoupons', couponAdminController.getAllCoupons.bind(couponAdminController));
router.get('/getCouponByCode/:code', couponAdminController.getCouponByCode.bind(couponAdminController));
router.post('/markCouponPrinted/:code', couponAdminController.markCouponPrinted.bind(couponAdminController));
router.post('/markCouponAllotted/:code', couponAdminController.markCouponAllotted.bind(couponAdminController));
router.post('/voidCoupon/:code', couponAdminController.voidCoupon.bind(couponAdminController));

router.get('/getAllRedemptions', couponAdminController.getAllRedemptions.bind(couponAdminController));
router.get('/getPendingPayouts', couponAdminController.getPendingPayouts.bind(couponAdminController));
router.get('/getRedemptionById/:id', couponAdminController.getRedemptionById.bind(couponAdminController));
router.post('/markRedemptionPaid/:id', couponAdminController.markRedemptionPaid.bind(couponAdminController));
router.post('/bulkMarkRedemptionsPaid', couponAdminController.bulkMarkRedemptionsPaid.bind(couponAdminController));
router.post('/unmarkRedemptionPaid/:id', couponAdminController.unmarkRedemptionPaid.bind(couponAdminController));

router.get('/getRedemptionAttempts', couponAdminController.getRedemptionAttempts.bind(couponAdminController));

router.get('/getRedeemerByPhone/:phone', couponAdminController.getRedeemerByPhone.bind(couponAdminController));
router.get('/getAllRedeemers', couponAdminController.getAllRedeemers.bind(couponAdminController));

router.post('/createPromotionRule', couponAdminController.createPromotionRule.bind(couponAdminController));
router.get('/getAllPromotionRules', couponAdminController.getAllPromotionRules.bind(couponAdminController));
router.get('/getPromotionRuleById/:id', couponAdminController.getPromotionRuleById.bind(couponAdminController));
router.post('/updatePromotionRule/:id', couponAdminController.updatePromotionRule.bind(couponAdminController));
router.post('/togglePromotionRule/:id', couponAdminController.togglePromotionRule.bind(couponAdminController));
router.post('/deletePromotionRule/:id', couponAdminController.deletePromotionRule.bind(couponAdminController));
router.post('/previewPromotionRuleStack', couponAdminController.previewPromotionRuleStack.bind(couponAdminController));
router.get('/getPromotionRuleStats/:id', couponAdminController.getPromotionRuleStats.bind(couponAdminController));

router.post('/retryPayout/:redemptionId', couponAdminController.retryPayout.bind(couponAdminController));
router.post(
  '/initiateCashfreePayout/:redemptionId',
  couponAdminController.initiateCashfreePayout.bind(couponAdminController)
);
router.get('/getPayoutAttempts/:redemptionId', couponAdminController.getPayoutAttempts.bind(couponAdminController));

export default router;
