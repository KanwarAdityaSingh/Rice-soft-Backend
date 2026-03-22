import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import salesmanRoutes from './salesman.routes';
import vendorRoutes from './vendor.routes';
import brokerRoutes from './broker.routes';
import leadRoutes from './lead.routes';
import leaderboardRoutes from './leaderboard.routes';
import documentRoutes from './document.routes';
import riceCodeRoutes from './rice-code.routes';
import pincodeRoutes from './pincode.routes';
import bankRoutes from './bank.routes';
import transporterRoutes from './transporter.routes';
import vehicleRoutes from './vehicle.routes';
import saudaRoutes from './sauda.routes';
import inwardSlipPassRoutes from './inward-slip-pass.routes';
import lotRoutes from './lot.routes';
import kaantaRoutes from './kaanta.routes';
import purchaseSummaryRoutes from './purchase-summary.routes';
import paymentAdviceRoutes from './payment-advice.routes';
import recipeRoutes from './recipe.routes';
import productRoutes from './product.routes';
import packagingRoutes from './packaging.routes';
import packagingVendorRoutes from './packaging-vendor.routes';
import batchRoutes from './batch.routes';
import inventoryRoutes from './inventory.routes';
import salesPartyRoutes from './sales-party.routes';
import salesSaudaRoutes from './sales-sauda.routes';
import invoiceDispatchRoutes from './invoice-dispatch.routes';
import inventoryLedgerRoutes from './inventory-ledger.routes';
import creditNoteRoutes from './credit-note.routes';
import suggestedRateRoutes from './suggested-rate.routes';
import godownRoutes from './godown.routes';

const router = Router();

// Health check endpoint
router.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/salesmen', salesmanRoutes);
router.use('/vendors', vendorRoutes);
router.use('/brokers', brokerRoutes);
router.use('/leads', leadRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/documents', documentRoutes);
router.use('/riceCodes', riceCodeRoutes);
router.use('/pincode', pincodeRoutes);
router.use('/bank', bankRoutes);
router.use('/transporters', transporterRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/saudas', saudaRoutes);
router.use('/inward-slip-passes', inwardSlipPassRoutes);
router.use('/lots', lotRoutes);
router.use('/kaantas', kaantaRoutes);
router.use('/purchase-summary', purchaseSummaryRoutes);
router.use('/payment-advices', paymentAdviceRoutes);
router.use('/recipes', recipeRoutes);
router.use('/products', productRoutes);
router.use('/packaging', packagingRoutes);
router.use('/packaging-vendors', packagingVendorRoutes);
router.use('/batches', batchRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/sales-parties', salesPartyRoutes);
router.use('/sales-saudas', salesSaudaRoutes);
router.use('/invoice-dispatches', invoiceDispatchRoutes);
router.use('/inventory-ledger', inventoryLedgerRoutes);
router.use('/credit-notes', creditNoteRoutes);
router.use('/suggested-rate', suggestedRateRoutes);
router.use('/godowns', godownRoutes);

export default router;

