import { Router } from 'express';
import { replenishmentController } from '../controllers/replenishment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();
const c = replenishmentController;

router.get('/truck-sizes', authenticate, c.getTruckSizes.bind(c));
router.put(
  '/truck-sizes',
  authenticate,
  auditLog('UPDATE', 'truck_size_configs'),
  c.putTruckSizes.bind(c)
);

router.get('/stock', authenticate, c.getStock.bind(c));
router.get('/ledger', authenticate, c.getLedger.bind(c));

router.post('/preview', authenticate, c.preview.bind(c));

router.get('/plans', authenticate, c.listPlans.bind(c));
router.post(
  '/plans',
  authenticate,
  auditLog('CREATE', 'replenishment_plans'),
  c.createPlan.bind(c)
);
router.get('/plans/:id', authenticate, c.getPlan.bind(c));
router.post(
  '/plans/:id/commit',
  authenticate,
  auditLog('UPDATE', 'replenishment_plans'),
  c.commitPlan.bind(c)
);
router.post(
  '/plans/:id/cancel',
  authenticate,
  auditLog('UPDATE', 'replenishment_plans'),
  c.cancelPlan.bind(c)
);

export default router;
