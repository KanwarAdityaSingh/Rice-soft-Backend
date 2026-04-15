import { Router } from 'express';
import { vendorSiteController } from '../controllers/vendor-site.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/sites
 * @desc    List additional addresses for a vendor (vendor native address is on the vendor record)
 * @access  Private
 * @query   vendor_id: UUID (required), include_inactive: boolean (optional)
 */
router.get('/', authenticate, vendorSiteController.getAll.bind(vendorSiteController));

/**
 * @route   GET /api/v1/sites/:id
 * @desc    Get site by id
 * @access  Private
 */
router.get('/:id', authenticate, vendorSiteController.getById.bind(vendorSiteController));

/**
 * @route   POST /api/v1/sites
 * @desc    Create site (body.vendor_id links to vendor)
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'vendor_sites'),
  vendorSiteController.create.bind(vendorSiteController)
);

/**
 * @route   PUT /api/v1/sites/:id
 * @desc    Update site
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'vendor_sites'),
  vendorSiteController.update.bind(vendorSiteController)
);

/**
 * @route   DELETE /api/v1/sites/:id
 * @desc    Soft-delete site
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'vendor_sites'),
  vendorSiteController.delete.bind(vendorSiteController)
);

export default router;
