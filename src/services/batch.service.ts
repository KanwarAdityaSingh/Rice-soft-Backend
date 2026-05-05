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
import { CreateBatchDTO, Batch, CreateBatchProductDTO, CreateBatchPackagingDTO } from '../models/batch.model';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

export class BatchService {
  // Stage 1: Recipe Attachment - Create batch with recipe and quantity
  async createBatch(batchData: CreateBatchDTO): Promise<Batch> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // 1. Validate recipe exists
      const recipe = await recipeDAO.findById(batchData.recipe_id);
      if (!recipe) {
        throw new NotFoundError('Recipe not found');
      }

      // 2. Validate recipe formula sums to 100%
      const formulaSum = recipe.formula.reduce((sum, item) => sum + item.percentage, 0);
      if (Math.abs(formulaSum - 100) > 0.01) {
        throw new BadRequestError(`Recipe formula percentages must sum to 100%, got ${formulaSum}%`);
      }

      // 3. Calculate quantities per lot from totalQuantity and recipe formula
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
        if (lot.godown_id !== batchData.godown_id) {
          throw new BadRequestError(`Lot ${lot.lot_number} belongs to different godown`);
        }

        const availableQty = await lotInventoryDAO.getAvailableQuantity(lotQty.lotId, batchData.godown_id);
        if (availableQty < lotQty.quantity) {
          throw new BadRequestError(
            `Insufficient quantity in lot ${lot.lot_number}. Available: ${availableQty} kg, Required: ${lotQty.quantity} kg`
          );
        }
      }

      // 5. Create batch record (status: recipe_attached)
      const batch = await batchDAO.create(batchData);

      // 6. Create batch_lot_usage records and deduct lot inventory
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
        const lotInventory = await lotInventoryDAO.findByLotId(lotQty.lotId, batchData.godown_id);
        const quantityBefore = lotInventory?.available_quantity || 0;
        const quantityAfter = quantityBefore - lotQty.quantity;

        // Decrement lot inventory
        const decremented = await lotInventoryDAO.decrementQuantity(lotQty.lotId, lotQty.quantity, batchData.godown_id);
        if (!decremented) {
          throw new BadRequestError(`Failed to decrement lot inventory for lot ${lot.lot_number}`);
        }

        // Log lot inventory reduction audit
        const lotCalculation = `Batch Total Quantity: ${batchData.quantity} kg | Recipe Share: ${lotQty.percentage}% | Lot Consumption = ${batchData.quantity} x ${lotQty.percentage}/100 = ${lotQty.quantity.toFixed(2)} kg`;
        
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

        // 7. Update bags inventory: filled_bags decrease, empty_bags increase
        if (lot.bag_weight && lot.no_of_bags && lot.received_weight > 0) {
          const bagsEmptied = Math.floor((lotQty.quantity / lot.received_weight) * lot.no_of_bags);
          if (bagsEmptied > 0) {
            // Get bag type from kaanta
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
              const bagType = kaanta.bag_type;
              const bagCapacity = parseFloat(kaanta.bag_weight.toString());

              // Get current bags inventory for audit
              const bagsInventory = await bagsInventoryDAO.findByTypeAndCapacity(bagType, bagCapacity, batchData.godown_id);
              const filledBefore = bagsInventory?.filled_bags || 0;
              const emptyBefore = bagsInventory?.empty_bags || 0;

              await bagsInventoryDAO.decrementFilledBags(bagType, bagCapacity, bagsEmptied, batchData.godown_id);
              await bagsInventoryDAO.incrementEmptyBags(bagType, bagCapacity, bagsEmptied, batchData.godown_id);

              // Get updated bags inventory for audit
              const updatedBagsInventory = await bagsInventoryDAO.findByTypeAndCapacity(bagType, bagCapacity, batchData.godown_id);

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

      // 8. Aggregate and create batch_rice_code_usage records
      for (const [, usage] of riceCodeUsageMap.entries()) {
        await batchDAO.createRiceCodeUsage(
          batch.id,
          usage.riceCodeId,
          usage.riceType,
          usage.totalQty,
          batchData.created_by
        );
      }

      await client.query('COMMIT');
      logger.info('Batch created successfully (Stage 1: Recipe attached)', { batch_id: batch.id, batch_number: batch.batch_number });

      return batch;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating batch', { error, batchData });
      throw error;
    } finally {
      client.release();
    }
  }

  // Stage 2: Product Attachment - Add products to batch
  async addProductToBatch(batchId: string, productData: CreateBatchProductDTO): Promise<Batch> {
    const batch = await batchDAO.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found');
    }

    // Validate batch is in correct stage (allow adding products even if already ready_to_pack)
    if (batch.status !== 'recipe_attached' && batch.status !== 'ready_to_pack') {
      throw new BadRequestError(`Cannot add products to batch in status: ${batch.status}. Expected: recipe_attached or ready_to_pack`);
    }

    // Validate product exists
    const product = await productDAO.findById(productData.product_id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Add product to batch
    await batchDAO.addProduct(batchId, productData);

    // Update batch status to ready_to_pack if not already
    const products = await batchDAO.getProducts(batchId);
    if (products.length > 0) {
      await batchDAO.update(batchId, { status: 'ready_to_pack', updated_by: productData.created_by });
    }

    // Fetch and return updated batch
    const updatedBatch = await batchDAO.findById(batchId);
    if (!updatedBatch) {
      throw new NotFoundError('Batch not found after update');
    }

    logger.info('Product added to batch', { batch_id: batchId, product_id: productData.product_id, status: updatedBatch.status });
    return updatedBatch;
  }

  async removeProductFromBatch(batchId: string, productId: string): Promise<void> {
    const batch = await batchDAO.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found');
    }

    // Validate batch is in correct stage (allow removing products if ready_to_pack or packaged)
    if (batch.status !== 'ready_to_pack' && batch.status !== 'packaged') {
      throw new BadRequestError(`Cannot remove products from batch in status: ${batch.status}. Expected: ready_to_pack or packaged`);
    }

    const removed = await batchDAO.removeProduct(batchId, productId);
    if (!removed) {
      throw new NotFoundError('Product not found in batch');
    }

    // Check if any products remain, if not, revert to recipe_attached
    const products = await batchDAO.getProducts(batchId);
    if (products.length === 0) {
      await batchDAO.update(batchId, { status: 'recipe_attached' });
    }

    logger.info('Product removed from batch', { batch_id: batchId, product_id: productId });
  }

  // Stage 3: Packaging Attachment - Add packaging to batch
  async addPackagingToBatch(batchId: string, packagingData: CreateBatchPackagingDTO): Promise<void> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const batch = await batchDAO.findById(batchId);
      if (!batch) {
        throw new NotFoundError('Batch not found');
      }

      // Validate batch is in correct stage (allow adding packaging even if already packaged)
      if (batch.status !== 'ready_to_pack' && batch.status !== 'packaged') {
        throw new BadRequestError(`Cannot add packaging to batch in status: ${batch.status}. Expected: ready_to_pack or packaged`);
      }

      // Validate product is attached to batch
      const batchProduct = await batchDAO.getProduct(batchId, packagingData.product_id);
      if (!batchProduct) {
        throw new BadRequestError('Product must be attached to batch before adding packaging');
      }

      // Validate packaging exists and belongs to product
      const packaging = await packagingDAO.findById(packagingData.packaging_id);
      if (!packaging) {
        throw new NotFoundError('Packaging not found');
      }

      if (packaging.product_id !== packagingData.product_id) {
        throw new BadRequestError('Packaging does not belong to the specified product');
      }

      // Calculate packets needed
      const packetsNeeded = Math.ceil(packagingData.quantity / packaging.holding_capacity);

      // Check packets inventory has sufficient empty packets
      const packetsInventory = await packetsInventoryDAO.findByPackagingId(packaging.id, batch.godown_id);
      if (!packetsInventory || packetsInventory.available_quantity < packetsNeeded) {
        throw new BadRequestError(
          `Insufficient empty packets for ${packaging.holding_capacity} kg packaging. Available: ${packetsInventory?.available_quantity || 0}, Required: ${packetsNeeded}`
        );
      }

      // Add packaging to batch
      await batchDAO.addPackaging(batchId, packagingData);

      // Decrement packets inventory
      const packetsQuantityBefore = packetsInventory.available_quantity;
      const packetsQuantityAfter = packetsQuantityBefore - packetsNeeded;

      const packetsDecremented = await packetsInventoryDAO.decrementQuantity(packaging.id, packetsNeeded, batch.godown_id);
      if (!packetsDecremented) {
        throw new BadRequestError(`Failed to decrement packets inventory for ${packaging.holding_capacity} kg packaging`);
      }

      // Log packets inventory reduction audit
      const packetsCalculation = `Batch Quantity: ${packagingData.quantity} kg | Packet Capacity: ${packaging.holding_capacity} kg | Packets Required = ceil(${packagingData.quantity}/${packaging.holding_capacity}) = ${packetsNeeded} ${packaging.packet_type} packets`;
      
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
        created_by: packagingData.created_by
      });

      // Create finished goods inventory entry
      const totalWeight = packetsNeeded * packaging.holding_capacity;
      const finishedGoods = await finishedGoodsInventoryDAO.create({
        godown_id: batch.godown_id,
        product_id: packagingData.product_id,
        batch_id: batch.id,
        packaging_id: packaging.id,
        no_of_packets: packetsNeeded,
        total_weight: totalWeight,
        created_by: packagingData.created_by
      });

      // Get product for audit log
      const product = await productDAO.findById(packagingData.product_id);

      // Log finished goods inventory addition audit
      const finishedGoodsCalculation = `Packets Produced: ${packetsNeeded} | Packet Capacity: ${packaging.holding_capacity} kg | Total Weight = ${packetsNeeded} x ${packaging.holding_capacity} = ${totalWeight} kg | Product: ${product?.name || packagingData.product_id}`;
      
      await finishedGoodsInventoryAuditDAO.create({
        finished_goods_inventory_id: finishedGoods.id,
        product_id: packagingData.product_id,
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
        created_by: packagingData.created_by
      });

      // Update batch status to packaged (only if not already packaged)
      if (batch.status !== 'packaged') {
        await batchDAO.update(batchId, { status: 'packaged', updated_by: packagingData.created_by });
      }

      await client.query('COMMIT');
      logger.info('Packaging added to batch (Stage 3)', { batch_id: batchId, packaging_id: packagingData.packaging_id });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding packaging to batch', { error, batchId, packagingData });
      throw error;
    } finally {
      client.release();
    }
  }

  async removePackagingFromBatch(batchId: string, packagingId: string): Promise<void> {
    const batch = await batchDAO.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found');
    }

    // Get packaging info before removal
    const batchPackaging = await batchDAO.getPackaging(batchId);
    const packagingToRemove = batchPackaging.find(bp => bp.packaging_id === packagingId);
    if (!packagingToRemove) {
      throw new NotFoundError('Packaging not found in batch');
    }

    // Remove packaging from batch
    const removed = await batchDAO.removePackaging(batchId, packagingId);
    if (!removed) {
      throw new NotFoundError('Packaging not found in batch');
    }

    // Note: We don't reverse finished goods or packets inventory here
    // This is a design decision - removal might be for correction purposes
    // If reversal is needed, it should be handled separately

    logger.info('Packaging removed from batch', { batch_id: batchId, packaging_id: packagingId });
  }

  async getBatchWithDetails(batchId: string): Promise<Batch & {
    product?: { id: string; name: string };
    recipe?: { id: string; recipe_name: string };
    packaging?: { id: string; holding_capacity: number; packet_type: string };
    lot_usage?: Array<{ id: string; batch_id: string; lot_id: string; quantity_used: number; percentage_used: number; created_at: Date | string; updated_at: Date | string }>;
    rice_code_usage?: Array<{ id: string; batch_id: string; rice_code_id: string; rice_type: string | null; total_quantity_used: number; created_at: Date | string; updated_at: Date | string }>;
    products?: Array<{ id: string; product_id: string; cost: number | null }>;
    packaging_list?: Array<{ id: string; product_id: string; packaging_id: string; quantity: number }>;
  }> {
    const batch = await batchDAO.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found');
    }

    const recipe = await recipeDAO.findById(batch.recipe_id);
    const lotUsage = await batchDAO.getLotUsage(batchId);
    const riceCodeUsage = await batchDAO.getRiceCodeUsage(batchId);
    const batchProducts = await batchDAO.getProducts(batchId);
    const batchPackaging = await batchDAO.getPackaging(batchId);

    // Get product info if product_id exists (backward compatibility)
    let product = null;
    if (batch.product_id) {
      product = await productDAO.findById(batch.product_id);
    }

    // Get packaging info if packaging_id exists (backward compatibility)
    let packaging = null;
    if (batch.packaging_id) {
      packaging = await packagingDAO.findById(batch.packaging_id);
    }

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
      rice_code_usage: riceCodeUsage,
      products: batchProducts.map((bp) => ({
        id: bp.id,
        product_id: bp.product_id,
        cost: bp.cost != null ? parseFloat(String(bp.cost)) : null,
      })),
      packaging_list: batchPackaging.map(bp => ({ 
        id: bp.id, 
        product_id: bp.product_id, 
        packaging_id: bp.packaging_id, 
        quantity: bp.quantity 
      }))
    };
  }
}

export const batchService = new BatchService();
