import { Router } from 'express';
import { PackagingMaterialController } from '../controllers/packaging-material.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const controller = new PackagingMaterialController();

router.use(authenticate);
router.get('/', controller.getAll.bind(controller));
router.post('/', controller.create.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.put('/:id', controller.update.bind(controller));

export default router;
