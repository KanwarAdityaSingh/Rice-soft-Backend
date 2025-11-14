import { Router } from 'express';
import { paymentAdviceController } from '../controllers/payment-advice.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { documentUpload } from '../middleware/upload.middleware';

const router = Router();

/**
 * @route   GET /api/v1/payment-advices
 * @desc    Get all payment advices
 * @access  Private
 * @query   purchase_id: UUID, status: pending|completed|failed
 */
router.get('/', authenticate, paymentAdviceController.getAll.bind(paymentAdviceController));

/**
 * @route   GET /api/v1/payment-advices/:id
 * @desc    Get payment advice by ID with charges
 * @access  Private
 */
router.get('/:id', authenticate, paymentAdviceController.getById.bind(paymentAdviceController));

/**
 * @route   POST /api/v1/payment-advices
 * @desc    Create new payment advice with charges
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'payment_advices'),
  paymentAdviceController.create.bind(paymentAdviceController)
);

/**
 * @route   PUT /api/v1/payment-advices/:id
 * @desc    Update payment advice
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'payment_advices'),
  paymentAdviceController.update.bind(paymentAdviceController)
);

/**
 * @route   POST /api/v1/payment-advices/:id/upload-slip
 * @desc    Upload payment slip (image or PDF)
 * @access  Private
 */
router.post(
  '/:id/upload-slip',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'payment_advices'),
  paymentAdviceController.uploadSlip.bind(paymentAdviceController)
);

/**
 * @route   POST /api/v1/payment-advices/:id/charges
 * @desc    Add charge to payment advice
 * @access  Private
 */
router.post(
  '/:id/charges',
  authenticate,
  auditLog('UPDATE', 'payment_advices'),
  paymentAdviceController.addCharge.bind(paymentAdviceController)
);

/**
 * @route   DELETE /api/v1/payment-advices/:id/charges/:chargeId
 * @desc    Remove charge from payment advice
 * @access  Private
 */
router.delete(
  '/:id/charges/:chargeId',
  authenticate,
  auditLog('UPDATE', 'payment_advices'),
  paymentAdviceController.removeCharge.bind(paymentAdviceController)
);

/**
 * @route   GET /api/v1/payment-advices/:id/net-payable
 * @desc    Get calculated net payable amount
 * @access  Private
 */
router.get('/:id/net-payable', authenticate, paymentAdviceController.getNetPayable.bind(paymentAdviceController));

/**
 * @route   DELETE /api/v1/payment-advices/:id
 * @desc    Delete payment advice
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'payment_advices'),
  paymentAdviceController.delete.bind(paymentAdviceController)
);

export default router;

