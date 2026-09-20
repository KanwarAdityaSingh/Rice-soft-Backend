import { db } from '../database/connection';
import {
  Product,
  CreateProductDTO,
  UpdateProductDTO,
  ProductStatus,
  LEGACY_BRAND_ENUM_VALUES,
} from '../models/product.model';
import type { RiceCategory, RiceVariant } from '../constants/rice-categories';
import type { RiceType } from '../models/lead.model';
import { logger } from '../utils/logger';
import { buildNormalizedSearchClause } from '../utils/search';

/** brand is display name from brands join (sales-safe) */
const PRODUCT_SELECT = `
  p.id,
  p.name,
  p.description,
  COALESCE(b.name, p.brand::text) AS brand,
  p.brand_id,
  p.rice_type,
  p.rice_category,
  p.rice_variant,
  p.hsn_code,
  p.product_code,
  p.status,
  p.bag_image_url,
  p.created_at,
  p.updated_at,
  p.created_by,
  p.updated_by
`;

const FROM_JOIN = `
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
`;

export function defaultRiceTypeForCategory(category: RiceCategory): RiceType {
  return category === 'basmati' ? 'raw_basmati' : 'non_basmati';
}

export function legacyBrandEnumOrNull(brandName: string): 'Tamara' | 'Hariom' | null {
  if ((LEGACY_BRAND_ENUM_VALUES as readonly string[]).includes(brandName)) {
    return brandName as 'Tamara' | 'Hariom';
  }
  return null;
}

export class ProductDAO {
  async findAll(
    opts?: { status?: ProductStatus | 'active'; search?: string },
    pagination?: { limit: number; offset: number }
  ): Promise<{ rows: Product[]; total: number }> {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    let paramCount = 1;
    if (opts?.status) {
      params.push(opts.status);
      where += ` AND p.status = $${paramCount++}`;
    }

    const searchClause = buildNormalizedSearchClause(
      ['p.name', 'b.name', 'p.hsn_code', 'p.product_code'],
      opts?.search,
      paramCount
    );
    where += searchClause.sql;
    params.push(...searchClause.params);
    paramCount = searchClause.nextParamIndex;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${FROM_JOIN} ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    let query = `SELECT ${PRODUCT_SELECT} ${FROM_JOIN} ${where} ORDER BY p.name ASC`;
    if (pagination) {
      params.push(pagination.limit, pagination.offset);
      query += ` LIMIT $${paramCount++} OFFSET $${paramCount}`;
    }
    const result = await db.query<Product>(query, params);
    return { rows: result.rows, total };
  }

  async findById(id: string): Promise<Product | null> {
    const result = await db.query<Product>(
      `SELECT ${PRODUCT_SELECT} ${FROM_JOIN} WHERE p.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findDuplicateNameInBrand(
    brandId: string,
    name: string,
    excludeId?: string
  ): Promise<Product | null> {
    const params: unknown[] = [brandId, name.trim()];
    let sql = `
      SELECT ${PRODUCT_SELECT} ${FROM_JOIN}
      WHERE p.brand_id = $1 AND LOWER(p.name) = LOWER($2)
    `;
    if (excludeId) {
      params.push(excludeId);
      sql += ` AND p.id <> $3`;
    }
    sql += ` LIMIT 1`;
    const result = await db.query<Product>(sql, params);
    return result.rows[0] || null;
  }

  async suggestByName(brandId: string | undefined, q: string, limit = 10): Promise<Product[]> {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    let paramCount = 1;
    if (brandId) {
      params.push(brandId);
      where += ` AND p.brand_id = $${paramCount++}`;
    }
    const searchClause = buildNormalizedSearchClause(['p.name'], q, paramCount);
    if (!searchClause.params.length) return [];
    where += searchClause.sql;
    params.push(...searchClause.params);
    paramCount = searchClause.nextParamIndex;
    params.push(limit);
    const sql = `
      SELECT ${PRODUCT_SELECT} ${FROM_JOIN}
      ${where}
      ORDER BY p.name ASC
      LIMIT $${paramCount}
    `;
    const result = await db.query<Product>(sql, params);
    return result.rows;
  }

  async create(
    productData: CreateProductDTO & {
      product_code: string;
      brand_enum: 'Tamara' | 'Hariom' | null;
      rice_type: RiceType;
      rice_variant: RiceVariant;
      hsn_code: string;
      status: ProductStatus;
    }
  ): Promise<Product> {
    const query = `
      INSERT INTO products (
        name, description, brand, brand_id, rice_type, rice_category, rice_variant,
        hsn_code, product_code, status, bag_image_url, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;
    const values = [
      productData.name.trim(),
      productData.description || null,
      productData.brand_enum,
      productData.brand_id,
      productData.rice_type,
      productData.rice_category,
      productData.rice_variant,
      productData.hsn_code,
      productData.product_code,
      productData.status,
      productData.bag_image_url,
      productData.created_by || null,
    ];

    try {
      const inserted = await db.query<{ id: string }>(query, values);
      const product = await this.findById(inserted.rows[0].id);
      if (!product) throw new Error('Product created but not found');
      logger.info('Product created', { id: product.id, name: product.name, code: product.product_code });
      return product;
    } catch (error) {
      logger.error('Error creating product', { error, productData });
      throw error;
    }
  }

  async update(id: string, productData: UpdateProductDTO & {
    brand_enum?: 'Tamara' | 'Hariom' | null;
    rice_type?: RiceType | null;
    rice_variant?: RiceVariant;
  }): Promise<Product | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (productData.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(productData.name.trim());
    }
    if (productData.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(productData.description || null);
    }
    if (productData.brand_id !== undefined) {
      fields.push(`brand_id = $${paramCount++}`);
      values.push(productData.brand_id);
    }
    if (productData.brand_enum !== undefined) {
      fields.push(`brand = $${paramCount++}`);
      values.push(productData.brand_enum);
    }
    if (productData.rice_type !== undefined) {
      fields.push(`rice_type = $${paramCount++}`);
      values.push(productData.rice_type);
    }
    if (productData.rice_category !== undefined) {
      fields.push(`rice_category = $${paramCount++}`);
      values.push(productData.rice_category);
    }
    if (productData.rice_variant !== undefined) {
      fields.push(`rice_variant = $${paramCount++}`);
      values.push(productData.rice_variant);
    }
    if (productData.hsn_code !== undefined) {
      fields.push(`hsn_code = $${paramCount++}`);
      values.push(productData.hsn_code || null);
    }
    if (productData.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(productData.status);
    }
    if (productData.bag_image_url !== undefined) {
      fields.push(`bag_image_url = $${paramCount++}`);
      values.push(productData.bag_image_url || null);
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
      RETURNING id
    `;

    try {
      const result = await db.query<{ id: string }>(query, values);
      if (result.rows.length === 0) return null;
      logger.info('Product updated', { id });
      return this.findById(id);
    } catch (error) {
      logger.error('Error updating product', { error, id });
      throw error;
    }
  }

  /** Soft-deactivate instead of hard delete when possible */
  async setStatus(id: string, status: ProductStatus, updatedBy?: string): Promise<Product | null> {
    return this.update(id, { status, updated_by: updatedBy });
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
