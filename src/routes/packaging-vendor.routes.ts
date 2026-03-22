import { Router } from 'express';
import { PackagingVendorController } from '../controllers/packaging-vendor.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const packagingVendorController = new PackagingVendorController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Packaging vendor CRUD routes
router.get('/', packagingVendorController.getAll.bind(packagingVendorController));

/**
 * @route   GET /api/v1/packaging-vendors/lookupGST (aliases: /lookupgst, /lookup-gst)
 * @desc    Lookup GST number — same contract as GET /vendors/lookupGST
 * @access  Private
 * @query   gst_number: string (15 chars)
 */
const lookupGST = packagingVendorController.lookupGST.bind(packagingVendorController);
router.get('/lookupGST', lookupGST);
router.get('/lookupgst', lookupGST);
router.get('/lookup-gst', lookupGST);

/**
 * @route   GET /api/v1/packaging-vendors/gst/lookup
 * @desc    Legacy path — same handler as /lookupGST
 */
router.get('/gst/lookup', lookupGST);

router.get('/:id', packagingVendorController.getById.bind(packagingVendorController));
router.post('/', packagingVendorController.create.bind(packagingVendorController));
router.put('/:id', packagingVendorController.update.bind(packagingVendorController));
router.delete('/:id', packagingVendorController.delete.bind(packagingVendorController));

export default router;

