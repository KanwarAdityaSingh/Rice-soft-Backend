import { db } from '../database/connection';
import { User, CreateUserDTO, UpdateUserDTO } from '../models/user.model';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';
import { appConfig } from '../config/app.config';

export class UserDAO {
  async findAll(includeInactive = false, userType?: string): Promise<User[]> {
    let query = `
      SELECT 
        id, username, email, password_hash, full_name, phone, user_type,
        is_active, last_login, created_at, updated_at, created_by, updated_by,
        custom_permissions, active_session_id
      FROM users
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (!includeInactive) {
      query += ` AND is_active = true`;
    }

    if (userType) {
      query += ` AND user_type = $${paramCount++}`;
      params.push(userType);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query<User>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<User | null> {
    const query = `
      SELECT 
        id, username, email, password_hash, full_name, phone, user_type,
        is_active, last_login, created_at, updated_at, created_by, updated_by,
        custom_permissions, active_session_id
      FROM users
      WHERE id = $1
    `;
    const result = await db.query<User>(query, [id]);
    return result.rows[0] || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash, full_name, phone, user_type,
             is_active, last_login, created_at, updated_at, created_by, updated_by,
             custom_permissions, active_session_id
      FROM users
      WHERE username = $1
    `;
    const result = await db.query<User>(query, [username]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash, full_name, phone, user_type,
             is_active, last_login, created_at, updated_at, created_by, updated_by,
             custom_permissions, active_session_id
      FROM users
      WHERE email = $1
    `;
    const result = await db.query<User>(query, [email]);
    return result.rows[0] || null;
  }

  async findByPhone(normalizedPhoneE164Digits: string): Promise<User | null> {
    // normalizedPhoneE164Digits expected like 91XXXXXXXXXX
    const nationalTen = normalizedPhoneE164Digits.slice(-10);
    const query = `
      SELECT id, username, email, password_hash, full_name, phone, user_type,
             is_active, last_login, created_at, updated_at, created_by, updated_by,
             custom_permissions, active_session_id
      FROM users
      WHERE is_active = true
        AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') IN ($1, $2)
      LIMIT 1
    `;
    const result = await db.query<User>(query, [normalizedPhoneE164Digits, nationalTen]);
    return result.rows[0] || null;
  }

  async create(userData: CreateUserDTO): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, appConfig.security.bcryptRounds);
    
    const query = `
      INSERT INTO users (username, email, password_hash, full_name, phone, user_type, is_active, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, username, email, password_hash, full_name, phone, user_type,
                is_active, last_login, created_at, updated_at, created_by, updated_by,
                custom_permissions, active_session_id
    `;
    
    const values = [
      userData.username,
      userData.email || null,
      hashedPassword,
      userData.full_name,
      userData.phone || null,
      userData.user_type || 'custom',
      userData.is_active !== undefined ? userData.is_active : true,
      userData.created_by || null
    ];

    const result = await db.query<User>(query, values);
    const user = result.rows[0];

    logger.info('User created', {
      userId: user.id,
      username: user.username,
      email: user.email
    });

    return user;
  }

  async update(id: string, userData: UpdateUserDTO): Promise<User | null> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (userData.username !== undefined) {
      updateFields.push(`username = $${paramCount++}`);
      values.push(userData.username);
    }

    if (userData.email !== undefined) {
      updateFields.push(`email = $${paramCount++}`);
      values.push(userData.email);
    }

    if (userData.password !== undefined) {
      const hashedPassword = await bcrypt.hash(userData.password, appConfig.security.bcryptRounds);
      updateFields.push(`password_hash = $${paramCount++}`);
      values.push(hashedPassword);
    }

    if (userData.full_name !== undefined) {
      updateFields.push(`full_name = $${paramCount++}`);
      values.push(userData.full_name);
    }

    if (userData.phone !== undefined) {
      updateFields.push(`phone = $${paramCount++}`);
      values.push(userData.phone);
    }

    if (userData.user_type !== undefined) {
      updateFields.push(`user_type = $${paramCount++}`);
      values.push(userData.user_type);
    }

    if (userData.is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(userData.is_active);
    }

    if (userData.updated_by !== undefined) {
      updateFields.push(`updated_by = $${paramCount++}`);
      values.push(userData.updated_by);
    }

    if (updateFields.length === 0) {
      return await this.findById(id);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, username, email, password_hash, full_name, phone, user_type,
                is_active, last_login, created_at, updated_at, created_by, updated_by,
                custom_permissions, active_session_id
    `;

    const result = await db.query<User>(query, values);
    const user = result.rows[0];

    if (user) {
      logger.info('User updated', {
        userId: user.id,
        username: user.username
      });
    }

    return user || null;
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM users WHERE id = $1';
    await db.query(query, [id]);
    
    logger.info('User deleted', { userId: id });
  }

  async usernameExists(username: string, excludeId?: string): Promise<boolean> {
    const query = excludeId 
      ? 'SELECT 1 FROM users WHERE username = $1 AND id != $2 LIMIT 1'
      : 'SELECT 1 FROM users WHERE username = $1 LIMIT 1';
    
    const values = excludeId ? [username, excludeId] : [username];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const query = excludeId 
      ? 'SELECT 1 FROM users WHERE email = $1 AND id != $2 LIMIT 1'
      : 'SELECT 1 FROM users WHERE email = $1 LIMIT 1';
    
    const values = excludeId ? [email, excludeId] : [email];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }

  async verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  async updateLastLogin(id: string): Promise<void> {
    const query = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1';
    await db.query(query, [id]);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, appConfig.security.bcryptRounds);
    const query = 'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2';
    await db.query(query, [hashedPassword, id]);
    
    logger.info('Password updated', { userId: id });
  }

  async findByActiveSessionId(sessionId: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash, full_name, phone, user_type,
             is_active, last_login, created_at, updated_at, created_by, updated_by,
             custom_permissions, active_session_id, refresh_token_hash, refresh_token_expires_at,
             previous_refresh_token_hash, previous_refresh_token_valid_until
      FROM users
      WHERE active_session_id = $1
    `;
    const result = await db.query<User>(query, [sessionId]);
    return result.rows[0] || null;
  }

  async updateSession(
    userId: string,
    session: {
      activeSessionId: string | null;
      refreshTokenHash: string | null;
      refreshTokenExpiresAt: Date | null;
      previousRefreshTokenHash?: string | null;
      previousRefreshTokenValidUntil?: Date | null;
    }
  ): Promise<void> {
    const query = `
      UPDATE users
      SET active_session_id = $1,
          refresh_token_hash = $2,
          refresh_token_expires_at = $3,
          previous_refresh_token_hash = $5,
          previous_refresh_token_valid_until = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `;
    await db.query(query, [
      session.activeSessionId,
      session.refreshTokenHash,
      session.refreshTokenExpiresAt,
      userId,
      session.previousRefreshTokenHash ?? null,
      session.previousRefreshTokenValidUntil ?? null,
    ]);
    logger.info('User session updated', {
      userId,
      sessionSet: session.activeSessionId ? 'active' : 'cleared',
    });
  }

  async clearSession(userId: string): Promise<void> {
    await this.updateSession(userId, {
      activeSessionId: null,
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
      previousRefreshTokenHash: null,
      previousRefreshTokenValidUntil: null,
    });
  }

  /** @deprecated Prefer updateSession / clearSession for auth flows */
  async updateActiveSession(userId: string, sessionId: string | null): Promise<void> {
    if (sessionId === null) {
      await this.clearSession(userId);
      return;
    }
    const query =
      'UPDATE users SET active_session_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2';
    await db.query(query, [sessionId, userId]);
    logger.info('Active session updated', { userId, sessionId: 'set' });
  }

  async updateCustomPermissions(id: string, permissions: any, updatedBy?: string): Promise<void> {
    const query = `
      UPDATE users
      SET custom_permissions = $1::jsonb, updated_at = CURRENT_TIMESTAMP, updated_by = $2
      WHERE id = $3
    `;
    await db.query(query, [permissions, updatedBy || null, id]);
  }

  async getUserWithEntity(id: string): Promise<any> {
    const query = 'SELECT * FROM get_user_with_entity($1)';
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  async getAllUsersWithEntities(includeInactive = false, userType?: string): Promise<any[]> {
    let query = `
      SELECT 
        u.id as user_id,
        u.username,
        u.email,
        u.full_name,
        u.user_type,
        u.is_active,
        u.created_at,
        s.id as salesman_id,
        s.name as salesman_name,
        s.phone as salesman_phone,
        v.id as vendor_id,
        v.business_name as vendor_business_name,
        v.contact_person as vendor_contact_person,
        v.type as vendor_type,
        b.id as broker_id,
        b.business_name as broker_business_name,
        b.contact_persons as broker_contact_persons,
        b.type as broker_type
      FROM users u
      LEFT JOIN salesmen s ON u.id = s.user_id
      LEFT JOIN vendors v ON u.id = v.user_id
      LEFT JOIN brokers b ON u.id = b.user_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (!includeInactive) {
      query += ` AND u.is_active = true`;
    }

    if (userType) {
      query += ` AND u.user_type = $${paramCount++}`;
      params.push(userType);
    }

    query += ` ORDER BY u.created_at DESC`;

    const result = await db.query(query, params);
    return result.rows;
  }
}

export const userDAO = new UserDAO();