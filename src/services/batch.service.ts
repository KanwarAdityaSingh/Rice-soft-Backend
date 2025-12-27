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
import { 
  lotInventoryAuditDAO, 
  packetsInventoryAuditDAO, 
  bagsInventoryAuditDAO, 
  finishedGoodsInventoryAuditDAO 
} from '../dao/inventory-audit.dao';
import { INVENTORY_AUDIT_REASONS } from '../models/inventory-audit.model';
import { CreateBatchDTO, Batch, PackagingQuantity } from '../models/batch.model';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

export class BatchService {
  async createBatch(batchData: CreateBatchDTO): Promise<Batch> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // 1. Validate product and recipe exist
      const product = await productDAO.findById(batchData.product_id);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      const recipe = await recipeDAO.findById(batchData.recipe_id);
      if (!recipe) {
        throw new NotFoundError('Recipe not found');
      }

      // 2. Handle backward compatibility: if packaging_id and quantity are provided, convert to packaging_quantities
      let packagingQuantities: PackagingQuantity[] = [];
      let totalQuantity: number;
      let primaryPackagingId: string | undefined;

      if (batchData.packaging_quantities && batchData.packaging_quantities.length > 0) {
        // New flow: use packaging_quantities array
        packagingQuantities = batchData.packaging_quantities;
        totalQuantity = packagingQuantities.reduce((sum, pq) => sum + pq.quantity, 0);
        
        // Validate all packaging entries exist
        for (const pq of packagingQuantities) {
          const packaging = await packagingDAO.findByProductAndWeight(batchData.product_id, pq.weight);
          if (!packaging) {
            throw new NotFoundError(`Packaging not found for product ${batchData.product_id} with weight ${pq.weight} kg`);
          }
          if (pq.quantity <= 0) {
            throw new BadRequestError(`Quantity must be greater than 0 for ${pq.weight} kg packaging`);
          }
        }
        
        // Use first packaging as primary for batch record (backward compatibility)
        const firstPackaging = await packagingDAO.findByProductAndWeight(batchData.product_id, packagingQuantities[0].weight);
        primaryPackagingId = firstPackaging?.id;
      } else if (batchData.packaging_id && batchData.quantity) {
        // Backward compatibility: old flow with single packaging
        const packaging = await packagingDAO.findById(batchData.packaging_id);
        if (!packaging) {
          throw new NotFoundError('Packaging not found');
        }
        if (packaging.product_id !== batchData.product_id) {
          throw new BadRequestError('Packaging does not belong to the specified product');
        }
        packagingQuantities = [{
          weight: packaging.holding_capacity as 10 | 25 | 50,
          quantity: batchData.quantity
        }];
        totalQuantity = batchData.quantity;
        primaryPackagingId = batchData.packaging_id;
      } else {
        throw new BadRequestError('Either packaging_quantities array or (packaging_id + quantity) must be provided');
      }

      // 3. Validate recipe formula sums to 100%
      const formulaSum = recipe.formula.reduce((sum, item) => sum + item.percentage, 0);
      if (Math.abs(formulaSum - 100) > 0.01) {
        throw new BadRequestError(`Recipe formula percentages must sum to 100%, got ${formulaSum}%`);
      }

      // 4. Calculate quantities per lot from totalQuantity and recipe formula
      const lotQuantities: Array<{ lotId: string; quantity: number; percentage: number }> = [];
      for (const formulaItem of recipe.formula) {
        const quantity = (totalQuantity * formulaItem.percentage) / 100;
        lotQuantities.push({
          lotId: formulaItem.lot_id,
          quantity,
          percentage: formulaItem.percentage
        });
      }

      // 5. Check lot inventory has sufficient quantity for each lot
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

      // 6. Check packets inventory has sufficient empty packets for each packaging size
      const packagingChecks: Array<{
        packaging: any;
        packetsNeeded: number;
        packetsInventory: any;
      }> = [];

      for (const pq of packagingQuantities) {
        const packaging = await packagingDAO.findByProductAndWeight(batchData.product_id, pq.weight);
        if (!packaging) {
          throw new NotFoundError(`Packaging not found for product ${batchData.product_id} with weight ${pq.weight} kg`);
        }

        const packetsNeeded = Math.ceil(pq.quantity / pq.weight);
        const packetsInventory = await packetsInventoryDAO.findByPackagingId(packaging.id);
        
        if (!packetsInventory || packetsInventory.available_quantity < packetsNeeded) {
          throw new BadRequestError(
            `Insufficient empty packets for ${pq.weight} kg packaging. Available: ${packetsInventory?.available_quantity || 0}, Required: ${packetsNeeded}`
          );
        }

        packagingChecks.push({ packaging, packetsNeeded, packetsInventory });
      }

