import { Router } from 'express';
import { purchaseController } from '../controllers/purchase.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { documentUpload } from '../middleware/upload.middleware';

const router = Router();

/**
 * @route   GET /api/v1/purchases
 * @desc    Get all purchases
 * @access  Private
 * @query   vendor_id: UUID, sauda_id: UUID
 */
router.get('/', authenticate, purchaseController.getAll.bind(purchaseController));

/**
 * @route   GET /api/v1/purchases/:id
 * @desc    Get purchase by ID
 * @access  Private
 */
router.get('/:id', authenticate, purchaseController.getById.bind(purchaseController));

/**
 * @route   POST /api/v1/purchases
 * @desc    Create new purchase
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'purchases'),
  purchaseController.create.bind(purchaseController)
);

/**
 * @route   PUT /api/v1/purchases/:id
 * @desc    Update purchase
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'purchases'),
  purchaseController.update.bind(purchaseController)
);

/**
 * @route   POST /api/v1/purchases/:id/upload-transportation-bill
 * @desc    Upload transportation bill (image or PDF)
 * @access  Private
 */
router.post(
  '/:id/upload-transportation-bill',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'purchases'),
  purchaseController.uploadTransportationBill.bind(purchaseController)
);

/**
 * @route   POST /api/v1/purchases/:id/upload-purchase-bill
 * @desc    Upload purchase bill (image or PDF)
 * @access  Private
 */
router.post(
  '/:id/upload-purchase-bill',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'purchases'),
  purchaseController.uploadPurchaseBill.bind(purchaseController)
);

/**
 * @route   POST /api/v1/purchases/:id/upload-bilti
 * @desc    Upload bilti (image or PDF)
 * @access  Private
 */
router.post(
  '/:id/upload-bilti',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'purchases'),
  purchaseController.uploadBilti.bind(purchaseController)
);

/**
 * @route   POST /api/v1/purchases/:id/upload-eway-bill
 * @desc    Upload e-way bill (image or PDF)
 * @access  Private
 */
router.post(
  '/:id/upload-eway-bill',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'purchases'),
  purchaseController.uploadEwayBill.bind(purchaseController)
);

/**
 * @route   DELETE /api/v1/purchases/:id
 * @desc    Delete purchase
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'purchases'),
  purchaseController.delete.bind(purchaseController)
);

export default router;

