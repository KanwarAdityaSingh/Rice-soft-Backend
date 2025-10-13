import rateLimit from 'express-rate-limit';
import { appConfig } from '../config/app.config';

export const generalLimiter = rateLimit({
  windowMs: appConfig.security.rateLimitWindowMs,
  max: appConfig.security.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});