      // 7. Create batch record (use primary packaging_id for backward compatibility)
      const batchCreateData: CreateBatchDTO = {
        ...batchData,
        packaging_id: primaryPackagingId,
        quantity: totalQuantity
      };
      const batch = await batchDAO.create(batchCreateData);

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

        // Get current lot inventory for audit
        const lotInventory = await lotInventoryDAO.findByLotId(lotQty.lotId);
        const quantityBefore = lotInventory?.available_quantity || 0;
        const quantityAfter = quantityBefore - lotQty.quantity;

        // 9. Decrement lot inventory for each lot used
        const decremented = await lotInventoryDAO.decrementQuantity(lotQty.lotId, lotQty.quantity);
        if (!decremented) {
          throw new BadRequestError(`Failed to decrement lot inventory for lot ${lot.lot_number}`);
        }

        // Log lot inventory reduction audit
        const lotCalculation = `Batch Total Quantity: ${totalQuantity} kg | Recipe Share: ${lotQty.percentage}% | Lot Consumption = ${totalQuantity} x ${lotQty.percentage}/100 = ${lotQty.quantity.toFixed(2)} kg`;
        
        await lotInventoryAuditDAO.create({
          lot_inventory_id: lotInventory?.id,
          lot_id: lotQty.lotId,
          operation_type: 'reduction',
          quantity_change: lotQty.quantity,
          quantity_before: quantityBefore,
          quantity_after: quantityAfter,
          reason: INVENTORY_AUDIT_REASONS.LOT.BATCH_CONSUMPTION,
          reference_type: 'batch',
          reference_id: batch.id,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          notes: lotCalculation,
          created_by: batchData.created_by
        });

