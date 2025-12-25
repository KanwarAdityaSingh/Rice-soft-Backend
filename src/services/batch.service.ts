import { db } from '../database/connection';
import { batchDAO } from '../dao/batch.dao';
import { recipeDAO } from '../dao/recipe.dao';
import { productDAO } from '../dao/product.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { lotInventoryDAO } from '../dao/lot-inventory.dao';
import { packetsInventoryDAO } from '../dao/packets-inventory.dao';
import { finishedGoodsInventoryDAO } from '../dao/finished-goods-inventory.dao';
import { bagsInventoryDAO } from '../dao/bags-inventory.dao';
import { CreateBatchDTO, Batch } from '../models/batch.model';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

export class BatchService {
  async createBatch(batchData: CreateBatchDTO): Promise<Batch> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // 1. Validate product, recipe, packaging exist
      const product = await productDAO.findById(batchData.product_id);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      const recipe = await recipeDAO.findById(batchData.recipe_id);
      if (!recipe) {
        throw new NotFoundError('Recipe not found');
      }

      const packaging = await packagingDAO.findById(batchData.packaging_id);
      if (!packaging) {
        throw new NotFoundError('Packaging not found');
      }

      // 2. Validate recipe formula sums to 100%
      const formulaSum = recipe.formula.reduce((sum, item) => sum + item.percentage, 0);
      if (Math.abs(formulaSum - 100) > 0.01) {
        throw new BadRequestError(`Recipe formula percentages must sum to 100%, got ${formulaSum}%`);
      }

      // 3. Calculate quantities per lot from batch.quantity and recipe formula
      const lotQuantities: Array<{ lotId: string; quantity: number; percentage: number }> = [];
      for (const formulaItem of recipe.formula) {
        const quantity = (batchData.quantity * formulaItem.percentage) / 100;
        lotQuantities.push({
          lotId: formulaItem.lot_id,
          quantity,
          percentage: formulaItem.percentage
        });
      }

      // 4. Check lot inventory has sufficient quantity for each lot
      for (const lotQty of lotQuantities) {
        const lot = await inwardSlipLotDAO.findById(lotQty.lotId);
        if (!lot) {
          throw new NotFoundError(`Lot ${lotQty.lotId} not found`);
        }

        const availableQty = await lotInventoryDAO.getAvailableQuantity(lotQty.lotId);
        if (availableQty < lotQty.quantity) {
          throw new BadRequestError(
            `Insufficient quantity in lot ${lot.lot_number}. Available: ${availableQty} kg, Required: ${lotQty.quantity} kg`
          );
        }
      }

      // 5. Check packets inventory has sufficient empty packets
      const packetsNeeded = Math.ceil(batchData.quantity / packaging.holding_capacity);
      const packetsInventory = await packetsInventoryDAO.findByPackagingId(batchData.packaging_id);
      if (!packetsInventory || packetsInventory.available_quantity < packetsNeeded) {
        throw new BadRequestError(
          `Insufficient empty packets. Available: ${packetsInventory?.available_quantity || 0}, Required: ${packetsNeeded}`
        );
      }

      // 6. Create batch record
      const batch = await batchDAO.create(batchData);

      // 7. Create batch_lot_usage records (lot-level tracking)
      const riceCodeUsageMap = new Map<string, { riceCodeId: string; riceType: string | null; totalQty: number }>();
      
