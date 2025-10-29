import { Router } from 'express';
import { salesmanController } from '../controllers/salesman.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/salesmen/getAllSalesmen
 * @desc    Get all salesmen
 * @access  Private
 */
router.get('/getAllSalesmen', authenticate, salesmanController.getAll.bind(salesmanController));

/**
 * @route   GET /api/v1/salesmen/getSalesmanById/:id
 * @desc    Get salesman by ID
 * @access  Private
 */
router.get('/getSalesmanById/:id', authenticate, salesmanController.getById.bind(salesmanController));

/**
 * @route   POST /api/v1/salesmen/createSalesman
 * @desc    Create new salesman
 * @access  Private
 */
router.post(
  '/createSalesman',
  authenticate,
  auditLog('CREATE', 'salesmen'),
  salesmanController.create.bind(salesmanController)
);

/**
 * @route   POST /api/v1/salesmen/updateSalesman/:id
 * @desc    Update salesman
 * @access  Private
 */
router.post(
  '/updateSalesman/:id',
  authenticate,
  auditLog('UPDATE', 'salesmen'),
  salesmanController.update.bind(salesmanController)
);

/**
 * @route   POST /api/v1/salesmen/deleteSalesman/:id
 * @desc    Delete salesman
 * @access Private
 */
router.post(
  '/deleteSalesman/:id',
  authenticate,
  auditLog('DELETE', 'salesmen'),
  salesmanController.delete.bind(salesmanController)
);

export default router;