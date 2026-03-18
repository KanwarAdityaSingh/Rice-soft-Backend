import { Router } from 'express';
import { salesPartyController } from '../controllers/sales-party.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

router.get('/', authenticate, salesPartyController.getAll.bind(salesPartyController));
router.get('/:id', authenticate, salesPartyController.getById.bind(salesPartyController));
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'sales_parties'),
  salesPartyController.create.bind(salesPartyController)
);
router.patch(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'sales_parties'),
  salesPartyController.update.bind(salesPartyController)
);
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'sales_parties'),
  salesPartyController.delete.bind(salesPartyController)
);

export default router;
