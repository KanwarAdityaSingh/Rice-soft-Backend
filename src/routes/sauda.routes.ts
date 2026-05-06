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

/**
 * @route   GET /api/v1/saudas/:id/notification-preview
 * @desc    Get preview of sauda notification content for email and WhatsApp
 * @access  Private
 * @returns email: { subject, html, text }, whatsapp: { message }
 */
router.get(
  '/:id/notification-preview',
  authenticate,
  saudaController.getNotificationPreview.bind(saudaController)
);

/**
 * @route   POST /api/v1/saudas/:id/send-via-email
 * @desc    Send sauda details via email
 * @access  Private
 * @body    emails: string[] (required), file: PDF or HTML attachment (optional), customSubject/customHtml/customText: string (optional)
 */
router.post(
  '/:id/send-via-email',
  authenticate,
  documentUpload.single('file'),
  auditLog('SEND_EMAIL', 'saudas'),
  saudaController.sendViaEmail.bind(saudaController)
);

/**
 * @route   POST /api/v1/saudas/:id/send-via-whatsapp
 * @desc    Send sauda details via WhatsApp
 * @access  Private
 * @body    whatsappNumbers: string[] (required), pdfUrl: string (optional), file: PDF (optional), customMessage: string (optional)
 */
router.post(
  '/:id/send-via-whatsapp',
  authenticate,
  documentUpload.single('file'),
  auditLog('SEND_WHATSAPP', 'saudas'),
  saudaController.sendViaWhatsApp.bind(saudaController)
);

/**
 * @route   POST /api/v1/saudas/payment-advice-preview
 * @desc    Get preview of payment advice notification content for email and WhatsApp
 * @access  Private
 * @body    adviceNumber, vendorName, amount, date (required), bankDetails (optional)
 * @returns email: { subject, html, text }, whatsapp: { message }
 */
router.post(
  '/payment-advice-preview',
  authenticate,
  saudaController.getPaymentAdvicePreview.bind(saudaController)
);

/**
 * @route   POST /api/v1/saudas/send-payment-advice-email
 * @desc    Send payment advice via email
 * @access  Private
 * @body    emails: string[] (required), adviceNumber, vendorName, amount, date (required), bankDetails (optional), file: PDF (required), customSubject/customHtml/customText: string (optional)
 */
router.post(
  '/send-payment-advice-email',
  authenticate,
  documentUpload.single('file'),
  auditLog('SEND_EMAIL', 'payment_advice'),
  saudaController.sendPaymentAdviceViaEmail.bind(saudaController)
);

/**
 * @route   POST /api/v1/saudas/send-payment-advice-whatsapp
 * @desc    Send payment advice via WhatsApp
 * @access  Private
 * @body    whatsappNumbers: string[] (required), adviceNumber, vendorName, amount, date (required), pdfUrl or file (required), customMessage: string (optional)
 */
router.post(
  '/send-payment-advice-whatsapp',
  authenticate,
  documentUpload.single('file'),
  auditLog('SEND_WHATSAPP', 'payment_advice'),
  saudaController.sendPaymentAdviceViaWhatsApp.bind(saudaController)
);

export default router;

