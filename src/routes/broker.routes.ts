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
 * @route   POST /api/v1/brokers/quickCreateFromGST
 * @desc    Quick create broker from GST number
 * @access  Private
 */
router.post(
  '/quickCreateFromGST',
  authenticate,
  auditLog('CREATE', 'brokers'),
  brokerController.createFromGST.bind(brokerController)
);

/**
 * @route   POST /api/v1/brokers/quickCreateFromPAN
 * @desc    Quick create broker from PAN number
 * @access  Private
 */
router.post(
  '/quickCreateFromPAN',
  authenticate,
  auditLog('CREATE', 'brokers'),
  brokerController.createFromPAN.bind(brokerController)
);

/**
 * @route   GET /api/v1/brokers/getAllBrokers
 * @desc    Get all brokers
 * @access  Private
 * @query   include_inactive: boolean, type: purchase|sale|both
 */
router.get('/getAllBrokers', authenticate, brokerController.getAll.bind(brokerController));

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