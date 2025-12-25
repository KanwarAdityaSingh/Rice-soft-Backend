import { Router } from 'express';
import { RecipeController } from '../controllers/recipe.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const recipeController = new RecipeController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Recipe CRUD routes
router.get('/', recipeController.getAll.bind(recipeController));
router.get('/:id', recipeController.getById.bind(recipeController));
router.post('/', recipeController.create.bind(recipeController));
router.put('/:id', recipeController.update.bind(recipeController));
router.delete('/:id', recipeController.delete.bind(recipeController));

export default router;

