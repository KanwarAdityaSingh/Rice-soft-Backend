import { Router } from 'express';
import { salesSaudaController } from '../controllers/sales-sauda.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

router.get('/', authenticate, salesSaudaController.getAll.bind(salesSaudaController));
router.get('/:id', authenticate, salesSaudaController.getById.bind(salesSaudaController));
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'sales_saudas'),
  salesSaudaController.create.bind(salesSaudaController)
);
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'sales_saudas'),
  salesSaudaController.update.bind(salesSaudaController)
);
router.post(
  '/:id/finalize',
  authenticate,
  auditLog('UPDATE', 'sales_saudas'),
  salesSaudaController.finalize.bind(salesSaudaController)
);
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'sales_saudas'),
  salesSaudaController.delete.bind(salesSaudaController)
);

export default router;
