import { Router } from 'express';
import { parameterController } from '../controllers/parameter.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/parameters
 * @query   batch_id, product_id, inward_slip_pass_id (all optional UUIDs; combined with AND)
 */
router.get('/', authenticate, parameterController.getAll.bind(parameterController));

/**
 * @route   GET /api/v1/parameters/:id
 */
router.get('/:id', authenticate, parameterController.getById.bind(parameterController));

router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'parameters'),
  parameterController.create.bind(parameterController)
);

router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'parameters'),
  parameterController.update.bind(parameterController)
);

router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'parameters'),
  parameterController.delete.bind(parameterController)
);

export default router;
