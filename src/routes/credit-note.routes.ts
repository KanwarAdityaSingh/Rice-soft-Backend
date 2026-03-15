import { Router } from 'express';
import { creditNoteController } from '../controllers/credit-note.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

router.get('/', authenticate, creditNoteController.getAll.bind(creditNoteController));
router.get('/:id', authenticate, creditNoteController.getById.bind(creditNoteController));
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'credit_notes'),
  creditNoteController.create.bind(creditNoteController)
);
router.post(
  '/:id/confirm',
  authenticate,
  auditLog('UPDATE', 'credit_notes'),
  creditNoteController.confirm.bind(creditNoteController)
);

export default router;
