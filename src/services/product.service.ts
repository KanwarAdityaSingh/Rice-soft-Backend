import { db } from '../database/connection';
import { productDAO } from '../dao/product.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { packetsInventoryDAO } from '../dao/packets-inventory.dao';
import { CreateProductDTO, Product } from '../models/product.model';
import { PackagingWeight } from '../models/packaging.model';
import { logger } from '../utils/logger';

export class ProductService {
  async createProduct(productData: CreateProductDTO): Promise<Product> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // 1. Create product
      const product = await productDAO.create(productData);

      // 2. Auto-create 3 packaging entries (10kg, 25kg, 50kg) with the provided packet_type
      const packagingWeights: PackagingWeight[] = [10, 25, 50];
      const createdPackaging = [];

      for (const weight of packagingWeights) {
        const packaging = await packagingDAO.create({
          product_id: product.id,
          holding_capacity: weight,
          packet_type: productData.packet_type,
          created_by: productData.created_by
        });

        // 3. Initialize packets_inventory for each created packaging (with 0 quantity)
        await packetsInventoryDAO.create({
          packaging_id: packaging.id,
          available_quantity: 0,
          created_by: productData.created_by
        });

        createdPackaging.push(packaging);
      }

      await client.query('COMMIT');
      logger.info('Product created with packaging entries', { 
        product_id: product.id, 
        packaging_count: createdPackaging.length 
      });

      return product;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating product with packaging', { error, productData });
      throw error;
    } finally {
      client.release();
    }
  }
}

export const productService = new ProductService();

