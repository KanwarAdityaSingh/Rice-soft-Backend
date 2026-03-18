import { Router } from 'express';
import { SuggestedRateController } from '../controllers/suggested-rate.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const controller = new SuggestedRateController();

router.use(authenticate);

// GET /suggested-rate?product_id=...&packaging_id=...
router.get('/', controller.getSuggestedRate.bind(controller));

export default router;
