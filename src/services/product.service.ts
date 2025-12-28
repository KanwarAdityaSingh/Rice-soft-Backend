import { productDAO } from '../dao/product.dao';
import { CreateProductDTO, Product } from '../models/product.model';
import { logger } from '../utils/logger';

export class ProductService {
  async createProduct(productData: CreateProductDTO): Promise<Product> {
    const product = await productDAO.create(productData);
    logger.info('Product created', { 
      product_id: product.id, 
      name: product.name 
    });
    return product;
  }
}

export const productService = new ProductService();

