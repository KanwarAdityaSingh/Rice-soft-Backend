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
router.use('/rice-codes', riceCodeRoutes);

export default router;

