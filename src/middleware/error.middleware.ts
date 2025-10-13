import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ResponseHandler } from '../utils/response';
import { isDevelopment } from '../config/app.config';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  if (err instanceof AppError) {
    logger.error('Application error:', {
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });

    return ResponseHandler.error(res, err.message, err.statusCode);
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return ResponseHandler.error(res, err.message, 400);
  }

  if (err.name === 'UnauthorizedError') {
    return ResponseHandler.error(res, 'Unauthorized', 401);
  }

  // Log unexpected errors
  logger.error('Unexpected error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Send generic error in production, detailed error in development
  const message = isDevelopment ? err.message : 'Internal Server Error';
  const errorDetails = isDevelopment ? err.stack : undefined;

  return ResponseHandler.error(
    res,
    errorDetails || message,
    500,
    'An unexpected error occurred'
  );
};

export const notFoundHandler = (req: Request, res: Response): Response => {
  return ResponseHandler.error(
    res,
    `Route ${req.method} ${req.path} not found`,
    404,
    'Resource not found'
  );
};


