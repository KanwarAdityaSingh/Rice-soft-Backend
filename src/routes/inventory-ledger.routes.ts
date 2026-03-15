import { Router } from 'express';
import { inventoryLedgerController } from '../controllers/inventory-ledger.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, inventoryLedgerController.get.bind(inventoryLedgerController));

export default router;
