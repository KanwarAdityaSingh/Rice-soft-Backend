import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { appConfig } from './config/app.config';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import routes from './routes';
import { logger } from './utils/logger';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(
    cors({
      origin: appConfig.cors.origin,
      credentials: true,
    })
  );

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use((req, _res, next) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    next();
  });

  // API routes
  app.use(appConfig.apiPrefix, routes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}


