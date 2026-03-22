import { Router } from 'express';
import { godownController } from '../controllers/godown.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/godowns/lookupGST (aliases: /lookupgst, /lookup-gst)
 * @desc    Lookup GST number and get business details (prefill godown master)
 * @access  Private
 * @query   gst_number: string (15 chars)
 */
const lookupGST = godownController.lookupGST.bind(godownController);
router.get('/lookupGST', authenticate, lookupGST);
router.get('/lookupgst', authenticate, lookupGST);
router.get('/lookup-gst', authenticate, lookupGST);

router.get('/', authenticate, godownController.getAll.bind(godownController));
router.get('/:id', authenticate, godownController.getById.bind(godownController));
router.post('/', authenticate, auditLog('CREATE', 'godowns'), godownController.create.bind(godownController));
router.patch('/:id', authenticate, auditLog('UPDATE', 'godowns'), godownController.update.bind(godownController));
router.delete('/:id', authenticate, auditLog('DELETE', 'godowns'), godownController.delete.bind(godownController));

export default router;
