import { db } from '../database/connection';
import { Role, CreateRoleDTO, UpdateRoleDTO } from '../models/role.model';
import { logger } from '../utils/logger';

export class RoleDAO {
  async findAll(): Promise<Role[]> {
    const query = `
      SELECT id, name, description, permissions, created_at, updated_at
      FROM roles
      ORDER BY name ASC
    `;
    const result = await db.query<Role>(query);
    return result.rows;
  }

  async findById(id: string): Promise<Role | null> {
    const query = `
      SELECT id, name, description, permissions, created_at, updated_at
      FROM roles
      WHERE id = $1
    `;
    const result = await db.query<Role>(query, [id]);
    return result.rows[0] || null;
  }

  async findByName(name: string): Promise<Role | null> {
    const query = `
      SELECT id, name, description, permissions, created_at, updated_at
      FROM roles
      WHERE name = $1
    `;
    const result = await db.query<Role>(query, [name]);
    return result.rows[0] || null;
  }

  async create(data: CreateRoleDTO): Promise<Role> {
    const query = `
      INSERT INTO roles (name, description, permissions)
      VALUES ($1, $2, $3)
      RETURNING id, name, description, permissions, created_at, updated_at
    `;
    const values = [
      data.name,
      data.description || null,
      JSON.stringify(data.permissions || {}),
    ];
    const result = await db.query<Role>(query, values);
    logger.info('Role created', { roleId: result.rows[0].id, name: data.name });
    return result.rows[0];
  }

  async update(id: string, data: UpdateRoleDTO): Promise<Role | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.permissions !== undefined) {
      updates.push(`permissions = $${paramCount++}`);
      values.push(JSON.stringify(data.permissions));
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE roles
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, description, permissions, created_at, updated_at
    `;

    const result = await db.query<Role>(query, values);
    if (result.rows[0]) {
      logger.info('Role updated', { roleId: id });
    }
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM roles WHERE id = $1';
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Role deleted', { roleId: id });
    }
    return deleted;
  }

  async exists(id: string): Promise<boolean> {
    const query = 'SELECT EXISTS(SELECT 1 FROM roles WHERE id = $1) as exists';
    const result = await db.query<{ exists: boolean }>(query, [id]);
    return result.rows[0].exists;
  }

  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    let query = 'SELECT EXISTS(SELECT 1 FROM roles WHERE name = $1';
    const values: any[] = [name];
    
    if (excludeId) {
      query += ' AND id != $2';
      values.push(excludeId);
    }
    
    query += ') as exists';
    const result = await db.query<{ exists: boolean }>(query, values);
    return result.rows[0].exists;
  }
}

export const roleDAO = new RoleDAO();

