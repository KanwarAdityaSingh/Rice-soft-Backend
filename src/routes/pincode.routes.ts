import { Router } from 'express';
import { pincodeController } from '../controllers/pincode.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   GET /api/v1/pincode/lookup
 * @desc    Lookup pincode and get post office details
 * @access  Private
 * @query   pincode: string (6 digits)
 */
router.get('/lookup', authenticate, pincodeController.lookup.bind(pincodeController));

export default router;

