import { Request, Response, NextFunction } from 'express';
import { JWTService, TokenPayload } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import { userDAO } from '../dao/user.dao';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: TokenPayload;
  isSessionValid?: boolean;
  file?: Express.Multer.File;
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

    const tokenSessionId = payload.sessionId;
    if (!tokenSessionId) {
      throw new UnauthorizedError('Session expired. Please log in again.');
    }

    if (user.active_session_id !== tokenSessionId) {
      logger.info('Session invalidated — user logged in elsewhere or session revoked', {
        userId: payload.userId,
        tokenSessionId,
        activeSessionId: user.active_session_id,
      });
      throw new UnauthorizedError('Session expired. Please log in again.');
    }

    req.isSessionValid = true;

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

