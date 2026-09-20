import { Router } from 'express';
import { packagingVendorController } from '../controllers/packaging-vendor.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

/**
 * Master Vendor (packaging suppliers).
 * Mounted at /master-vendors and aliased at /packaging-vendors.
 * KYC OCR/verify: use shared /kyc/gstin/ocr, /kyc/pan/ocr, /kyc/gstin/advanced, etc.
 */

router.get('/suggest', packagingVendorController.suggest.bind(packagingVendorController));

const lookupGST = packagingVendorController.lookupGST.bind(packagingVendorController);
router.get('/lookupGST', lookupGST);
router.get('/lookupgst', lookupGST);
router.get('/lookup-gst', lookupGST);
router.get('/gst/lookup', lookupGST);

router.get('/', packagingVendorController.getAll.bind(packagingVendorController));
router.get('/:id', packagingVendorController.getById.bind(packagingVendorController));
router.post(
  '/',
  auditLog('CREATE', 'packaging_vendors'),
  packagingVendorController.create.bind(packagingVendorController)
);
router.patch(
  '/:id',
  auditLog('UPDATE', 'packaging_vendors'),
  packagingVendorController.update.bind(packagingVendorController)
);
router.put(
  '/:id',
  auditLog('UPDATE', 'packaging_vendors'),
  packagingVendorController.update.bind(packagingVendorController)
);
router.delete(
  '/:id',
  auditLog('UPDATE', 'packaging_vendors'),
  packagingVendorController.delete.bind(packagingVendorController)
);

export default router;