      for (const lotQty of lotQuantities) {
        const lot = await inwardSlipLotDAO.findById(lotQty.lotId);
        if (!lot) continue;

        // Create lot usage record
        await batchDAO.createLotUsage(
          batch.id,
          lotQty.lotId,
          lotQty.quantity,
          lotQty.percentage,
          batchData.created_by
        );

        // Aggregate rice_code usage
        if (lot.rice_code_id) {
          const existing = riceCodeUsageMap.get(lot.rice_code_id);
          if (existing) {
            existing.totalQty += lotQty.quantity;
          } else {
            riceCodeUsageMap.set(lot.rice_code_id, {
              riceCodeId: lot.rice_code_id,
              riceType: lot.rice_type,
              totalQty: lotQty.quantity
            });
          }
        }

        // 9. Decrement lot inventory for each lot used
        const decremented = await lotInventoryDAO.decrementQuantity(lotQty.lotId, lotQty.quantity);
        if (!decremented) {
          throw new BadRequestError(`Failed to decrement lot inventory for lot ${lot.lot_number}`);
        }

        // 13. Update bags inventory: filled_bags decrease, empty_bags increase (based on lot bag info)
        if (lot.bag_weight && lot.no_of_bags && lot.received_weight > 0) {
          // Calculate how many bags are emptied (proportional to quantity used)
          const bagsEmptied = Math.floor((lotQty.quantity / lot.received_weight) * lot.no_of_bags);
          if (bagsEmptied > 0) {
            // Get bag type from kaanta - find kaanta with same sauda_id and matching bag_weight
            // Typically one kaanta creates one lot, so we match by sauda_id and bag_weight
            const kaantaQuery = `
              SELECT k.bag_type, k.bag_weight
              FROM kaantas k
              WHERE k.sauda_id = $1 AND k.bag_weight = $2
              ORDER BY k.created_at DESC
              LIMIT 1
            `;
            const kaantaResult = await client.query(kaantaQuery, [lot.sauda_id, lot.bag_weight]);
            if (kaantaResult.rows.length > 0) {
              const kaanta = kaantaResult.rows[0];
              const bagType = kaanta.bag_type as 'jute' | 'pp';
              await bagsInventoryDAO.decrementFilledBags(bagType, parseFloat(kaanta.bag_weight.toString()), bagsEmptied);
              await bagsInventoryDAO.incrementEmptyBags(bagType, parseFloat(kaanta.bag_weight.toString()), bagsEmptied);
            }
          }
        }
      }

      // 8. Aggregate and create batch_rice_code_usage records (rice_code-level tracking)
      for (const [, usage] of riceCodeUsageMap.entries()) {
        await batchDAO.createRiceCodeUsage(
          batch.id,
          usage.riceCodeId,
          usage.riceType,
          usage.totalQty,
          batchData.created_by
        );
      }

      // 10. Calculate packets needed: batch.quantity / packaging.holding_capacity
      // Already calculated above as packetsNeeded

      // 11. Decrement packets inventory
      const packetsDecremented = await packetsInventoryDAO.decrementQuantity(batchData.packaging_id, packetsNeeded);
      if (!packetsDecremented) {
        throw new BadRequestError('Failed to decrement packets inventory');
      }

      // 12. Create finished goods inventory entry
      const totalWeight = packetsNeeded * packaging.holding_capacity;
      await finishedGoodsInventoryDAO.create({
        product_id: batchData.product_id,
        batch_id: batch.id,
        packaging_id: batchData.packaging_id,
        no_of_packets: packetsNeeded,
        total_weight: totalWeight,
        created_by: batchData.created_by
      });

      await client.query('COMMIT');
      logger.info('Batch created successfully', { batch_id: batch.id, batch_number: batch.batch_number });

      return batch;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating batch', { error, batchData });
      throw error;
    } finally {
      client.release();
    }
  }

  async getBatchWithDetails(batchId: string): Promise<Batch & {
    product?: { id: string; name: string };
    recipe?: { id: string; recipe_name: string };
    packaging?: { id: string; holding_capacity: number; packet_type: string };
    lot_usage?: Array<{ id: string; batch_id: string; lot_id: string; quantity_used: number; percentage_used: number; created_at: Date | string; updated_at: Date | string }>;
    rice_code_usage?: Array<{ id: string; batch_id: string; rice_code_id: string; rice_type: string | null; total_quantity_used: number; created_at: Date | string; updated_at: Date | string }>;
  }> {
    const batch = await batchDAO.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found');
    }

    const product = await productDAO.findById(batch.product_id);
    const recipe = await recipeDAO.findById(batch.recipe_id);
    const packaging = await packagingDAO.findById(batch.packaging_id);
    const lotUsage = await batchDAO.getLotUsage(batchId);
    const riceCodeUsage = await batchDAO.getRiceCodeUsage(batchId);

    return {
      ...batch,
      product: product ? { id: product.id, name: product.name } : undefined,
      recipe: recipe ? { id: recipe.id, recipe_name: recipe.recipe_name } : undefined,
      packaging: packaging ? {
        id: packaging.id,
        holding_capacity: packaging.holding_capacity,
        packet_type: packaging.packet_type
      } : undefined,
      lot_usage: lotUsage,
      rice_code_usage: riceCodeUsage
    };
  }
}

export const batchService = new BatchService();

