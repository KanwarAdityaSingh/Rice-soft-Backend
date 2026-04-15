import { Router } from 'express';
import { PackagingController } from '../controllers/packaging.controller';
import { authenticate } from '../middleware/auth.middleware';
import { documentUpload } from '../middleware/upload.middleware';

const router = Router();
const packagingController = new PackagingController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Packaging CRUD routes
router.get('/', packagingController.getAll.bind(packagingController));
router.post('/', packagingController.create.bind(packagingController));
router.post(
  '/:id/upload-packaging-bill',
  documentUpload.single('file'),
  packagingController.uploadPackagingBill.bind(packagingController)
);
router.post('/:id/inventory', packagingController.addInventory.bind(packagingController));
router.get('/:id', packagingController.getById.bind(packagingController));
router.put('/:id', packagingController.update.bind(packagingController));
router.delete('/:id', packagingController.delete.bind(packagingController));

export default router;

