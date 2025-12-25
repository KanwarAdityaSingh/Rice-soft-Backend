import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const productController = new ProductController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Brands endpoint (must come before /:id route)
router.get('/brands', productController.getBrands.bind(productController));

// Product CRUD routes
router.get('/', productController.getAll.bind(productController));
router.get('/:id', productController.getById.bind(productController));
router.post('/', productController.create.bind(productController));
router.put('/:id', productController.update.bind(productController));
router.delete('/:id', productController.delete.bind(productController));

// Product-Recipe relationship routes
router.post('/:id/recipes', productController.addRecipe.bind(productController));
router.delete('/:id/recipes/:recipeId', productController.removeRecipe.bind(productController));

export default router;

