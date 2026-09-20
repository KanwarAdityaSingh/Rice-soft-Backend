import { Router } from 'express';
import { saudaWeightVarianceController } from '../controllers/sauda-weight-variance.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   GET /api/v1/sauda-weight-variances
 * @desc    List Ex-Godown weight variance records (kanta_weight vs bill_weight), paginated + searchable
 * @access  Private
 * @query   sauda_id, payment_advice_id, broker_id, purchaser_id, direction: short|excess, search, page, limit
 */
router.get('/', authenticate, saudaWeightVarianceController.getAll.bind(saudaWeightVarianceController));

/**
 * @route   GET /api/v1/sauda-weight-variances/:id
 * @desc    Get a single weight variance record
 * @access  Private
 */
router.get('/:id', authenticate, saudaWeightVarianceController.getById.bind(saudaWeightVarianceController));

export default router;
