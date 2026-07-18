import { Router } from 'express';
import { riceLengthController } from '../controllers/rice-length.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

/**
 * @route   GET /api/v1/riceLengths/getAllRiceLengths
 * @query   include_inactive: boolean (optional)
 */
router.get('/getAllRiceLengths', riceLengthController.getAll.bind(riceLengthController));

/**
 * @route   GET /api/v1/riceLengths/getRiceLengthById/:id
 */
router.get('/getRiceLengthById/:id', riceLengthController.getById.bind(riceLengthController));

router.post(
  '/createRiceLength',
  auditLog('CREATE', 'rice_lengths'),
  riceLengthController.create.bind(riceLengthController)
);

router.post(
  '/updateRiceLength/:id',
  auditLog('UPDATE', 'rice_lengths'),
  riceLengthController.update.bind(riceLengthController)
);

router.post(
  '/deleteRiceLength/:id',
  auditLog('DELETE', 'rice_lengths'),
  riceLengthController.delete.bind(riceLengthController)
);

export default router;
