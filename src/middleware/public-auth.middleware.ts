import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config/app.config';
import { UnauthorizedError } from '../utils/errors';

export interface PublicAuthRequest extends Request {
  publicUser?: {
    phone: string;
  };
}

export const authenticatePublicUser = (
  req: PublicAuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);

    // Use same JWT secret as admin (or create separate PUBLIC_JWT_SECRET if needed)
    const decoded = jwt.verify(token, appConfig.jwt.secret) as {
      phone: string;
      type: string;
    };

    // Verify it's a public token (not admin)
    if (decoded.type !== 'public') {
      throw new UnauthorizedError('Invalid token type');
    }

    req.publicUser = {
      phone: decoded.phone,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
};
