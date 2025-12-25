import { Router } from 'express';
import { BatchController } from '../controllers/batch.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const batchController = new BatchController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Batch CRUD routes
router.get('/', batchController.getAll.bind(batchController));
router.get('/:id', batchController.getById.bind(batchController));
router.post('/', batchController.create.bind(batchController));
router.put('/:id', batchController.update.bind(batchController));

// Batch usage tracking routes
router.get('/:id/lot-usage', batchController.getLotUsage.bind(batchController));
router.get('/:id/rice-code-usage', batchController.getRiceCodeUsage.bind(batchController));

export default router;

