import { finishedGoodsInventoryDAO } from '../dao/finished-goods-inventory.dao';
import { packetsInventoryDAO } from '../dao/packets-inventory.dao';
import { lotInventoryDAO } from '../dao/lot-inventory.dao';
import { bagsInventoryDAO } from '../dao/bags-inventory.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { productDAO } from '../dao/product.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { db } from '../database/connection';

export class InventoryService {
  async getFinishedGoodsInventory(productId?: string, batchId?: string) {
    const inventory = await finishedGoodsInventoryDAO.findAll(productId, batchId);
    const results = [];

    for (const item of inventory) {
      const product = await productDAO.findById(item.product_id);
      const packaging = await packagingDAO.findById(item.packaging_id);
      
      // Get batch info
      const batchQuery = `
        SELECT id, batch_number
        FROM batches
        WHERE id = $1
      `;
      const batchResult = await db.query(batchQuery, [item.batch_id]);
      const batch = batchResult.rows[0];

      results.push({
        ...item,
        product: product ? { id: product.id, name: product.name } : undefined,
        batch: batch ? { id: batch.id, batch_number: batch.batch_number } : undefined,
        packaging: packaging ? {
          id: packaging.id,
          holding_capacity: packaging.holding_capacity,
          packet_type: packaging.packet_type
        } : undefined
      });
    }

    return results;
  }

  async getPacketsInventory() {
    const inventory = await packetsInventoryDAO.findAll();
    const results = [];

    for (const item of inventory) {
      const packaging = await packagingDAO.findById(item.packaging_id);
      results.push({
        ...item,
        packaging: packaging ? {
          id: packaging.id,
          holding_capacity: packaging.holding_capacity,
          packet_type: packaging.packet_type,
          source: packaging.source
        } : undefined
      });
    }

    return results;
  }

  async getLotInventory() {
    const inventory = await lotInventoryDAO.findAll();
    const results = [];

    for (const item of inventory) {
      const lot = await inwardSlipLotDAO.findById(item.lot_id);
      results.push({
        ...item,
        lot: lot ? {
          id: lot.id,
          lot_number: lot.lot_number,
          rice_code_id: lot.rice_code_id,
          rice_type: lot.rice_type,
          received_weight: lot.received_weight
        } : undefined
      });
    }

    return results;
  }

  async getBagsInventory(bagType?: string) {
    return await bagsInventoryDAO.findAll(bagType as 'jute' | 'pp' | undefined);
  }

  async getInventorySummary() {
    const finishedGoods = await this.getFinishedGoodsInventory();
    const packets = await this.getPacketsInventory();
    const lots = await this.getLotInventory();
    const bags = await this.getBagsInventory();

    const totalFinishedGoodsPackets = finishedGoods.reduce((sum: number, item: any) => sum + item.no_of_packets, 0);
    const totalFinishedGoodsWeight = finishedGoods.reduce((sum: number, item: any) => sum + item.total_weight, 0);
    const totalEmptyPackets = packets.reduce((sum: number, item: any) => sum + item.available_quantity, 0);
    const totalLotQuantity = lots.reduce((sum: number, item: any) => sum + item.available_quantity, 0);
    const totalFilledBags = bags.reduce((sum: number, item: any) => sum + item.filled_bags, 0);
    const totalEmptyBags = bags.reduce((sum: number, item: any) => sum + item.empty_bags, 0);

    return {
      finished_goods: {
        total_packets: totalFinishedGoodsPackets,
        total_weight_kg: totalFinishedGoodsWeight,
        items: finishedGoods.length
      },
      packets: {
        total_empty_packets: totalEmptyPackets,
        types: packets.length
      },
      lots: {
        total_available_quantity_kg: totalLotQuantity,
        active_lots: lots.length
      },
      bags: {
        total_filled_bags: totalFilledBags,
        total_empty_bags: totalEmptyBags,
        types: bags.length
      }
    };
  }
}

export const inventoryService = new InventoryService();

