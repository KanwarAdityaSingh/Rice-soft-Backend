import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { authenticate } from '../middleware/auth.middleware';
import { businessCardUpload } from '../middleware/upload.middleware';

const router = Router();
const productController = new ProductController();

router.use(authenticate);

// Static option endpoints (must come before /:id route)
router.get('/brands', productController.getBrands.bind(productController));
router.get('/hsn-codes', productController.getHsnCodes.bind(productController));
router.get('/rice-categories', productController.getRiceCategories.bind(productController));
router.get('/rice-variants', productController.getRiceVariants.bind(productController));
router.get('/suggest', productController.suggest.bind(productController));
router.post(
  '/upload-bag-image',
  businessCardUpload.single('file'),
  productController.uploadBagImage.bind(productController)
);
router.post(
  '/extract-bag-image',
  businessCardUpload.single('file'),
  productController.extractBagImage.bind(productController)
);

router.get('/', productController.getAll.bind(productController));
router.get('/:id/rates/history', productController.getRateHistory.bind(productController));
router.patch('/:id/rates/history/:historyId', productController.updateRateHistoryPoint.bind(productController));
router.get('/:id/rates', productController.getRates.bind(productController));
router.put('/:id/rates', productController.setRates.bind(productController));
router.post(
  '/:id/upload-bag-image',
  businessCardUpload.single('file'),
  productController.uploadBagImageForProduct.bind(productController)
);

router.get('/:id', productController.getById.bind(productController));
router.post('/', productController.create.bind(productController));
router.put('/:id', productController.update.bind(productController));
router.delete('/:id', productController.delete.bind(productController));

export default router;
