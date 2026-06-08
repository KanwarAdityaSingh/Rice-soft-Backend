import { Router } from 'express';
import { brokerController } from '../controllers/broker.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/brokers/lookupGST
 * @desc    Lookup GST number and get business details
 * @access  Private
 * @query   gst_number: string (15 chars)
 */
router.get('/lookupGST', authenticate, brokerController.lookupGST.bind(brokerController));

/**
 * @route   GET /api/v1/brokers/lookupPAN
 * @desc    Lookup PAN number and get business details
 * @access  Private
 * @query   pan_number: string (10 chars)
 */
router.get('/lookupPAN', authenticate, brokerController.lookupPAN.bind(brokerController));

/**
 * @route   GET /api/v1/brokers/lookupAadhaar
 * @desc    Validate Aadhaar via Surepass and check availability
 * @access  Private
 * @query   aadhaar_number: string (12 digits)
 */
router.get('/lookupAadhaar', authenticate, brokerController.lookupAadhaar.bind(brokerController));

/**
 * @route   GET /api/v1/brokers/verifyBankAccount
 * @desc    Verify bank account details using Surepass API
 * @access  Private
 * @query   id_number: string (9-18 digits), ifsc: string (11 chars)
 */
router.get('/verifyBankAccount', authenticate, brokerController.verifyBankAccount.bind(brokerController));

/**
 * @route   POST /api/v1/brokers/confirm-bank-verification/:id
 * @desc    Verify stored bank_details via Surepass and set bank_details_verified_at / _by
 * @access  Private
 */
router.post(
  '/confirm-bank-verification/:id',
  authenticate,
  auditLog('UPDATE', 'brokers'),
  brokerController.confirmBankVerification.bind(brokerController)
);

/**
 * @route   POST /api/v1/brokers/quickCreateFromPAN
 * @desc    Quick create broker from PAN number (for individual brokers)
 * @access  Private
 */
router.post(
  '/quickCreateFromPAN',
  authenticate,
  auditLog('CREATE', 'brokers'),
  brokerController.createFromPAN.bind(brokerController)
);

/**
 * @route   POST /api/v1/brokers/quickCreateFromGST
 * @desc    Quick create broker from GST number (for company brokers)
 * @access  Private
 */
router.post(
  '/quickCreateFromGST',
  authenticate,
  auditLog('CREATE', 'brokers'),
  brokerController.createFromGST.bind(brokerController)
);

/**
 * @route   GET /api/v1/brokers/getAllBrokers
 * @desc    Get all brokers
 * @access  Private
 * @query   include_inactive: boolean, type: purchase|sale|both, bank_verified: true|false
 */
router.get('/getAllBrokers', authenticate, brokerController.getAll.bind(brokerController));

/**
 * @route   GET /api/v1/brokers/:brokerId/brokerage-commission-summary
 * @desc    Brokerage commission per purchase sauda + total; each line includes party (vendor), ISPs, payment advices
 * @access  Private
 * @query   godown_id, status, from_date, to_date (all optional; period echoed as period_from / period_to)
 */
router.get(
  '/:brokerId/brokerage-commission-summary',
  authenticate,
  brokerController.getBrokerageCommissionSummary.bind(brokerController)
);

/**
 * @route   GET /api/v1/brokers/getBrokerById/:id
 * @desc    Get broker by ID
 * @access  Private
 */
router.get('/getBrokerById/:id', authenticate, brokerController.getById.bind(brokerController));

/**
 * @route   POST /api/v1/brokers/createBroker
 * @desc    Create new broker
 * @access  Private
 */
router.post(
  '/createBroker',
  authenticate,
  auditLog('CREATE', 'brokers'),
  brokerController.create.bind(brokerController)
);

/**
 * @route   POST /api/v1/brokers/updateBroker/:id
 * @desc    Update broker
 * @access  Private
 */
router.post(
  '/updateBroker/:id',
  authenticate,
  auditLog('UPDATE', 'brokers'),
  brokerController.update.bind(brokerController)
);

/**
 * @route   POST /api/v1/brokers/deleteBroker/:id
 * @desc    Delete broker
 * @access  Private
 */
router.post(
  '/deleteBroker/:id',
  authenticate,
  auditLog('DELETE', 'brokers'),
  brokerController.delete.bind(brokerController)
);

export default router;