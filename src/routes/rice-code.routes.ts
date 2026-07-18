import { Router } from 'express';
import { riceCodeController } from '../controllers/rice-code.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/getRiceCategories', riceCodeController.getRiceCategories.bind(riceCodeController));
router.get('/getAllRiceCodes', riceCodeController.getAll.bind(riceCodeController));
router.get('/getRiceCodeById/:id', riceCodeController.getById.bind(riceCodeController));
router.get('/getRiceCodeByName', riceCodeController.getByName.bind(riceCodeController));
router.get('/getRiceVariants', riceCodeController.getRiceVariants.bind(riceCodeController));
router.get('/getRiceTypes', riceCodeController.getRiceTypes.bind(riceCodeController));
router.post('/createRiceCode', riceCodeController.create.bind(riceCodeController));
router.post('/updateRiceCode/:id', riceCodeController.update.bind(riceCodeController));
router.post('/deleteRiceCode/:id', riceCodeController.delete.bind(riceCodeController));

export default router;

