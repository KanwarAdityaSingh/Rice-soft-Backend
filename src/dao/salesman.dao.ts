import { db } from '../database/connection';
import { Salesman, CreateSalesmanDTO, UpdateSalesmanDTO } from '../models/salesman.model';
import { logger } from '../utils/logger';

export class SalesmanDAO {
  async findAll(includeInactive = false): Promise<Salesman[]> {
    const query = `
      SELECT id, name, phone, email, is_active, user_id, created_at, updated_at, created_by, updated_by
      FROM salesmen
      ${includeInactive ? '' : 'WHERE is_active = true'}
      ORDER BY name ASC
    `;
    const result = await db.query<Salesman>(query);
    return result.rows;
  }

  async findById(id: string): Promise<Salesman | null> {
    const query = `
      SELECT id, name, phone, email, is_active, user_id, created_at, updated_at, created_by, updated_by
      FROM salesmen
      WHERE id = $1
    `;
    const result = await db.query<Salesman>(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<Salesman | null> {
    const query = `
      SELECT id, name, phone, email, is_active, user_id, created_at, updated_at, created_by, updated_by
      FROM salesmen
      WHERE email = $1
    `;
    const result = await db.query<Salesman>(query, [email]);
    return result.rows[0] || null;
  }

  async create(salesmanData: CreateSalesmanDTO & { user_id?: string }): Promise<Salesman> {
    const query = `
      INSERT INTO salesmen (name, phone, email, is_active, created_by, user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, phone, email, is_active, created_at, updated_at, created_by, updated_by, user_id
    `;
    
    const values = [
      salesmanData.name,
      salesmanData.phone,
      salesmanData.email,
      salesmanData.is_active !== undefined ? salesmanData.is_active : true,
      salesmanData.created_by || null,
      salesmanData.user_id || null
    ];

    const result = await db.query<Salesman>(query, values);
    const salesman = result.rows[0];

    logger.info('Salesman created', {
      salesmanId: salesman.id,
      name: salesman.name,
      email: salesman.email
    });

    return salesman;
  }

  async update(id: string, salesmanData: UpdateSalesmanDTO): Promise<Salesman | null> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (salesmanData.name !== undefined) {
      updateFields.push(`name = $${paramCount++}`);
      values.push(salesmanData.name);
    }

    if (salesmanData.phone !== undefined) {
      updateFields.push(`phone = $${paramCount++}`);
      values.push(salesmanData.phone);
    }

    if (salesmanData.email !== undefined) {
      updateFields.push(`email = $${paramCount++}`);
      values.push(salesmanData.email);
    }

    if (salesmanData.is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(salesmanData.is_active);
    }

    if (salesmanData.updated_by !== undefined) {
      updateFields.push(`updated_by = $${paramCount++}`);
      values.push(salesmanData.updated_by);
    }

    if (updateFields.length === 0) {
      return await this.findById(id);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE salesmen 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, phone, email, is_active, created_at, updated_at, created_by, updated_by
    `;

    const result = await db.query<Salesman>(query, values);
    const salesman = result.rows[0];

    if (salesman) {
      logger.info('Salesman updated', {
        salesmanId: salesman.id,
        name: salesman.name
      });
    }

    return salesman || null;
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM salesmen WHERE id = $1';
    await db.query(query, [id]);
    
    logger.info('Salesman deleted', { salesmanId: id });
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const query = excludeId 
      ? 'SELECT 1 FROM salesmen WHERE email = $1 AND id != $2 LIMIT 1'
      : 'SELECT 1 FROM salesmen WHERE email = $1 LIMIT 1';
    
    const values = excludeId ? [email, excludeId] : [email];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }
}

export const salesmanDAO = new SalesmanDAO();

