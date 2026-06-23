import { Router } from 'express';
import { transporterController } from '../controllers/transporter.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/transporters/lookupGST
 * @desc    Lookup GST number and get business details
 * @access  Private
 * @query   gst_number: string (15 chars)
 */
router.get('/lookupGST', authenticate, transporterController.lookupGST.bind(transporterController));

/**
 * @route   GET /api/v1/transporters/lookupPAN
 * @desc    Lookup PAN number and get business details
 * @access  Private
 * @query   pan_number: string (10 chars)
 */
router.get('/lookupPAN', authenticate, transporterController.lookupPAN.bind(transporterController));

/**
 * @route   GET /api/v1/transporters/verifyBankAccount
 * @desc    Verify bank account details using Surepass API
 * @access  Private
 * @query   id_number: string (9-18 digits), ifsc: string (11 chars), transporter_id: UUID (optional, persist bank KYC)
 */
router.get('/verifyBankAccount', authenticate, transporterController.verifyBankAccount.bind(transporterController));

/**
 * @route   GET /api/v1/transporters
 * @desc    Get all transporters
 * @access  Private
 * @query   include_inactive: boolean, is_verified: boolean (optional filter)
 */
router.get('/', authenticate, transporterController.getAll.bind(transporterController));

/**
 * @route   GET /api/v1/transporters/:id
 * @desc    Get transporter by ID
 * @access  Private
 */
router.get('/:id', authenticate, transporterController.getById.bind(transporterController));

/**
 * @route   POST /api/v1/transporters
 * @desc    Create new transporter
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  auditLog('CREATE', 'transporters'),
  transporterController.create.bind(transporterController)
);

/**
 * @route   PUT /api/v1/transporters/:id
 * @desc    Update transporter
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  auditLog('UPDATE', 'transporters'),
  transporterController.update.bind(transporterController)
);

/**
 * @route   DELETE /api/v1/transporters/:id
 * @desc    Delete transporter
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('DELETE', 'transporters'),
  transporterController.delete.bind(transporterController)
);

export default router;

