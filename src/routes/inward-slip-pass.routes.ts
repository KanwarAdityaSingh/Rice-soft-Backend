import { Router } from 'express';
import { inwardSlipPassController } from '../controllers/inward-slip-pass.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { documentUpload } from '../middleware/upload.middleware';

const router = Router();

/**
 * @route   GET /api/v1/inward-slip-passes
 * @desc    Get all inward slip passes
 * @access  Private
 * @query   sauda_id: UUID
 */
router.get('/', authenticate, inwardSlipPassController.getAll.bind(inwardSlipPassController));

/**
 * @route   GET /api/v1/inward-slip-passes/:id
 * @desc    Get inward slip pass by ID with lots
 * @access  Private
 */
router.get('/:id', authenticate, inwardSlipPassController.getById.bind(inwardSlipPassController));

/**
 * @route   POST /api/v1/inward-slip-passes
 * @desc    Create new inward slip pass with lots
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'inward_slip_passes'),
  inwardSlipPassController.create.bind(inwardSlipPassController)
);

/**
 * @route   PUT /api/v1/inward-slip-passes/:id
 * @desc    Update inward slip pass
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'inward_slip_passes'),
  inwardSlipPassController.update.bind(inwardSlipPassController)
);

/**
 * @route   PATCH /api/v1/inward-slip-passes/:id/status
 * @desc    Update inward slip pass status
 * @access  Private
 */
router.patch(
  '/:id/status',
  authenticate,
  auditLog('UPDATE', 'inward_slip_passes'),
  inwardSlipPassController.updateStatus.bind(inwardSlipPassController)
);

/**
 * @route   POST /api/v1/inward-slip-passes/:id/upload-bill-image
 * @desc    Upload inward slip bill image (image or PDF)
 * @access  Private
 */
router.post(
  '/:id/upload-bill-image',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'inward_slip_passes'),
  inwardSlipPassController.uploadBillImage.bind(inwardSlipPassController)
);

/**
 * @route   DELETE /api/v1/inward-slip-passes/:id
 * @desc    Delete inward slip pass
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'inward_slip_passes'),
  inwardSlipPassController.delete.bind(inwardSlipPassController)
);

/**
 * @route   PUT /api/v1/inward-slip-passes/:id/lots/:lotId
 * @desc    Update inward slip lot
 * @access  Private
 */
router.put(
  '/:id/lots/:lotId',
  authenticate,
  auditLog('UPDATE', 'inward_slip_lots'),
  inwardSlipPassController.updateLot.bind(inwardSlipPassController)
);

/**
 * @route   DELETE /api/v1/inward-slip-passes/:id/lots/:lotId
 * @desc    Delete inward slip lot
 * @access  Private
 */
router.delete(
  '/:id/lots/:lotId',
  authenticate,
  auditLog('DELETE', 'inward_slip_lots'),
  inwardSlipPassController.deleteLot.bind(inwardSlipPassController)
);

export default router;

