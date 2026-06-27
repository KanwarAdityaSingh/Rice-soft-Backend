import { Request, Response, NextFunction } from 'express';
import { userDAO } from '../dao/user.dao';
import { LoginHistoryDAO } from '../dao/login-history.dao';
import * as UAParser from 'ua-parser-js';
import { ResponseHandler } from '../utils/response';
import { validate, loginSchema, changePasswordSchema, requestOtpSchema, verifyOtpSchema } from '../utils/validators';
import { UnauthorizedError, NotFoundError, BadRequestError, RefreshAuthError } from '../utils/errors';
import { LoginDTO, LoginResponse, RefreshTokenResponse, UserResponse } from '../models/user.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { otpService } from '../services/otp.service';
import { authSessionService } from '../services/auth-session.service';
import { appConfig } from '../config/app.config';
import { setRefreshTokenCookie, clearRefreshTokenCookie } from '../utils/auth-cookies';

export class AuthController {
  private loginHistoryDAO = new LoginHistoryDAO();

  private toUserResponse(user: {
    id: string;
    username: string;
    email: string | null;
    full_name: string;
    phone: string | null;
    user_type: UserResponse['user_type'];
    is_active: boolean;
    last_login: Date | null;
    created_at: Date;
    updated_at: Date;
  }): UserResponse {
    return {
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
  }

  private async completeLogin(
    res: Response,
    userInfo: NonNullable<Awaited<ReturnType<typeof userDAO.findById>>>
  ): Promise<Response> {
    const session = await authSessionService.createSession(userInfo.id, userInfo.username);
    setRefreshTokenCookie(res, session.refreshToken);

    const permissions = (userInfo as { custom_permissions?: LoginResponse['permissions'] })
      .custom_permissions || null;

    const response: LoginResponse = {
      user: this.toUserResponse(userInfo),
      token: session.accessToken,
      expires_in: session.accessExpiresIn,
      refresh_expires_in: session.refreshExpiresIn,
      permissions,
    };

    return ResponseHandler.success(res, response, 'Login successful');
  }

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

      logger.info('User logged in', { userId: user.id, username: user.username });

      return this.completeLogin(res, userInfo);
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const refreshToken = req.cookies?.[appConfig.auth.refreshCookieName];
      if (!refreshToken || typeof refreshToken !== 'string') {
        throw new UnauthorizedError('Refresh token required');
      }

      const session = await authSessionService.rotateRefreshToken(refreshToken);
      setRefreshTokenCookie(res, session.refreshToken);

      const response: RefreshTokenResponse = {
        token: session.accessToken,
        expires_in: session.accessExpiresIn,
        refresh_expires_in: session.refreshExpiresIn,
      };

      return ResponseHandler.success(res, response, 'Token refreshed');
    } catch (error) {
      if (error instanceof RefreshAuthError && error.sessionCleared) {
        clearRefreshTokenCookie(res);
      }
      next(error);
    }
  }

  async logout(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (req.user) {
        await authSessionService.revokeSession(req.user.userId);
        logger.info('User logged out', { userId: req.user.userId });
      }

      clearRefreshTokenCookie(res);
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

      const userResponse: UserResponse = this.toUserResponse(user);

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

      // Update password and invalidate all sessions
      await userDAO.updatePassword(req.user.userId, new_password);
      await authSessionService.revokeSession(req.user.userId);
      clearRefreshTokenCookie(res);

      logger.info('Password changed', { userId: req.user.userId });

      return ResponseHandler.success(
        res,
        null,
        'Password changed successfully. Please log in again with your new password.'
      );
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

  async requestOtp(req: Request, res: Response, _next: NextFunction): Promise<Response | void> {
    try {
      const { phone } = validate<{ phone: string }>(requestOtpSchema, req.body);
      const userAgent = req.get('user-agent') || '';
      const ipAddress = req.ip || req.socket.remoteAddress || '';
      await otpService.generateAndSend(phone, { ipAddress, userAgent });
      return ResponseHandler.success(res, { sent: true }, 'If the phone exists, an OTP has been sent', 202);
    } catch (error) {
      // For security, return 202 even in most errors to avoid enumeration
      logger.warn('requestOtp encountered an error; responding generically', { error });
      return ResponseHandler.success(res, { sent: true }, 'If the phone exists, an OTP has been sent', 202);
    }
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { phone, otp } = validate<{ phone: string; otp: string }>(verifyOtpSchema, req.body);

      // Extract device and browser info from request
      const userAgent = req.get('user-agent') || '';
      const parser = new UAParser.UAParser(userAgent);
      const browser = parser.getBrowser();
      const os = parser.getOS();
      const device = parser.getDevice();

      // Get IP address
      const ipAddress = req.ip || req.socket.remoteAddress || '';

      // Attempt verification (may throw)
      const { userId } = await otpService.verifyOtp(phone, otp);

      // Get user information
      const userInfo = await userDAO.findById(userId);
      if (!userInfo) {
        throw new UnauthorizedError('User not found');
      }

      await this.loginHistoryDAO.create({
        user_id: userInfo.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        device_type: device.type || 'desktop',
        browser: `${browser.name} ${browser.version}`,
        operating_system: `${os.name} ${os.version}`,
        login_status: 'success',
      });

      // Update last login
      await userDAO.updateLastLogin(userInfo.id);

      logger.info('User logged in via OTP', { userId: userInfo.id, username: userInfo.username });

      return this.completeLogin(res, userInfo);
    } catch (error: any) {
      try {
        // Attempt to log failed OTP verification if we can resolve a user by phone
        const phoneRaw = req.body?.phone as string | undefined;
        if (phoneRaw) {
          // Reuse otpService normalization
          const normalizedPhone = otpService.normalizePhone(phoneRaw);
          const user = await userDAO.findByPhone(normalizedPhone);
          if (user) {
            const userAgent = req.get('user-agent') || '';
            const parser = new UAParser.UAParser(userAgent);
            const browser = parser.getBrowser();
            const os = parser.getOS();
            const device = parser.getDevice();
            const ipAddress = req.ip || req.socket.remoteAddress || '';
            await this.loginHistoryDAO.create({
              user_id: user.id,
              ip_address: ipAddress,
              user_agent: userAgent,
              device_type: device.type || 'desktop',
              browser: `${browser.name} ${browser.version}`,
              operating_system: `${os.name} ${os.version}`,
              login_status: 'failed',
              failure_reason: error?.message || 'OTP verification failed',
            });
          }
        }
      } catch (logErr) {
        // Swallow logging errors
        logger.warn('Failed to log OTP verification failure', { logErr });
      }
      return next(error);
    }
  }
}

export const authController = new AuthController();

 
