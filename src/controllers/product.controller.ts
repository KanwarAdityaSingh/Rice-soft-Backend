import { Response, NextFunction } from 'express';
import { productDAO } from '../dao/product.dao';
import { productRateDAO } from '../dao/product-rate.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { productService, toProductResponse } from '../services/product.service';
import { brandService } from '../services/brand.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  uuidSchema,
  setProductRatesSchema,
  productRateHistoryQuerySchema,
  updateProductRateHistorySchema,
  productSuggestQuerySchema,
  createProductSchema,
  updateProductSchema,
} from '../utils/validators';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateProductDTO, UpdateProductDTO, ProductResponse, ProductRateItem } from '../models/product.model';
import { NotFoundError, ValidationError, BadRequestError, InternalServerError } from '../utils/errors';
import { ProductRateResponse, ProductRate } from '../models/product-rate.model';
import { ProductRateHistoryResponse, UpdateRateHistoryPointResponse } from '../models/product-rate-history.model';
import { PackagingWeight } from '../models/packaging.model';
import { productRateHistoryDAO } from '../dao/product-rate-history.dao';
import { HSN_CODE_OPTIONS } from '../constants/hsn-codes';
import {
  RICE_CATEGORY_OPTIONS,
  BASMATI_VARIANT_OPTIONS,
  NON_BASMATI_VARIANT_OPTIONS,
} from '../constants/rice-categories';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import { bagImageExtractionService } from '../services/bag-image-extraction.service';

/** Matches businessCardUpload multer filter (jpeg/png/gif). */
const BAG_EXTRACTION_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

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

