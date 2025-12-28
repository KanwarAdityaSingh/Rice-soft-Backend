import { Router } from 'express';
import { PackagingVendorController } from '../controllers/packaging-vendor.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const packagingVendorController = new PackagingVendorController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Packaging vendor CRUD routes
router.get('/', packagingVendorController.getAll.bind(packagingVendorController));
router.get('/:id', packagingVendorController.getById.bind(packagingVendorController));
router.post('/', packagingVendorController.create.bind(packagingVendorController));
router.put('/:id', packagingVendorController.update.bind(packagingVendorController));
router.delete('/:id', packagingVendorController.delete.bind(packagingVendorController));

export default router;

