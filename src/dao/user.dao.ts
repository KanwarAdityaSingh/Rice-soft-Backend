import { db } from '../database/connection';
import { User, UserWithRole, CreateUserDTO, UpdateUserDTO } from '../models/user.model';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';
import { appConfig } from '../config/app.config';

export class UserDAO {
  async findAll(includeInactive = false): Promise<UserWithRole[]> {
    const query = `
      SELECT 
        u.id, u.username, u.email, u.role_id, u.full_name, u.phone,
        u.is_active, u.last_login, u.created_at, u.updated_at,
        r.name as role_name, r.permissions as role_permissions
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      ${includeInactive ? '' : 'WHERE u.is_active = true'}
      ORDER BY u.created_at DESC
    `;
    const result = await db.query<UserWithRole>(query);
    return result.rows;
  }

  async findById(id: string): Promise<UserWithRole | null> {
    const query = `
      SELECT 
        u.id, u.username, u.email, u.role_id, u.full_name, u.phone,
        u.is_active, u.last_login, u.created_at, u.updated_at,
        r.name as role_name, r.permissions as role_permissions
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `;
    const result = await db.query<UserWithRole>(query, [id]);
    return result.rows[0] || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash, role_id, full_name, phone,
             is_active, last_login, created_at, updated_at, created_by, updated_by
      FROM users
      WHERE username = $1
    `;
    const result = await db.query<User>(query, [username]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, username, email, password_hash, role_id, full_name, phone,
             is_active, last_login, created_at, updated_at, created_by, updated_by
      FROM users
      WHERE email = $1
    `;
    const result = await db.query<User>(query, [email]);
    return result.rows[0] || null;
  }

  async create(data: CreateUserDTO): Promise<UserWithRole> {
    const passwordHash = await bcrypt.hash(data.password, appConfig.security.bcryptRounds);

    const query = `
      INSERT INTO users (
        username, email, password_hash, role_id, full_name, phone, is_active, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;

    const values = [
      data.username,
      data.email,
      passwordHash,
      data.role_id,
      data.full_name,
      data.phone || null,
      data.is_active !== undefined ? data.is_active : true,
      data.created_by || null,
    ];

    const result = await db.query<{ id: string }>(query, values);
    const userId = result.rows[0].id;

    logger.info('User created', { userId, username: data.username });

    const user = await this.findById(userId);
    if (!user) {
      throw new Error('Failed to retrieve created user');
    }

    return user;
  }

  async update(id: string, data: UpdateUserDTO): Promise<UserWithRole | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.username !== undefined) {
      updates.push(`username = $${paramCount++}`);
      values.push(data.username);
    }
    if (data.email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(data.email);
    }
    if (data.password !== undefined) {
      const passwordHash = await bcrypt.hash(data.password, appConfig.security.bcryptRounds);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(passwordHash);
    }
    if (data.role_id !== undefined) {
      updates.push(`role_id = $${paramCount++}`);
      values.push(data.role_id);
    }
    if (data.full_name !== undefined) {
      updates.push(`full_name = $${paramCount++}`);
      values.push(data.full_name);
    }
    if (data.phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(data.phone);
    }
    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(data.is_active);
    }
    if (data.updated_by !== undefined) {
      updates.push(`updated_by = $${paramCount++}`);
      values.push(data.updated_by);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id
    `;

    const result = await db.query<{ id: string }>(query, values);
    if (result.rows[0]) {
      logger.info('User updated', { userId: id });
      return this.findById(id);
    }

    return null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('User deleted', { userId: id });
    }
    return deleted;
  }

  async updateLastLogin(id: string): Promise<void> {
    const query = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1';
    await db.query(query, [id]);
  }

  async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    return await bcrypt.compare(password, passwordHash);
  }

  async exists(id: string): Promise<boolean> {
    const query = 'SELECT EXISTS(SELECT 1 FROM users WHERE id = $1) as exists';
    const result = await db.query<{ exists: boolean }>(query, [id]);
    return result.rows[0].exists;
  }

  async usernameExists(username: string, excludeId?: string): Promise<boolean> {
    let query = 'SELECT EXISTS(SELECT 1 FROM users WHERE username = $1';
    const values: any[] = [username];
    
    if (excludeId) {
      query += ' AND id != $2';
      values.push(excludeId);
    }
    
    query += ') as exists';
    const result = await db.query<{ exists: boolean }>(query, values);
    return result.rows[0].exists;
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    let query = 'SELECT EXISTS(SELECT 1 FROM users WHERE email = $1';
    const values: any[] = [email];
    
    if (excludeId) {
      query += ' AND id != $2';
      values.push(excludeId);
    }
    
    query += ') as exists';
    const result = await db.query<{ exists: boolean }>(query, values);
    return result.rows[0].exists;
  }
}

export const userDAO = new UserDAO();


