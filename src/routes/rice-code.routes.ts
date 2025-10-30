import { Router } from 'express';
import { RiceCodeController } from '../controllers/rice-code.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const riceCodeController = new RiceCodeController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Rice code CRUD routes
router.get('/getAllRiceCodes', riceCodeController.getAll.bind(riceCodeController));
router.get('/getRiceCodeById/:id', riceCodeController.getById.bind(riceCodeController));
router.get('/getRiceCodeByName', riceCodeController.getByName.bind(riceCodeController));
router.post('/createRiceCode', riceCodeController.create.bind(riceCodeController));
router.post('/updateRiceCode/:id', riceCodeController.update.bind(riceCodeController));
router.post('/deleteRiceCode/:id', riceCodeController.delete.bind(riceCodeController));

export default router;

