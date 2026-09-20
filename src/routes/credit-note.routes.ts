import { Router } from 'express';
import { creditNoteController } from '../controllers/credit-note.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { documentUpload } from '../middleware/upload.middleware';

const router = Router();

router.get('/', authenticate, creditNoteController.getAll.bind(creditNoteController));
router.get(
  '/eligible-invoices',
  authenticate,
  creditNoteController.listEligibleInvoices.bind(creditNoteController)
);
router.get(
  '/invoice-context/:invoiceDispatchId',
  authenticate,
  creditNoteController.getInvoiceContext.bind(creditNoteController)
);
router.get(
  '/:id/preview',
  authenticate,
  creditNoteController.preview.bind(creditNoteController)
);
router.get('/:id', authenticate, creditNoteController.getById.bind(creditNoteController));
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'credit_notes'),
  creditNoteController.create.bind(creditNoteController)
);
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'credit_notes'),
  creditNoteController.update.bind(creditNoteController)
);
router.post(
  '/:id/confirm',
  authenticate,
  auditLog('UPDATE', 'credit_notes'),
  creditNoteController.confirm.bind(creditNoteController)
);
router.post(
  '/:id/cancel',
  authenticate,
  auditLog('UPDATE', 'credit_notes'),
  creditNoteController.cancel.bind(creditNoteController)
);
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'credit_notes'),
  creditNoteController.delete.bind(creditNoteController)
);
router.post(
  '/:id/attachments/:type',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'credit_notes'),
  creditNoteController.uploadAttachment.bind(creditNoteController)
);

export default router;
