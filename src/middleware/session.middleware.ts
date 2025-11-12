import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { userDAO } from '../dao/user.dao';
import { logger } from '../utils/logger';

export interface SessionRequest extends AuthRequest {
  isSessionValid?: boolean;
}

/**
 * Middleware to validate user session
 * Checks if the session ID in the JWT token matches the active session in the database
 * Sets req.isSessionValid flag for response handler to include in API responses
 */
export const validateSession = async (
  req: SessionRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Default to true if user is not authenticated (public endpoints)
    if (!req.user) {
      req.isSessionValid = true;
      return next();
    }

    // Get session ID from token
    const tokenSessionId = req.user.sessionId;

    // If token doesn't have a session ID (old tokens), mark as invalid
    if (!tokenSessionId) {
      req.isSessionValid = false;
      logger.warn('Token missing session ID', { userId: req.user.userId });
      return next();
    }

    // Fetch user's active session from database
    const user = await userDAO.findById(req.user.userId);
    
    if (!user) {
      req.isSessionValid = false;
      logger.warn('User not found during session validation', { userId: req.user.userId });
      return next();
    }

    // Compare session IDs
    if (user.active_session_id !== tokenSessionId) {
      req.isSessionValid = false;
      logger.info('Session invalidated - user logged in from another device', {
        userId: req.user.userId,
        tokenSessionId,
        activeSessionId: user.active_session_id,
      });
      return next();
    }

    // Session is valid
    req.isSessionValid = true;
    next();
  } catch (error) {
    // On error, mark session as invalid to be safe
    logger.error('Error validating session', { error, userId: req.user?.userId });
    req.isSessionValid = false;
    next();
  }
};

