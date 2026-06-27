import { Router } from 'express';
import { kaantaController } from '../controllers/kaanta.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { documentUpload } from '../middleware/upload.middleware';

const router = Router();

/**
 * @route   POST /api/v1/kaantas/extract-weights
 * @desc    Extract kaanta slip weights (and optional vehicle/ticket) from uploaded image via AI
 * @access  Private
 * @body    file: image (required), inward_slip_pass_id: UUID (optional, for vehicle mismatch check)
 */
router.post(
  '/extract-weights',
  authenticate,
  documentUpload.single('file'),
  kaantaController.extractWeights.bind(kaantaController)
);

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

/**
 * @route   POST /api/v1/kaantas/:id/upload-khaali-kaanta-parchi
 * @desc    Upload khaali kaanta parchi (empty kaanta receipt) image
 * @access  Private
 */
router.post(
  '/:id/upload-khaali-kaanta-parchi',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'kaantas'),
  kaantaController.uploadKhaaliKaantaParchi.bind(kaantaController)
);

/**
 * @route   POST /api/v1/kaantas/:id/upload-bhara-kaanta-parchi
 * @desc    Upload bhara kaanta parchi (filled kaanta receipt) image
 * @access  Private
 */
router.post(
  '/:id/upload-bhara-kaanta-parchi',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'kaantas'),
  kaantaController.uploadBharaKaantaParchi.bind(kaantaController)
);

/**
 * @route   POST /api/v1/kaantas/:id/upload-combined-parchi
 * @desc    Upload combined kaanta parchi (single slip with gross, tare, net)
 * @access  Private
 */
router.post(
  '/:id/upload-combined-parchi',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'kaantas'),
  kaantaController.uploadCombinedKaantaParchi.bind(kaantaController)
);

export default router;

