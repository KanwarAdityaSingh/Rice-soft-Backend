import { Router } from 'express';
import { ExpenseCategoryController } from '../controllers/expense-category.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const expenseCategoryController = new ExpenseCategoryController();

router.use(authenticate);

router.get('/', expenseCategoryController.getAll.bind(expenseCategoryController));
router.get('/:id', expenseCategoryController.getById.bind(expenseCategoryController));
router.post('/', expenseCategoryController.create.bind(expenseCategoryController));
router.patch('/:id', expenseCategoryController.update.bind(expenseCategoryController));
router.delete('/:id', expenseCategoryController.delete.bind(expenseCategoryController));

export default router;
