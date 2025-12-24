import { Router } from 'express';
import { kaantaController } from '../controllers/kaanta.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/kaantas
 * @desc    Get all kaantas
 * @access  Private
 * @query   sauda_id: UUID (optional filter)
 * @query   inward_slip_pass_id: UUID (optional filter)
 */
router.get('/', authenticate, kaantaController.getAll.bind(kaantaController));

/**
 * @route   GET /api/v1/kaantas/:id
 * @desc    Get kaanta by ID
 * @access  Private
 */
router.get('/:id', authenticate, kaantaController.getById.bind(kaantaController));

/**
 * @route   POST /api/v1/kaantas
 * @desc    Create new kaanta (auto-creates lot)
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'kaantas'),
  kaantaController.create.bind(kaantaController)
);

/**
 * @route   PUT /api/v1/kaantas/:id
 * @desc    Update kaanta
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'kaantas'),
  kaantaController.update.bind(kaantaController)
);

/**
 * @route   DELETE /api/v1/kaantas/:id
 * @desc    Delete kaanta (cascade deletes lot)
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'kaantas'),
  kaantaController.delete.bind(kaantaController)
);

export default router;

