import { Router } from 'express';
import { BatchController } from '../controllers/batch.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const batchController = new BatchController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Batch CRUD routes
router.get('/', batchController.getAll.bind(batchController));
router.post('/', batchController.create.bind(batchController));

// Stage 2: Product attachment routes (must come before /:id)
router.post('/:id/products', batchController.addProduct.bind(batchController));
router.get('/:id/products', batchController.getProducts.bind(batchController));
router.delete('/:id/products/:productId', batchController.removeProduct.bind(batchController));

// Stage 3: Packaging attachment routes (must come before /:id)
router.post('/:id/packaging', batchController.addPackaging.bind(batchController));
router.get('/:id/packaging', batchController.getPackaging.bind(batchController));
router.delete('/:id/packaging/:packagingId', batchController.removePackaging.bind(batchController));

// Batch detail routes
router.get('/:id', batchController.getById.bind(batchController));
router.put('/:id', batchController.update.bind(batchController));

// Batch usage tracking routes
router.get('/:id/lot-usage', batchController.getLotUsage.bind(batchController));
router.get('/:id/rice-code-usage', batchController.getRiceCodeUsage.bind(batchController));

// Batch inventory audit route - Get all inventory changes caused by this batch
router.get('/:id/inventory-audit', batchController.getInventoryAudit.bind(batchController));

export default router;

