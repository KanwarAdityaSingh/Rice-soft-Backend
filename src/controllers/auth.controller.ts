import { Request, Response, NextFunction } from 'express';
import { userDAO } from '../dao/user.dao';
import { LoginHistoryDAO } from '../dao/login-history.dao';
import { JWTService } from '../utils/jwt';
import * as UAParser from 'ua-parser-js';
import { ResponseHandler } from '../utils/response';
import { validate, loginSchema, changePasswordSchema } from '../utils/validators';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../utils/errors';
import { LoginDTO, LoginResponse, UserResponse } from '../models/user.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export class AuthController {
  private loginHistoryDAO = new LoginHistoryDAO();

  async login(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const loginData = validate<LoginDTO>(loginSchema, req.body);

      // Extract device and browser info from request
      const userAgent = req.get('user-agent') || '';
      const parser = new UAParser.UAParser(userAgent);
      const browser = parser.getBrowser();
      const os = parser.getOS();
      const device = parser.getDevice();

      // Get IP address
      const ipAddress = req.ip || req.socket.remoteAddress || '';

      const user = await userDAO.findByUsername(loginData.username);
      
      if (!user) {
        // Log failed login attempt for unknown username
        logger.warn('Login attempt with unknown username', { username: loginData.username, ip: ipAddress });
        throw new UnauthorizedError('Invalid credentials');
      }

      if (!user.is_active) {
        // Log failed login attempt
        await this.loginHistoryDAO.create({
          user_id: user.id,
          ip_address: ipAddress,
          user_agent: userAgent,
          device_type: device.type || 'desktop',
          browser: `${browser.name} ${browser.version}`,
          operating_system: `${os.name} ${os.version}`,
          login_status: 'failed',
          failure_reason: 'Account is inactive',
        });
        throw new UnauthorizedError('Account is inactive');
      }

      const isPasswordValid = await userDAO.verifyPassword(
        user.password_hash,
        loginData.password
      );

      if (!isPasswordValid) {
        // Log failed login attempt
        await this.loginHistoryDAO.create({
          user_id: user.id,
          ip_address: ipAddress,
          user_agent: userAgent,
          device_type: device.type || 'desktop',
          browser: `${browser.name} ${browser.version}`,
          operating_system: `${os.name} ${os.version}`,
          login_status: 'failed',
          failure_reason: 'Invalid password',
        });
        throw new UnauthorizedError('Invalid credentials');
      }

      // Log successful login
      await this.loginHistoryDAO.create({
        user_id: user.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        device_type: device.type || 'desktop',
        browser: `${browser.name} ${browser.version}`,
        operating_system: `${os.name} ${os.version}`,
        login_status: 'success',
      });

      // Update last login
      await userDAO.updateLastLogin(user.id);

      // Get user information
      const userInfo = await userDAO.findById(user.id);
      if (!userInfo) {
        throw new UnauthorizedError('User not found');
      }

      // Generate JWT token
      const token = JWTService.generateToken({
        userId: userInfo.id,
        username: userInfo.username,
      });

      const userResponse: UserResponse = {
        id: userInfo.id,
        username: userInfo.username,
        email: userInfo.email,
        full_name: userInfo.full_name,
        phone: userInfo.phone,
        user_type: userInfo.user_type,
        is_active: userInfo.is_active,
        last_login: userInfo.last_login?.toISOString() || null,
        created_at: userInfo.created_at.toISOString(),
        updated_at: userInfo.updated_at.toISOString(),
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
        full_name: user.full_name,
        phone: user.phone,
        user_type: user.user_type,
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

  async changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { old_password, new_password } = validate<{ old_password: string; new_password: string }>(changePasswordSchema, req.body);

      const user = await userDAO.findById(req.user.userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify old password
      const isOldPasswordValid = await userDAO.verifyPassword(user.password_hash, old_password);
      if (!isOldPasswordValid) {
        throw new UnauthorizedError('Current password is incorrect');
      }

      // Check if new password is different from old password
      const isSamePassword = await userDAO.verifyPassword(user.password_hash, new_password);
      if (isSamePassword) {
        throw new BadRequestError('New password must be different from current password');
      }

      // Update password
      await userDAO.updatePassword(req.user.userId, new_password);

      logger.info('Password changed', { userId: req.user.userId });

      return ResponseHandler.success(res, null, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }

  async getLoginHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { limit, offset, status, start_date, end_date } = req.query;

      const filters = {
        user_id: req.user.userId,
        login_status: status as any,
        start_date: start_date as string,
        end_date: end_date as string,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      };

      const loginHistory = await this.loginHistoryDAO.findByUserId(req.user.userId, filters);

      return ResponseHandler.success(res, loginHistory, 'Login history retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();


