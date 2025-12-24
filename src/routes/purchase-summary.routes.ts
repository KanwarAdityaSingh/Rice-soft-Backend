import { Router } from 'express';
import { purchaseSummaryController } from '../controllers/purchase-summary.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   GET /api/v1/purchase-summary/sauda/:saudaId
 * @desc    Get purchase summary for a sauda
 * @access  Private
 * @query   igst_percentage: number (optional, defaults to 0)
 */
router.get('/sauda/:saudaId', authenticate, purchaseSummaryController.getSaudaSummary.bind(purchaseSummaryController));

/**
 * @route   GET /api/v1/purchase-summary/isp/:ispId
 * @desc    Get purchase summary for an ISP (aggregates all saudas)
 * @access  Private
 * @query   igst_percentage: number (optional, defaults to 0)
 */
router.get('/isp/:ispId', authenticate, purchaseSummaryController.getIspSummary.bind(purchaseSummaryController));

export default router;

