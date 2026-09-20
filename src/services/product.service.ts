import { brandDAO } from '../dao/brand.dao';
import { productDAO, legacyBrandEnumOrNull } from '../dao/product.dao';
import {
  CreateProductDTO,
  UpdateProductDTO,
  Product,
  ProductResponse,
  ProductRateItem,
  ProductStatus,
} from '../models/product.model';
import { defaultHsnForRiceCategory } from '../constants/product-hsn';
import type { HsnCode } from '../constants/hsn-codes';
import {
  isVariantAllowedForCategory,
  normalizeLegacyRiceTypeToVariant,
  type RiceCategory,
  type RiceVariant,
} from '../constants/rice-categories';
import type { RiceType } from '../models/lead.model';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { brandService } from './brand.service';

export function toProductResponse(product: Product, rates: ProductRateItem[] = []): ProductResponse {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    brand: product.brand,
    brand_id: product.brand_id,
    rice_type: product.rice_type,
    rice_category: product.rice_category,
    rice_variant: product.rice_variant,
    hsn_code: product.hsn_code ?? null,
    product_code: product.product_code,
    status: product.status,
    bag_image_url: product.bag_image_url,
    rates,
    created_at: product.created_at.toISOString(),
    updated_at: product.updated_at.toISOString(),
  };
}

function assertVariantForCategory(category: RiceCategory, variant: RiceVariant): void {
  if (!isVariantAllowedForCategory(category, variant)) {
    throw new ValidationError(
      `rice_variant "${variant}" is not valid for category "${category}"`
    );
  }
}

function resolveRiceVariant(
  category: RiceCategory,
  riceVariant?: RiceVariant,
  riceType?: RiceType
): RiceVariant | undefined {
  if (riceVariant) return riceVariant;
  if (riceType) return normalizeLegacyRiceTypeToVariant(riceType, category);
  return undefined;
}

export class ProductService {
  async createProduct(productData: CreateProductDTO): Promise<Product> {
    const brand = await brandService.requireActive(productData.brand_id);

    const dup = await productDAO.findDuplicateNameInBrand(productData.brand_id, productData.name);
    if (dup) {
      throw new ConflictError('A product with this name already exists for this brand');
    }

    if (!productData.bag_image_url?.trim()) {
      throw new ValidationError('bag_image_url is required');
    }

    const riceCategory = productData.rice_category;
    const riceVariant = resolveRiceVariant(
      riceCategory,
      productData.rice_variant,
      productData.rice_type
    );
    if (!riceVariant) {
      throw new ValidationError('rice_variant is required');
    }
    assertVariantForCategory(riceCategory, riceVariant);

    const hsn: HsnCode = (productData.hsn_code?.trim() as HsnCode) || defaultHsnForRiceCategory(riceCategory);
    const productCode = await brandDAO.allocateProductCode(brand.id);
    const brandEnum = legacyBrandEnumOrNull(brand.name);
    const status: ProductStatus = productData.status ?? 'active';

    const product = await productDAO.create({
      name: productData.name,
      description: productData.description,
      brand_id: brand.id,
      rice_category: riceCategory,
      bag_image_url: productData.bag_image_url.trim(),
      created_by: productData.created_by,
      product_code: productCode,
      brand_enum: brandEnum,
      rice_type: riceVariant,
      rice_variant: riceVariant,
      hsn_code: hsn,
      status,
    });

    logger.info('Product created', {
      product_id: product.id,
      name: product.name,
      product_code: product.product_code,
    });
    return product;
  }

  async updateProduct(id: string, productData: UpdateProductDTO): Promise<Product> {
    const existing = await productDAO.findById(id);
    if (!existing) throw new NotFoundError('Product not found');

    let brandEnum: 'Tamara' | 'Hariom' | null | undefined;
    if (productData.brand_id) {
      const brand = await brandService.requireActive(productData.brand_id);
      brandEnum = legacyBrandEnumOrNull(brand.name);
    }

    const name = productData.name ?? existing.name;
    const brandId = productData.brand_id ?? existing.brand_id;
    const dup = await productDAO.findDuplicateNameInBrand(brandId, name, id);
    if (dup) {
      throw new ConflictError('A product with this name already exists for this brand');
    }

    const riceCategory = productData.rice_category ?? existing.rice_category;
    const riceVariantChanged =
      productData.rice_variant !== undefined ||
      productData.rice_type !== undefined ||
      productData.rice_category !== undefined;
    const riceVariant = riceVariantChanged
      ? resolveRiceVariant(riceCategory, productData.rice_variant, productData.rice_type) ??
        existing.rice_variant
      : existing.rice_variant;
    if (riceVariantChanged) {
      assertVariantForCategory(riceCategory, riceVariant);
    }

    const hsn =
      productData.hsn_code !== undefined
        ? productData.hsn_code
        : productData.rice_category
          ? defaultHsnForRiceCategory(productData.rice_category)
          : undefined;

    const updated = await productDAO.update(id, {
      ...productData,
      brand_enum: brandEnum,
      rice_variant: riceVariantChanged ? riceVariant : undefined,
      rice_type: riceVariantChanged ? riceVariant : undefined,
      hsn_code: hsn,
    });
    if (!updated) throw new NotFoundError('Product not found');
    return updated;
  }

  async softDeactivate(id: string, updatedBy?: string): Promise<Product> {
    const existing = await productDAO.findById(id);
    if (!existing) throw new NotFoundError('Product not found');
    const updated = await productDAO.setStatus(id, 'inactive', updatedBy);
    if (!updated) throw new NotFoundError('Product not found');
    return updated;
  }

  async suggest(brandId: string | undefined, q: string) {
    if (!q || q.trim().length < 2) return [];
    const rows = await productDAO.suggestByName(brandId, q, 10);
    return rows.map((p) => toProductResponse(p, []));
  }
}

export const productService = new ProductService();
