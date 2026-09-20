import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { invoiceDispatchPublicController } from '../controllers/invoice-dispatch-public.controller';

const router = Router();

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.BOS_VERIFY_RATE_LIMIT_MAX || '60', 10),
  message: 'Too many verification requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get(
  '/verify/:token',
  verifyLimiter,
  invoiceDispatchPublicController.verifyByToken.bind(invoiceDispatchPublicController),
);

export default router;
