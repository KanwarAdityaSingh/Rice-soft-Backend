import { Router } from 'express';
import { PackagingController } from '../controllers/packaging.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const packagingController = new PackagingController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Packaging CRUD routes
router.get('/', packagingController.getAll.bind(packagingController));
router.get('/:id', packagingController.getById.bind(packagingController));
router.post('/', packagingController.create.bind(packagingController));
router.put('/:id', packagingController.update.bind(packagingController));
router.delete('/:id', packagingController.delete.bind(packagingController));

// Packets inventory routes
router.post('/:id/inventory', packagingController.addInventory.bind(packagingController));

export default router;

