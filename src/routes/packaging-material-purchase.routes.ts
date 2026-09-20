import { Router } from 'express';
import { PackagingMaterialPurchaseController } from '../controllers/packaging-material-purchase.controller';
import { authenticate } from '../middleware/auth.middleware';
import { documentUpload } from '../middleware/upload.middleware';

const router = Router();
const controller = new PackagingMaterialPurchaseController();

router.use(authenticate);
router.get('/', controller.getAll.bind(controller));
router.post('/', controller.create.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.post(
  '/:id/upload-invoice',
  documentUpload.single('file'),
  controller.uploadInvoice.bind(controller)
);

export default router;
