import { db } from '../database/connection';
import { Product, CreateProductDTO, UpdateProductDTO } from '../models/product.model';
import { logger } from '../utils/logger';

export class ProductDAO {
  async findAll(): Promise<Product[]> {
    const query = `
      SELECT id, name, description, brand, rice_type, created_at, updated_at, created_by, updated_by
      FROM products
      ORDER BY name ASC
    `;
    const result = await db.query<Product>(query);
    return result.rows;
  }

  async findById(id: string): Promise<Product | null> {
    const query = `
      SELECT id, name, description, brand, rice_type, created_at, updated_at, created_by, updated_by
      FROM products
      WHERE id = $1
    `;
    const result = await db.query<Product>(query, [id]);
    return result.rows[0] || null;
  }

  async create(productData: CreateProductDTO): Promise<Product> {
    const query = `
      INSERT INTO products (name, description, brand, rice_type, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, description, brand, rice_type, created_at, updated_at, created_by, updated_by
    `;

    const values = [
      productData.name,
      productData.description || null,
      productData.brand || null,
      productData.rice_type || null,
      productData.created_by || null
    ];

    try {
      const result = await db.query<Product>(query, values);
      logger.info('Product created', { id: result.rows[0].id, name: result.rows[0].name });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating product', { error, productData });
      throw error;
    }
  }

  async update(id: string, productData: UpdateProductDTO): Promise<Product | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (productData.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(productData.name);
    }
    if (productData.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(productData.description || null);
    }
    if (productData.brand !== undefined) {
      fields.push(`brand = $${paramCount++}`);
      values.push(productData.brand || null);
    }
    if (productData.rice_type !== undefined) {
      fields.push(`rice_type = $${paramCount++}`);
      values.push(productData.rice_type || null);
    }
    if (productData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(productData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE products
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, description, brand, rice_type, created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<Product>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Product updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating product', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM products WHERE id = $1';
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Product deleted', { id });
    }
    return deleted;
  }
}

export const productDAO = new ProductDAO();
