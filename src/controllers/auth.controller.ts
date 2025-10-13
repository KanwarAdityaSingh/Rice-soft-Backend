import { Request, Response, NextFunction } from 'express';
import { userDAO } from '../dao/user.dao';
import { JWTService } from '../utils/jwt';
import { ResponseHandler } from '../utils/response';
import { validate, loginSchema } from '../utils/validators';
import { UnauthorizedError } from '../utils/errors';
import { LoginDTO, LoginResponse, UserResponse } from '../models/user.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const loginData = validate<LoginDTO>(loginSchema, req.body);

      const user = await userDAO.findByUsername(loginData.username);
      if (!user) {
        throw new UnauthorizedError('Invalid credentials');
      }

      if (!user.is_active) {
        throw new UnauthorizedError('Account is inactive');
      }

      const isPasswordValid = await userDAO.verifyPassword(
        user.password_hash,
        loginData.password
      );
      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid credentials');
      }

      // Update last login
      await userDAO.updateLastLogin(user.id);

      // Get user with role information
      const userWithRole = await userDAO.findById(user.id);
      if (!userWithRole) {
        throw new UnauthorizedError('User not found');
      }

      // Generate JWT token
      const token = JWTService.generateToken({
        userId: userWithRole.id,
        username: userWithRole.username,
        roleId: userWithRole.role_id,
        roleName: userWithRole.role_name,
      });

      const userResponse: UserResponse = {
        id: userWithRole.id,
        username: userWithRole.username,
        email: userWithRole.email,
        role_id: userWithRole.role_id,
        role_name: userWithRole.role_name,
        full_name: userWithRole.full_name,
        phone: userWithRole.phone,
        is_active: userWithRole.is_active,
        last_login: userWithRole.last_login?.toISOString() || null,
        created_at: userWithRole.created_at.toISOString(),
        updated_at: userWithRole.updated_at.toISOString(),
      };

      const response: LoginResponse = {
        user: userResponse,
        token,
        expires_in: '24h',
      };

      logger.info('User logged in', { userId: user.id, username: user.username });

      return ResponseHandler.success(res, response, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async logout(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      // In a stateless JWT system, logout is handled client-side
      // Here we just log the action
      if (req.user) {
        logger.info('User logged out', { userId: req.user.userId });
      }

      return ResponseHandler.success(res, null, 'Logout successful');
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const user = await userDAO.findById(req.user.userId);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      const userResponse: UserResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
        full_name: user.full_name,
        phone: user.phone,
        is_active: user.is_active,
        last_login: user.last_login?.toISOString() || null,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, userResponse);
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();


