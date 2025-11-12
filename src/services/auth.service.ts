import { userDAO } from '../dao/user.dao';
import { LoginHistoryDAO } from '../dao/login-history.dao';
import { JWTService } from '../utils/jwt';
import * as UAParser from 'ua-parser-js';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../utils/errors';
import { LoginDTO, User } from '../models/user.model';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

export interface LoginContext {
  userAgent: string;
  ipAddress: string;
  browser: string;
  deviceType: string;
  operatingSystem: string;
}

export interface LoginResult {
  user: User;
  token: string;
  expiresIn: string;
}

export class AuthService {
  private loginHistoryDAO = new LoginHistoryDAO();

  async login(loginData: LoginDTO, context: LoginContext): Promise<LoginResult> {
    const user = await userDAO.findByUsername(loginData.username);
    
    if (!user) {
      logger.warn('Login attempt with unknown username', { 
        username: loginData.username, 
        ip: context.ipAddress 
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.is_active) {
      await this.logLoginAttempt(user.id, context, 'failed', 'Account is inactive');
      throw new UnauthorizedError('Account is inactive');
    }

    const isPasswordValid = await userDAO.verifyPassword(
      user.password_hash,
      loginData.password
    );

    if (!isPasswordValid) {
      await this.logLoginAttempt(user.id, context, 'failed', 'Invalid password');
      throw new UnauthorizedError('Invalid credentials');
    }

    // Generate unique session ID
    const sessionId = randomUUID();

    // Update active session - invalidates all previous sessions
    await userDAO.updateActiveSession(user.id, sessionId);

    // Log successful login
    await this.logLoginAttempt(user.id, context, 'success');

    // Update last login
    await userDAO.updateLastLogin(user.id);

    // Get user information
    const userInfo = await userDAO.findById(user.id);
    if (!userInfo) {
      throw new UnauthorizedError('User not found');
    }

    // Generate JWT token with session ID
    const token = JWTService.generateToken({
      userId: userInfo.id,
      username: userInfo.username,
      sessionId,
    });

    logger.info('User logged in', { userId: user.id, username: user.username });

    return {
      user: userInfo,
      token,
      expiresIn: '24h',
    };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await userDAO.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isOldPasswordValid = await userDAO.verifyPassword(user.password_hash, oldPassword);
    if (!isOldPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const isSamePassword = await userDAO.verifyPassword(user.password_hash, newPassword);
    if (isSamePassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    await userDAO.updatePassword(userId, newPassword);
    logger.info('Password changed', { userId });
  }

  async getLoginHistory(userId: string, filters: any): Promise<any[]> {
    return await this.loginHistoryDAO.findByUserId(userId, filters);
  }

  private async logLoginAttempt(
    userId: string, 
    context: LoginContext, 
    status: 'success' | 'failed', 
    failureReason?: string
  ): Promise<void> {
    await this.loginHistoryDAO.create({
      user_id: userId,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      device_type: context.deviceType,
      browser: context.browser,
      operating_system: context.operatingSystem,
      login_status: status,
      failure_reason: failureReason,
    });
  }

  extractLoginContext(req: any): LoginContext {
    const userAgent = req.get('user-agent') || '';
    const parser = new UAParser.UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    return {
      userAgent,
      ipAddress: req.ip || req.socket.remoteAddress || '',
      browser: `${browser.name} ${browser.version}`,
      deviceType: device.type || 'desktop',
      operatingSystem: `${os.name} ${os.version}`,
    };
  }
}

export const authService = new AuthService();

