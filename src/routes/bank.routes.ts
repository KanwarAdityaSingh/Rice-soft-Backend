import { Router } from 'express';
import { bankController } from '../controllers/bank.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * Bank Routes
 * Base path: /api/v1/bank
 */

// IFSC Lookup - Get bank details by IFSC code
// GET /api/v1/bank/lookupIFSC?ifsc=HDFC0001234
router.get('/lookupIFSC', authenticate, bankController.lookupIFSC.bind(bankController));

// IFSC Format Validation
// GET /api/v1/bank/validateIFSC?ifsc=HDFC0001234
router.get('/validateIFSC', authenticate, bankController.validateIFSC.bind(bankController));

export default router;

