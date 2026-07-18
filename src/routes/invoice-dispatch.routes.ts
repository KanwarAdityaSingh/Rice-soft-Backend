import { Router } from 'express';
import { invoiceDispatchController } from '../controllers/invoice-dispatch.controller';
import { eInvoiceController } from '../controllers/e-invoice.controller';
import { eWayBillController } from '../controllers/e-way-bill.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';
import { documentUpload } from '../middleware/upload.middleware';

const router = Router();

router.get('/', authenticate, invoiceDispatchController.getAll.bind(invoiceDispatchController));
router.get('/:id/e-invoice', authenticate, eInvoiceController.getByDispatchId.bind(eInvoiceController));
router.get('/:id/e-way-bill', authenticate, eWayBillController.getByDispatchId.bind(eWayBillController));
router.get('/:id', authenticate, invoiceDispatchController.getById.bind(invoiceDispatchController));
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'invoice_dispatches'),
  invoiceDispatchController.create.bind(invoiceDispatchController)
);
router.post(
  '/:id/confirm',
  authenticate,
  auditLog('UPDATE', 'invoice_dispatches'),
  invoiceDispatchController.confirm.bind(invoiceDispatchController)
);
router.post(
  '/:id/upload-bilti',
  authenticate,
  documentUpload.single('file'),
  auditLog('UPDATE', 'invoice_dispatches'),
  invoiceDispatchController.uploadBilti.bind(invoiceDispatchController)
);
router.post(
  '/:id/e-invoice',
  authenticate,
  auditLog('CREATE', 'e_invoices'),
  eInvoiceController.generate.bind(eInvoiceController)
);
router.post(
  '/:id/e-way-bill',
  authenticate,
  auditLog('CREATE', 'e_way_bills'),
  eWayBillController.generate.bind(eWayBillController)
);

export default router;
