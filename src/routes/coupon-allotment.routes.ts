import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { couponAllotmentController } from '../controllers/coupon-allotment.controller';

const router = Router();

router.use(authenticate);

// Coupon <-> invoice dispatch allotment workflow ("Mark Allotted" screen)
router.get(
  '/invoice-dispatches/:invoiceDispatchId/allotment-candidates',
  couponAllotmentController.getAllotmentCandidates.bind(couponAllotmentController)
);
router.get(
  '/invoice-dispatches/:invoiceDispatchId/allotments',
  couponAllotmentController.getAllotmentForDispatch.bind(couponAllotmentController)
);
router.post(
  '/invoice-dispatches/:invoiceDispatchId/allotments/preview',
  couponAllotmentController.previewAllotment.bind(couponAllotmentController)
);
router.post(
  '/invoice-dispatches/:invoiceDispatchId/allotments/confirm',
  couponAllotmentController.confirmAllotment.bind(couponAllotmentController)
);

router.post(
  '/allotment-lines/:lineId/unlink',
  couponAllotmentController.unlinkAllotmentLine.bind(couponAllotmentController)
);

router.get(
  '/allotments',
  couponAllotmentController.getAllotmentHistory.bind(couponAllotmentController)
);

router.get(
  '/invoice-allotment-summaries',
  couponAllotmentController.listInvoiceAllotmentSummaries.bind(couponAllotmentController)
);

router.get(
  '/coupon-batches/:batchId/allotment-progress',
  couponAllotmentController.getBatchAllotmentProgress.bind(couponAllotmentController)
);

export default router;