export class ProductController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const statusRaw = req.query.status as string | undefined;
      const status =
        statusRaw === 'active' || statusRaw === 'inactive' || statusRaw === 'discontinued'
          ? statusRaw
          : undefined;
      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { rows: products, total } = await productDAO.findAll(
        { ...(status ? { status } : {}), ...(search ? { search } : {}) },
        { limit, offset }
      );
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

      return ResponseHandler.success(
        res,
        toPaginatedResult(productResponses, total, page, limit)
      );
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

  async suggest(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const q = validate<{ brand_id?: string; q: string }>(productSuggestQuerySchema, req.query);
      const rows = await productService.suggest(q.brand_id, q.q);
      return ResponseHandler.success(res, rows);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productData = validate<CreateProductDTO>(createProductSchema, req.body);

      if (req.user) {
        productData.created_by = req.user.userId;
      }

      const product = await productService.createProduct(productData);
      const rates = await productRateDAO.findByProductId(product.id);
      return ResponseHandler.created(
        res,
        toProductResponse(product, ratesToItems(rates)),
        'Product created successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const productData = validate<UpdateProductDTO>(updateProductSchema, req.body);

      if (req.user) {
        productData.updated_by = req.user.userId;
      }

      const product = await productService.updateProduct(id, productData);
      const rates = await productRateDAO.findByProductId(id);
      return ResponseHandler.success(
        res,
        toProductResponse(product, ratesToItems(rates)),
        'Product updated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /** Soft-deactivate (preferred over hard delete) */
  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const product = await productService.softDeactivate(id, req.user?.userId);
      return ResponseHandler.success(
        res,
        toProductResponse(product, []),
        'Product deactivated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /** GET /products/brands — Brand Master dropdown (active only); keeps legacy shape + id */
  async getBrands(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { items: brands } = await brandService.list(true);
      const options = brands.map((b) => ({
        value: b.id,
        label: b.name,
        id: b.id,
        name: b.name,
        code_prefix: b.code_prefix,
      }));
      return ResponseHandler.success(res, options);
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

  async getRiceCategories(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      return ResponseHandler.success(res, RICE_CATEGORY_OPTIONS);
    } catch (error) {
      next(error);
    }
  }

  /** Same options as GET /rice-codes/getRiceVariants — processing variants for a category */
  async getRiceVariants(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const category = req.query.category as string | undefined;
      if (category === 'basmati') {
        return ResponseHandler.success(res, BASMATI_VARIANT_OPTIONS);
      }
      if (category === 'non_basmati') {
        return ResponseHandler.success(res, NON_BASMATI_VARIANT_OPTIONS);
      }
      throw new ValidationError('category query param is required (basmati or non_basmati)');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /products/extract-bag-image
   * multipart field: file (rice bag / packaging image)
   *
   * Stateless — does not persist anything. Used by FE to prefill brand + product name
   * when creating a product. Matches extracted brand_name against brands master when possible.
   */
  async extractBagImage(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      if (!appConfig.openai.bagExtractionEnabled) {
        throw new ValidationError('Bag image extraction is currently disabled');
      }

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 5);
      validateFileType(req.file.mimetype, BAG_EXTRACTION_IMAGE_MIME_TYPES);

      let extraction;
      try {
        extraction = await bagImageExtractionService.extractBagDetailsFromImage(
          req.file.buffer,
          req.file.mimetype
        );
      } catch {
        throw new InternalServerError(
          'Failed to extract details from the bag image. Please try again.'
        );
      }

      return ResponseHandler.success(
        res,
        extraction,
        'Bag image details extracted successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /products/upload-bag-image
   * Upload bag image before product create — returns { url } for use as bag_image_url.
   */
  async uploadBagImage(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.file) {
        throw new ValidationError('File is required');
      }
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
      validateFileSize(req.file.size, 5);

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.productBagImagesFolder
        );
      } catch {
        throw new InternalServerError('Failed to upload bag image. Please try again.');
      }

      return ResponseHandler.success(
        res,
        { url: uploadResult.url },
        'Product bag image uploaded successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /products/:id/upload-bag-image
   * Upload bag image and set products.bag_image_url.
   */
  async uploadBagImageForProduct(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      if (!req.file) {
        throw new ValidationError('File is required');
      }
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
      validateFileSize(req.file.size, 5);

      const existing = await productDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Product not found');
      }

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.productBagImagesFolder
        );
      } catch {
        throw new InternalServerError('Failed to upload bag image. Please try again.');
      }

      const product = await productService.updateProduct(id, {
        bag_image_url: uploadResult.url,
        updated_by: req.user?.userId,
      });
      const rates = await productRateDAO.findByProductId(id);

      return ResponseHandler.success(
        res,
        { url: uploadResult.url, product: toProductResponse(product, ratesToItems(rates)) },
        'Product bag image uploaded successfully'
      );
    } catch (error) {
      next(error);
    }
  }

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

  /**
   * PATCH one rate history point by id — corrects the `rate` only (effective_date, holding_capacity
   * and product stay fixed). If this point is the one currently driving the live suggested rate for
   * its capacity, `product_rates` is updated too and `current_rate_updated: true` is returned.
   */
  async updateRateHistoryPoint(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const historyId = validate<string>(uuidSchema, req.params.historyId);

      const product = await productDAO.findById(id);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      const body = validate<{ rate: number }>(updateProductRateHistorySchema, req.body);

      const result = await productRateDAO.editHistoryRate(id, historyId, body.rate);
      if (!result) {
        throw new NotFoundError('Rate history entry not found for this product');
      }

      const { history, currentRateUpdated } = result;
      const data: UpdateRateHistoryPointResponse = {
        point: {
          id: history.id,
          holding_capacity: Number(history.holding_capacity),
          rate: Number(history.rate),
          effective_date: productRateHistoryDAO.formatEffectiveDate(history.effective_date),
          created_at: history.created_at.toISOString(),
          created_by:
            history.created_by !== null
              ? { id: history.created_by, full_name: history.created_by_full_name ?? '' }
              : null,
        },
        current_rate_updated: currentRateUpdated,
      };

      return ResponseHandler.success(res, data, 'Rate history entry updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /** GET rates — permissive for sales prefill */
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

  /**
   * PUT rates — strict: only bag sizes present in Packaging Master.
   * Returns NO_PACKAGING_CONFIGURED when product has no active packaging.
   */
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

      const capacities = await packagingDAO.findDistinctHoldingCapacities(id);
      if (capacities.length === 0) {
        throw new BadRequestError(
          'NO_PACKAGING_CONFIGURED: No Packaging has been configured for this Product. Please create Packaging first.'
        );
      }

      const allowed = new Set(capacities);
      for (const r of body.rates) {
        if (!allowed.has(r.holding_capacity)) {
          throw new ValidationError(
            `holding_capacity ${r.holding_capacity} is not configured in Packaging Master for this product`
          );
        }
        if (!(r.rate > 0)) {
          throw new ValidationError('Selling price must be greater than zero');
        }
      }

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
