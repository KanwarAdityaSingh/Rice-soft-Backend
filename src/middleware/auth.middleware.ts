import { Request, Response, NextFunction } from 'express';
import { JWTService, TokenPayload } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import { userDAO } from '../dao/user.dao';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: TokenPayload;
  isSessionValid?: boolean;
}

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);
    const payload = JWTService.verifyToken(token);

    // Verify user still exists and is active
    const user = await userDAO.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (!user.is_active) {
      throw new UnauthorizedError('User account is inactive');
    }

    req.user = payload;

    // Validate session - check if session ID in token matches active session in DB
    const tokenSessionId = payload.sessionId;
    
    if (!tokenSessionId) {
      // Old token without session ID - mark as invalid
      req.isSessionValid = false;
      logger.warn('Token missing session ID', { userId: payload.userId });
    } else if (user.active_session_id !== tokenSessionId) {
      // Session ID mismatch - user logged in from another device
      req.isSessionValid = false;
      logger.info('Session invalidated - user logged in from another device', {
        userId: payload.userId,
        tokenSessionId,
        activeSessionId: user.active_session_id,
      });
    } else {
      // Session is valid
      req.isSessionValid = true;
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Role-based authorization removed - will be implemented dynamically during development

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = JWTService.verifyToken(token);
      req.user = payload;
    }

    next();
  } catch {
    // Ignore auth errors for optional auth
    next();
  }
};

