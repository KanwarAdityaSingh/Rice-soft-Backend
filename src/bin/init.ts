#!/usr/bin/env node

import { createApp } from '../app';
import { appConfig, assertSafePublicOtpConfig } from '../config/app.config';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { couponExpiryService } from '../services/coupon-expiry.service';
import { couponPayoutWorker } from '../workers/coupon-payout.worker';

async function initializeServer() {
  try {
    // Log to console immediately to ensure we see output
    console.log('🚀 Starting Rice Soft Backend Server...');
    logger.info('Starting Rice Soft Backend Server...');

    assertSafePublicOtpConfig();
    if (appConfig.coupons.publicFixedOtp) {
      logger.warn('Public coupon OTP: fixed OTP enabled', {
        smsEnabled: appConfig.coupons.publicSmsEnabled,
        productionUatAllowlist: appConfig.env === 'production',
        allowlistedPhoneCount: appConfig.coupons.publicFixedOtpPhones.length,
      });
    }

    // Test database connection
    console.log('🔌 Testing database connection...');
    logger.info('Testing database connection...');
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    console.log('✅ Database connection successful');
    logger.info('Database connection successful');

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(appConfig.port, appConfig.host, () => {
      logger.info(`Server running in ${appConfig.env} mode`);
      logger.info(`Server listening on ${appConfig.host}:${appConfig.port}`);
      logger.info(`API available at http://${appConfig.host}:${appConfig.port}${appConfig.apiPrefix}`);

      if (appConfig.coupons.expiryCronEnabled) {
        setInterval(() => {
          couponExpiryService.expireEligibleCoupons().catch((error) => {
            logger.error('Coupon expiry cron failed', error);
          });
        }, appConfig.coupons.expiryCronMs);
        logger.info('Coupon expiry cron started');
      }

      if (appConfig.coupons.payoutEnabled && appConfig.coupons.payoutAuto) {
        couponPayoutWorker.start();
        logger.info('Coupon payout worker started (AUTO mode)');
      } else if (appConfig.coupons.payoutEnabled) {
        logger.info('Coupon payout AUTO disabled — CMS must initiate Cashfree payouts');
      }
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await db.close();
          logger.info('Database connections closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });
  } catch (error) {
    // Always log to console to ensure visibility
    console.error('❌ Failed to initialize server:', error);
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

// Initialize server
initializeServer();

