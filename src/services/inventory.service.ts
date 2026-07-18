import { finishedGoodsInventoryDAO } from '../dao/finished-goods-inventory.dao';
import { packetsInventoryDAO } from '../dao/packets-inventory.dao';
import { lotInventoryDAO } from '../dao/lot-inventory.dao';
import { bagsInventoryDAO } from '../dao/bags-inventory.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { productDAO } from '../dao/product.dao';
import { packagingVendorDAO } from '../dao/packaging-vendor.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { db } from '../database/connection';
import type { BagType } from '../constants/bag-types';
import type { Packaging } from '../models/packaging.model';

/** Nested `packaging` on GET inventory packets — aligns with costing on `PackagingResponse`. */
function mapPackagingForPacketsInventory(packaging: Packaging) {
  return {
    id: packaging.id,
    packaging_number: packaging.packaging_number,
    holding_capacity: packaging.holding_capacity,
    packet_type: packaging.packet_type,
    packaging_vendor_id: packaging.packaging_vendor_id,
    ordered_weight: packaging.ordered_weight,
    empty_bag_weight_kg: packaging.empty_bag_weight_kg,
    empty_bag_rate_per_kg: packaging.empty_bag_rate_per_kg,
    empty_bag_gst_percent: packaging.empty_bag_gst_percent,
    empty_bags_total_weight_kg: packaging.empty_bags_total_weight_kg,
    empty_bags_taxable_amount: packaging.empty_bags_taxable_amount,
    empty_bags_gst_amount: packaging.empty_bags_gst_amount,
    empty_bags_total_amount: packaging.empty_bags_total_amount,
    bill_number: packaging.bill_number,
    bill_date: packaging.bill_date ? packaging.bill_date.toISOString().split('T')[0] : null,
    packaging_bill_url: packaging.packaging_bill_url,
  };
}

export class InventoryService {
  async getFinishedGoodsInventory(productId?: string, batchId?: string, godownId?: string) {
    const inventory = await finishedGoodsInventoryDAO.findAll(productId, batchId, godownId);
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
          packaging_number: packaging.packaging_number,
          holding_capacity: packaging.holding_capacity,
          packet_type: packaging.packet_type
        } : undefined
      });
    }

    return results;
  }

  async getPacketsInventory(godownId?: string) {
    const inventory = await packetsInventoryDAO.findAll(godownId);
    const results = [];

    for (const item of inventory) {
      const packaging = await packagingDAO.findById(item.packaging_id);
      results.push({
        ...item,
        packaging: packaging ? mapPackagingForPacketsInventory(packaging) : undefined
      });
    }

    return results;
  }

  async getLotInventory(godownId?: string) {
    const inventory = await lotInventoryDAO.findAll(godownId);
    const results = [];

    for (const item of inventory) {
      const lot = await inwardSlipLotDAO.findById(item.lot_id);
      results.push({
        ...item,
        lot: lot ? {
          id: lot.id,
          lot_number: lot.lot_number,
          rice_category: lot.rice_category,
          rice_code_id: lot.rice_code_id,
          rice_type: lot.rice_type,
          rice_length_id: lot.rice_length_id,
          received_weight: lot.received_weight,
        } : undefined,
      });
    }

    return results;
  }

  async getBagsInventory(bagType?: string, godownId?: string) {
    return await bagsInventoryDAO.findAll(bagType as BagType | undefined, godownId);
  }

  async getInventorySummary(godownId?: string) {
    const finishedGoods = await this.getFinishedGoodsInventory(undefined, undefined, godownId);
    const packets = await this.getPacketsInventory(godownId);
    const lots = await this.getLotInventory(godownId);
    const bags = await this.getBagsInventory(undefined, godownId);

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

  async getHierarchicalInventory(godownId?: string) {
    // Get all products grouped by brand
    const products = await productDAO.findAll();
    const finishedGoods = await finishedGoodsInventoryDAO.findAll(undefined, undefined, godownId);
    const packaging = await packagingDAO.findAll();

    // Group products by brand
    const brandMap = new Map<string, Array<{
      product_id: string;
      product_name: string;
      rice_type: string | null;
      packaging: Array<{
        packaging_id: string;
        packaging_number: string | null;
        holding_capacity: number;
        packet_type: string;
        vendor: { id: string; name: string } | null;
        finished_goods: Array<{
          batch_id: string;
          batch_number: string;
          quantity: number;
          packets: number;
          weight: number;
        }>;
      }>;
    }>>();

    for (const product of products) {
      const brand = product.brand || 'Unbranded';
      
      if (!brandMap.has(brand)) {
        brandMap.set(brand, []);
      }

      // Get packaging for this product
      const productPackaging = packaging.filter(p => p.product_id === product.id);
      const packagingList = [];

      for (const pkg of productPackaging) {
        // Get vendor info
        let vendor = null;
        if (pkg.packaging_vendor_id) {
          const vendorData = await packagingVendorDAO.findById(pkg.packaging_vendor_id);
          if (vendorData) {
            vendor = { id: vendorData.id, name: vendorData.name };
          }
        }

        // Get finished goods for this packaging
        const pkgFinishedGoods = finishedGoods.filter(fg => fg.packaging_id === pkg.id);
        const finishedGoodsList = [];

        for (const fg of pkgFinishedGoods) {
          // Get batch info
          const batchQuery = `
            SELECT id, batch_number
            FROM batches
            WHERE id = $1
          `;
          const batchResult = await db.query(batchQuery, [fg.batch_id]);
          const batch = batchResult.rows[0];

          if (batch) {
            finishedGoodsList.push({
              batch_id: fg.batch_id,
              batch_number: batch.batch_number,
              quantity: parseFloat(fg.total_weight.toString()),
              packets: fg.no_of_packets,
              weight: parseFloat(fg.total_weight.toString())
            });
          }
        }

        packagingList.push({
          packaging_id: pkg.id,
          packaging_number: pkg.packaging_number,
          holding_capacity: pkg.holding_capacity,
          packet_type: pkg.packet_type,
          vendor: vendor,
          finished_goods: finishedGoodsList
        });
      }

      brandMap.get(brand)!.push({
        product_id: product.id,
        product_name: product.name,
        rice_type: product.rice_type,
        packaging: packagingList
      });
    }

    // Convert to array format
    const result = Array.from(brandMap.entries()).map(([brand, products]) => ({
      brand,
      products
    }));

    return result;
  }
}

export const inventoryService = new InventoryService();

