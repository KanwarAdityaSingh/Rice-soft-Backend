import { Router } from 'express';
import { purchaseController } from '../controllers/purchase.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/purchases
 * @desc    Get all purchases
 * @access  Private
 * @query   vendor_id: UUID
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

/**
 * @route   POST /api/v1/purchases/:id/link-saudas
 * @desc    Link saudas to purchase
 * @access  Private
 */
router.post(
  '/:id/link-saudas',
  authenticate,
  auditLog('UPDATE', 'purchases'),
  purchaseController.linkSaudas.bind(purchaseController)
);

/**
 * @route   POST /api/v1/purchases/:id/link-inward-slip-passes
 * @desc    Link inward slip passes to purchase
 * @access  Private
 */
router.post(
  '/:id/link-inward-slip-passes',
  authenticate,
  auditLog('UPDATE', 'purchases'),
  purchaseController.linkInwardSlipPasses.bind(purchaseController)
);

/**
 * @route   POST /api/v1/purchases/:id/link-lots
 * @desc    Link lots to purchase
 * @access  Private
 */
router.post(
  '/:id/link-lots',
  authenticate,
  auditLog('UPDATE', 'purchases'),
  purchaseController.linkLots.bind(purchaseController)
);

/**
 * @route   DELETE /api/v1/purchases/:id/unlink-sauda/:saudaId
 * @desc    Unlink sauda from purchase
 * @access  Private
 */
router.delete(
  '/:id/unlink-sauda/:saudaId',
  authenticate,
  auditLog('UPDATE', 'purchases'),
  purchaseController.unlinkSauda.bind(purchaseController)
);

/**
 * @route   DELETE /api/v1/purchases/:id/unlink-inward-slip-pass/:ispId
 * @desc    Unlink inward slip pass from purchase
 * @access  Private
 */
router.delete(
  '/:id/unlink-inward-slip-pass/:ispId',
  authenticate,
  auditLog('UPDATE', 'purchases'),
  purchaseController.unlinkInwardSlipPass.bind(purchaseController)
);

/**
 * @route   DELETE /api/v1/purchases/:id/unlink-lot/:lotId
 * @desc    Unlink lot from purchase
 * @access  Private
 */
router.delete(
  '/:id/unlink-lot/:lotId',
  authenticate,
  auditLog('UPDATE', 'purchases'),
  purchaseController.unlinkLot.bind(purchaseController)
);

/**
 * @route   GET /api/v1/purchases/:id/linked-entities
 * @desc    Get all linked entities for a purchase
 * @access  Private
 */
router.get(
  '/:id/linked-entities',
  authenticate,
  purchaseController.getLinkedEntities.bind(purchaseController)
);

/**
 * @route   POST /api/v1/purchases/:id/recalculate-totals
 * @desc    Recalculate purchase totals from linked lots
 * @access  Private
 */
router.post(
  '/:id/recalculate-totals',
  authenticate,
  auditLog('UPDATE', 'purchases'),
  purchaseController.recalculateTotals.bind(purchaseController)
);

export default router;

