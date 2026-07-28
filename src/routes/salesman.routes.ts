import { Router } from 'express';
import { salesmanController } from '../controllers/salesman.controller';
import { salesmanCommissionReportController } from '../controllers/salesman-commission-report.controller';
import { authenticate } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/salesmen/commission-types
 * @desc    List available salesman commission type options
 * @access  Private
 */
router.get(
  '/commission-types',
  authenticate,
  salesmanController.getCommissionTypes.bind(salesmanController)
);

/**
 * @route   GET /api/v1/salesmen/reports/monthly
 * @desc    Monthly salesperson performance report
 */
router.get(
  '/reports/monthly',
  authenticate,
  salesmanCommissionReportController.monthlyReport.bind(salesmanCommissionReportController)
);

/**
 * @route   GET /api/v1/salesmen/reports/monthly/details
 * @desc    Drill-down for monthly KPIs (lines | orders | customers | new_customers)
 */
router.get(
  '/reports/monthly/details',
  authenticate,
  salesmanCommissionReportController.monthlyDetailsReport.bind(salesmanCommissionReportController)
);

/**
 * @route   GET /api/v1/salesmen/reports/returns
 * @desc    Sales return report for a salesman
 */
router.get(
  '/reports/returns',
  authenticate,
  salesmanCommissionReportController.returnsReport.bind(salesmanCommissionReportController)
);

/**
 * @route   GET /api/v1/salesmen/reports/commission
 * @desc    Commission report (transaction or monthly view)
 */
router.get(
  '/reports/commission',
  authenticate,
  salesmanCommissionReportController.commissionReport.bind(salesmanCommissionReportController)
);

/**
 * @route   GET /api/v1/salesmen/reports/outstanding
 * @desc    Outstanding / ageing report for a salesman (v1: full invoice outstanding)
 */
router.get(
  '/reports/outstanding',
  authenticate,
  salesmanCommissionReportController.outstandingReport.bind(salesmanCommissionReportController)
);

/**
 * @route   GET /api/v1/salesmen/commission-entries
 * @desc    List commission ledger entries
 */
router.get(
  '/commission-entries',
  authenticate,
  salesmanCommissionReportController.listEntries.bind(salesmanCommissionReportController)
);

/**
 * @route   GET /api/v1/salesmen/commission-entries/:id
 */
router.get(
  '/commission-entries/:id',
  authenticate,
  salesmanCommissionReportController.getEntry.bind(salesmanCommissionReportController)
);

/**
 * @route   POST /api/v1/salesmen/commission-entries/:id/approve
 */
router.post(
  '/commission-entries/:id/approve',
  authenticate,
  auditLog('UPDATE', 'salesman_commission_entries'),
  salesmanCommissionReportController.approve.bind(salesmanCommissionReportController)
);

/**
 * @route   POST /api/v1/salesmen/commission-entries/:id/mark-paid
 */
router.post(
  '/commission-entries/:id/mark-paid',
  authenticate,
  auditLog('UPDATE', 'salesman_commission_entries'),
  salesmanCommissionReportController.markPaid.bind(salesmanCommissionReportController)
);

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
router.get(
  '/getSalesmanById/:id',
  authenticate,
  salesmanController.getById.bind(salesmanController)
);

/**
 * @route   GET /api/v1/salesmen/:id/salary-history
 * @desc    List salary change history for a salesman
 * @access  Private
 */
router.get(
  '/:id/salary-history',
  authenticate,
  salesmanController.getSalaryHistory.bind(salesmanController)
);

/**
 * @route   POST /api/v1/salesmen/createSalesman
 * @desc    Create new salesman (salesperson master)
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
 * @route   POST /api/v1/salesmen/confirm-bank-verification/:id
 * @desc    Confirm bank_details against stored KYC bank snapshot
 * @access  Private
 */
router.post(
  '/confirm-bank-verification/:id',
  authenticate,
  auditLog('UPDATE', 'salesmen'),
  salesmanController.confirmBankVerification.bind(salesmanController)
);

/**
 * @route   POST /api/v1/salesmen/deleteSalesman/:id
 * @desc    Delete salesman
 * @access  Private
 */
router.post(
  '/deleteSalesman/:id',
  authenticate,
  auditLog('DELETE', 'salesmen'),
  salesmanController.delete.bind(salesmanController)
);

export default router;
