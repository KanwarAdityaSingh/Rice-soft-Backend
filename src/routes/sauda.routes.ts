import { Router } from 'express';
import { saudaController } from '../controllers/sauda.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { documentUpload } from '../middleware/upload.middleware';

const router = Router();

/**
 * @route   GET /api/v1/saudas
 * @desc    Get all saudas
 * @access  Private
 * @query   include_inactive: boolean, status: draft|active|completed|cancelled, sauda_type: exgodown|for, purchaser_id: UUID
 */
router.get('/', authenticate, saudaController.getAll.bind(saudaController));

/**
 * @route   GET /api/v1/saudas/:id
 * @desc    Get sauda by ID
 * @access  Private
 */
router.get('/:id', authenticate, saudaController.getById.bind(saudaController));

/**
 * @route   POST /api/v1/saudas
 * @desc    Create new sauda
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'saudas'),
  saudaController.create.bind(saudaController)
);

/**
 * @route   PUT /api/v1/saudas/:id
 * @desc    Update sauda
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'saudas'),
  saudaController.update.bind(saudaController)
);

/**
 * @route   PATCH /api/v1/saudas/:id/status
 * @desc    Update sauda status
 * @access  Private
 */
router.patch(
  '/:id/status',
  authenticate,
  auditLog('UPDATE', 'saudas'),
  saudaController.updateStatus.bind(saudaController)
);

/**
 * @route   POST /api/v1/saudas/:id/upload-cooked-rice-image
 * @desc    Upload cooked rice image
 * @access  Private
 */
router.post(
  '/:id/upload-cooked-rice-image',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'saudas'),
  saudaController.uploadCookedRiceImage.bind(saudaController)
);

/**
 * @route   POST /api/v1/saudas/:id/upload-uncooked-rice-image
 * @desc    Upload uncooked rice image
 * @access  Private
 */
router.post(
  '/:id/upload-uncooked-rice-image',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'saudas'),
  saudaController.uploadUncookedRiceImage.bind(saudaController)
);

/**
 * @route   DELETE /api/v1/saudas/:id
 * @desc    Delete sauda
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'saudas'),
  saudaController.delete.bind(saudaController)
);

export default router;

