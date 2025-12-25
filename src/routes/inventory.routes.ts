import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const inventoryController = new InventoryController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Inventory routes
router.get('/finished-goods', inventoryController.getFinishedGoods.bind(inventoryController));
router.get('/packets', inventoryController.getPackets.bind(inventoryController));
router.get('/lots', inventoryController.getLots.bind(inventoryController));
router.get('/bags', inventoryController.getBags.bind(inventoryController));
router.get('/summary', inventoryController.getSummary.bind(inventoryController));

export default router;

