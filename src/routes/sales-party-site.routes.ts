import { Router } from 'express';
import { salesPartySiteController } from '../controllers/sales-party-site.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/sales-party-sites
 * @desc    List additional addresses for a sales party (primary address is on the sales party record)
 * @access  Private
 * @query   sales_party_id: UUID (required), include_inactive: boolean (optional)
 */
router.get('/', authenticate, salesPartySiteController.getAll.bind(salesPartySiteController));

/**
 * @route   GET /api/v1/sales-party-sites/:id
 * @desc    Get site by id
 * @access  Private
 */
router.get('/:id', authenticate, salesPartySiteController.getById.bind(salesPartySiteController));

/**
 * @route   POST /api/v1/sales-party-sites
 * @desc    Create site (body.sales_party_id links to sales party)
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'sales_party_sites'),
  salesPartySiteController.create.bind(salesPartySiteController)
);

/**
 * @route   PUT /api/v1/sales-party-sites/:id
 * @desc    Update site
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'sales_party_sites'),
  salesPartySiteController.update.bind(salesPartySiteController)
);

/**
 * @route   DELETE /api/v1/sales-party-sites/:id
 * @desc    Delete site
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'sales_party_sites'),
  salesPartySiteController.delete.bind(salesPartySiteController)
);

export default router;
