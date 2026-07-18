import { Response, NextFunction } from 'express';
import { productDAO } from '../dao/product.dao';
import { productRateDAO } from '../dao/product-rate.dao';
import { productService } from '../services/product.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  uuidSchema,
  setProductRatesSchema,
  productRateHistoryQuerySchema,
} from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateProductDTO, UpdateProductDTO, ProductResponse, Product, ProductRateItem } from '../models/product.model';
import { createProductSchema, updateProductSchema } from '../utils/validators';
import { NotFoundError, ValidationError } from '../utils/errors';
import { ProductRateResponse, ProductRate } from '../models/product-rate.model';
import { ProductRateHistoryResponse } from '../models/product-rate-history.model';
import { PackagingWeight } from '../models/packaging.model';
import { productRateHistoryDAO } from '../dao/product-rate-history.dao';
import { HSN_CODE_OPTIONS } from '../constants/hsn-codes';

function toEffectiveDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function ratesToItems(rates: ProductRate[]): ProductRateItem[] {
  return rates.map((r) => ({
    holding_capacity: Number(r.holding_capacity),
    rate: Number(r.rate),
    effective_date: toEffectiveDateString(r.effective_date),
  }));
}

function toRateResponse(r: ProductRate): ProductRateResponse {
  return {
    id: r.id,
    product_id: r.product_id,
    holding_capacity: Number(r.holding_capacity),
    rate: Number(r.rate),
    effective_date: toEffectiveDateString(r.effective_date),
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

function toProductResponse(product: Product, rates: ProductRateItem[] = []): ProductResponse {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    brand: product.brand,
    rice_type: product.rice_type,
    hsn_code: product.hsn_code ?? null,
    rates,
    created_at: product.created_at.toISOString(),
    updated_at: product.updated_at.toISOString(),
  };
}

export class ProductController {
  async getAll(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const products = await productDAO.findAll();
      const productIds = products.map((p) => p.id);
      const allRates = await productRateDAO.findByProductIds(productIds);
      const ratesByProductId = new Map<string, ProductRateItem[]>();
      for (const r of allRates) {
        const items = ratesByProductId.get(r.product_id) ?? [];
        items.push({
          holding_capacity: Number(r.holding_capacity),
          rate: Number(r.rate),
          effective_date: toEffectiveDateString(r.effective_date),
        });
        ratesByProductId.set(r.product_id, items);
      }
      const productResponses: ProductResponse[] = products.map((p) =>
        toProductResponse(p, ratesByProductId.get(p.id) ?? [])
      );

      return ResponseHandler.success(res, productResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const product = await productDAO.findById(id);
      if (!product) {
        throw new NotFoundError('Product not found');
      }
      const rates = await productRateDAO.findByProductId(id);
      return ResponseHandler.success(res, toProductResponse(product, ratesToItems(rates)));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productData = validate<CreateProductDTO>(createProductSchema, req.body);

      // Set created_by from authenticated user
      if (req.user) {
        productData.created_by = req.user.userId;
      }

      const product = await productService.createProduct(productData);
      const rates = await productRateDAO.findByProductId(product.id);
      return ResponseHandler.created(res, toProductResponse(product, ratesToItems(rates)), 'Product created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const productData = validate<UpdateProductDTO>(updateProductSchema, req.body);

      // Set updated_by from authenticated user
      if (req.user) {
        productData.updated_by = req.user.userId;
      }

      const product = await productDAO.update(id, productData);
      if (!product) {
        throw new NotFoundError('Product not found');
      }
      const rates = await productRateDAO.findByProductId(id);
      return ResponseHandler.success(res, toProductResponse(product, ratesToItems(rates)), 'Product updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const deleted = await productDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Product not found');
      }

      return ResponseHandler.success(res, null, 'Product deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async getBrands(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const brands = [
        { value: 'Tamara', label: 'Tamara' },
        { value: 'Hariom', label: 'Hariom' }
      ];

      return ResponseHandler.success(res, brands);
    } catch (error) {
      next(error);
    }
  }

  async getHsnCodes(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      return ResponseHandler.success(res, HSN_CODE_OPTIONS);
    } catch (error) {
      next(error);
    }
  }

  /** GET /products/:id/rates/history — append-only rate changes (trends), optional filters */
  async getRateHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const product = await productDAO.findById(id);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      const q = validate<{
        holding_capacity?: number;
        from?: string;
        to?: string;
        limit: number;
        offset: number;
      }>(productRateHistoryQuerySchema, req.query);

      if (q.from && q.to && q.from > q.to) {
        throw new ValidationError('"from" must be before or equal to "to"');
      }

      const rows = await productRateHistoryDAO.findByProductId(id, {
        holding_capacity: q.holding_capacity as PackagingWeight | undefined,
        from: q.from,
        to: q.to,
        limit: q.limit,
        offset: q.offset,
      });

      const data: ProductRateHistoryResponse = {
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          brand: product.brand,
          rice_type: product.rice_type,
        },
        points: rows.map((row) => ({
          id: row.id,
          holding_capacity: Number(row.holding_capacity),
          rate: Number(row.rate),
          effective_date: productRateHistoryDAO.formatEffectiveDate(row.effective_date),
          created_at: row.created_at.toISOString(),
          created_by:
            row.created_by !== null
              ? {
                  id: row.created_by,
                  full_name: row.created_by_full_name ?? '',
                }
              : null,
        })),
      };

      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  /** GET /products/:id/rates — list suggested sell rates per holding capacity for a product */
  async getRates(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const product = await productDAO.findById(id);
      if (!product) {
        throw new NotFoundError('Product not found');
      }
      const rates = await productRateDAO.findByProductId(id);
      const data: ProductRateResponse[] = rates.map(toRateResponse);
      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  /** PUT /products/:id/rates — set suggested sell rates as of effective_date (upsert + history) */
  async setRates(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const product = await productDAO.findById(id);
      if (!product) {
        throw new NotFoundError('Product not found');
      }
      const body = validate<{
        effective_date: string;
        rates: Array<{ holding_capacity: number; rate: number }>;
      }>(setProductRatesSchema, req.body);
      const updated = await productRateDAO.upsertRates(
        id,
        body.rates,
        body.effective_date,
        req.user?.userId ?? null
      );
      const data: ProductRateResponse[] = updated.map(toRateResponse);
      return ResponseHandler.success(res, data, 'Rates updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

