import { Router } from 'express';
import { purchaseSummaryController } from '../controllers/purchase-summary.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   GET /api/v1/purchase-summary/sauda/:saudaId/kaanta-overview
 * @query   godown_id (optional)
 * @desc    Kaanta-only purchase overview: ISP rows with counts + metrics from kaanta-linked lots (no sauda metadata in body)
 * @access  Private
 */
router.get(
  '/sauda/:saudaId/kaanta-overview',
  authenticate,
  purchaseSummaryController.getKaantaPurchaseOverview.bind(purchaseSummaryController)
);

/**
 * @route   GET /api/v1/purchase-summary/sauda/:saudaId/inward-slip-passes/:ispId/kaanta-lots
 * @query   godown_id (optional)
 * @desc    Kaantas and lots for one ISP under a sauda (drill-down; no sauda metadata in body)
 * @access  Private
 */
router.get(
  '/sauda/:saudaId/inward-slip-passes/:ispId/kaanta-lots',
  authenticate,
  purchaseSummaryController.getKaantaPurchaseIspDetail.bind(purchaseSummaryController)
);

/**
 * @route   GET /api/v1/purchase-summary/sauda/:saudaId
 * @desc    Get purchase summary for a sauda
 * @access  Private
 */
router.get('/sauda/:saudaId', authenticate, purchaseSummaryController.getSaudaSummary.bind(purchaseSummaryController));

/**
 * @route   GET /api/v1/purchase-summary/isp/:ispId
 * @desc    Get purchase summary for an ISP (aggregates all saudas)
 * @access  Private
 */
router.get('/isp/:ispId', authenticate, purchaseSummaryController.getIspSummary.bind(purchaseSummaryController));

export default router;