        // 13. Update bags inventory: filled_bags decrease, empty_bags increase (based on lot bag info)
        if (lot.bag_weight && lot.no_of_bags && lot.received_weight > 0) {
          // Calculate how many bags are emptied (proportional to quantity used)
          const bagsEmptied = Math.floor((lotQty.quantity / lot.received_weight) * lot.no_of_bags);
          if (bagsEmptied > 0) {
            // Get bag type from kaanta - find kaanta with same sauda_id and matching bag_weight
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
              const bagCapacity = parseFloat(kaanta.bag_weight.toString());

              // Get current bags inventory for audit
              const bagsInventory = await bagsInventoryDAO.findByTypeAndCapacity(bagType, bagCapacity);
              const filledBefore = bagsInventory?.filled_bags || 0;
              const emptyBefore = bagsInventory?.empty_bags || 0;

              await bagsInventoryDAO.decrementFilledBags(bagType, bagCapacity, bagsEmptied);
              await bagsInventoryDAO.incrementEmptyBags(bagType, bagCapacity, bagsEmptied);

              // Get updated bags inventory for audit
              const updatedBagsInventory = await bagsInventoryDAO.findByTypeAndCapacity(bagType, bagCapacity);

              // Calculate usage ratio for notes
              const usageRatio = (lotQty.quantity / lot.received_weight * 100).toFixed(2);
              const bagsCalculation = `Quantity Used: ${lotQty.quantity.toFixed(2)} kg | Lot Total: ${lot.received_weight} kg | Lot Bags: ${lot.no_of_bags} | Bags Emptied = floor((${lotQty.quantity.toFixed(2)}/${lot.received_weight}) x ${lot.no_of_bags}) = ${bagsEmptied} bags (${usageRatio}% of lot consumed)`;

              // Log filled bags reduction audit
              await bagsInventoryAuditDAO.create({
                bags_inventory_id: bagsInventory?.id,
                bag_type: bagType,
                bag_capacity: bagCapacity,
                operation_type: 'reduction',
                field_changed: 'filled_bags',
                quantity_change: bagsEmptied,
                quantity_before: filledBefore,
                quantity_after: updatedBagsInventory?.filled_bags || filledBefore - bagsEmptied,
                reason: INVENTORY_AUDIT_REASONS.BAGS.BATCH_EMPTIED,
                reference_type: 'batch',
                reference_id: batch.id,
                batch_id: batch.id,
                batch_number: batch.batch_number,
                notes: bagsCalculation,
                created_by: batchData.created_by
              });

              // Log empty bags addition audit
              const emptyBagsNote = `${bagsEmptied} ${bagType.toUpperCase()} bags (${bagCapacity} kg capacity) transferred from filled to empty inventory`;
              
              await bagsInventoryAuditDAO.create({
                bags_inventory_id: bagsInventory?.id,
                bag_type: bagType,
                bag_capacity: bagCapacity,
                operation_type: 'addition',
                field_changed: 'empty_bags',
                quantity_change: bagsEmptied,
                quantity_before: emptyBefore,
                quantity_after: updatedBagsInventory?.empty_bags || emptyBefore + bagsEmptied,
                reason: INVENTORY_AUDIT_REASONS.BAGS.BATCH_EMPTY_ADDED,
                reference_type: 'batch',
                reference_id: batch.id,
                batch_id: batch.id,
                batch_number: batch.batch_number,
                notes: emptyBagsNote,
                created_by: batchData.created_by
              });
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

      // 9. Process each packaging size: decrement packets inventory and create finished goods entries
      for (let i = 0; i < packagingChecks.length; i++) {
        const { packaging, packetsNeeded, packetsInventory } = packagingChecks[i];
        const pq = packagingQuantities[i];

        // Decrement packets inventory
        const packetsQuantityBefore = packetsInventory.available_quantity;
        const packetsQuantityAfter = packetsQuantityBefore - packetsNeeded;

        const packetsDecremented = await packetsInventoryDAO.decrementQuantity(packaging.id, packetsNeeded);
        if (!packetsDecremented) {
          throw new BadRequestError(`Failed to decrement packets inventory for ${pq.weight} kg packaging`);
        }

        // Log packets inventory reduction audit
        const packetsCalculation = `Batch Quantity: ${pq.quantity} kg | Packet Capacity: ${packaging.holding_capacity} kg | Packets Required = ceil(${pq.quantity}/${packaging.holding_capacity}) = ${packetsNeeded} ${packaging.packet_type} packets`;
        
        await packetsInventoryAuditDAO.create({
          packets_inventory_id: packetsInventory.id,
          packaging_id: packaging.id,
          operation_type: 'reduction',
          quantity_change: packetsNeeded,
          quantity_before: packetsQuantityBefore,
          quantity_after: packetsQuantityAfter,
          reason: INVENTORY_AUDIT_REASONS.PACKETS.BATCH_CONSUMPTION,
          reference_type: 'batch',
          reference_id: batch.id,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          notes: packetsCalculation,
          created_by: batchData.created_by
        });

        // Create finished goods inventory entry for this packaging size
        const totalWeight = packetsNeeded * packaging.holding_capacity;
        const finishedGoods = await finishedGoodsInventoryDAO.create({
          product_id: batchData.product_id,
          batch_id: batch.id,
          packaging_id: packaging.id,
          no_of_packets: packetsNeeded,
          total_weight: totalWeight,
          created_by: batchData.created_by
        });

        // Log finished goods inventory addition audit
        const finishedGoodsCalculation = `Packets Produced: ${packetsNeeded} | Packet Capacity: ${packaging.holding_capacity} kg | Total Weight = ${packetsNeeded} x ${packaging.holding_capacity} = ${totalWeight} kg | Product: ${product.name}`;
        
        await finishedGoodsInventoryAuditDAO.create({
          finished_goods_inventory_id: finishedGoods.id,
          product_id: batchData.product_id,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          packaging_id: packaging.id,
          operation_type: 'addition',
          packets_change: packetsNeeded,
          packets_before: 0,
          packets_after: packetsNeeded,
          weight_change: totalWeight,
          weight_before: 0,
          weight_after: totalWeight,
          reason: INVENTORY_AUDIT_REASONS.FINISHED_GOODS.BATCH_PRODUCTION,
          reference_type: 'batch',
          reference_id: batch.id,
          notes: finishedGoodsCalculation,
          created_by: batchData.created_by
        });
      }

      await client.query('COMMIT');
      logger.info('Batch created successfully with inventory audit logs', { batch_id: batch.id, batch_number: batch.batch_number });

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
