import { Router } from 'express';
import { ExpenseController } from '../controllers/expense.controller';
import { authenticate } from '../middleware/auth.middleware';
import { businessCardUpload } from '../middleware/upload.middleware';

const router = Router();
const expenseController = new ExpenseController();

router.use(authenticate);

// Special routes that must come before /:id
router.get('/available-entities', expenseController.getAvailableEntities.bind(expenseController));

// Main CRUD routes
router.get('/', expenseController.getAll.bind(expenseController));
router.get('/:id', expenseController.getById.bind(expenseController));
router.post('/', expenseController.create.bind(expenseController));
router.patch('/:id', expenseController.update.bind(expenseController));
router.delete('/:id', expenseController.delete.bind(expenseController));

// Status transitions
router.post('/:id/status', expenseController.updateStatus.bind(expenseController));
router.post('/:id/confirm', expenseController.confirm.bind(expenseController));
router.post(
  '/:id/mark-paid',
  businessCardUpload.single('file'),
  expenseController.markPaid.bind(expenseController)
);
router.post('/:id/cancel', expenseController.cancel.bind(expenseController));

router.post(
  '/:id/upload-payment-proof',
  businessCardUpload.single('file'),
  expenseController.uploadPaymentProof.bind(expenseController)
);
router.post(
  '/:id/upload-bill',
  businessCardUpload.single('file'),
  expenseController.uploadBill.bind(expenseController)
);

export default router;
