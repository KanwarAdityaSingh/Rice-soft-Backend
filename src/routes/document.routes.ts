import { Router } from 'express';
import { documentController } from '../controllers/document.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

// Get all documents (with optional filters)
router.get('/getAllDocuments', authenticate, documentController.getAll.bind(documentController));

// Get document by ID
router.get('/getDocumentById/:id', authenticate, documentController.getById.bind(documentController));

// Get all documents for a specific user
router.get('/getDocumentsByUserId/:userId', authenticate, documentController.getByUserId.bind(documentController));

// Create a new document
router.post(
  '/createDocument',
  authenticate,
  auditLog('CREATE', 'documents'),
  documentController.create.bind(documentController)
);

// Update a document
router.post(
  '/updateDocument/:id',
  authenticate,
  auditLog('UPDATE', 'documents'),
  documentController.update.bind(documentController)
);

// Delete a document
router.post(
  '/deleteDocument/:id',
  authenticate,
  auditLog('DELETE', 'documents'),
  documentController.delete.bind(documentController)
);

export default router;

