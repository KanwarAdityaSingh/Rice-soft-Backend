import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const productController = new ProductController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Static option endpoints (must come before /:id route)
router.get('/brands', productController.getBrands.bind(productController));
router.get('/hsn-codes', productController.getHsnCodes.bind(productController));

// Product CRUD routes
router.get('/', productController.getAll.bind(productController));
// Rates sub-resource (must come before /:id so "rates" is not treated as id)
router.get('/:id/rates/history', productController.getRateHistory.bind(productController));
router.get('/:id/rates', productController.getRates.bind(productController));
router.put('/:id/rates', productController.setRates.bind(productController));

router.get('/:id', productController.getById.bind(productController));
router.post('/', productController.create.bind(productController));
router.put('/:id', productController.update.bind(productController));
router.delete('/:id', productController.delete.bind(productController));

export default router;

