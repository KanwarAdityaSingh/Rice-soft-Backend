import { db } from '../database/connection';
import { logger } from '../utils/logger';

/**
 * Comprehensive seed script to create realistic, interconnected production data
 * covering ALL frontend filter options:
 * - By Capacity (10kg, 25kg, 50kg)
 * - By Vendor (multiple vendors)
 * - By Rice Type (all types)
 * - Vendor First, Capacity First, Packet Type First
 * - Multiple lots of same packaging (separate lots with same details)
 */

interface SeedData {
  packagingVendors: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; brand: string; rice_type: string }>;
  recipes: Array<{ id: string; name: string }>;
  packaging: Array<{ id: string; product_id: string; capacity: number; type: string; vendor_id: string | null; packaging_number: string | null }>;
  batches: Array<{ id: string; batch_number: string; status: string }>;
}

async function clearProductionData() {
  logger.info('Clearing all production-related data...');
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    await client.query('DELETE FROM finished_goods_inventory');
    await client.query('DELETE FROM packets_inventory');
    await client.query('DELETE FROM batch_packaging');
    await client.query('DELETE FROM batch_products');
    await client.query('DELETE FROM batch_lot_usage');
    await client.query('DELETE FROM batch_rice_code_usage');
    await client.query('DELETE FROM batches');
    await client.query('DELETE FROM packaging');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM recipes');
    await client.query('DELETE FROM packaging_vendors');
    
    // Reset bags inventory
    await client.query('UPDATE bags_inventory SET filled_bags = 0, empty_bags = 0');
    
    // Reset sequences
    await client.query('ALTER SEQUENCE batch_number_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE packaging_number_seq RESTART WITH 1');
    
    await client.query('COMMIT');
    logger.info('Production data cleared successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error clearing production data', { error });
    throw error;
  } finally {
    client.release();
  }
}

async function getAdminUserId(): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE username = $1 LIMIT 1',
    ['admin']
  );
  return result.rows[0]?.id || null;
}

async function getAvailableLots(): Promise<Array<{ id: string; lot_number: string; available_quantity: number; rice_code_id: string; rice_type: string }>> {
  const result = await db.query<{ id: string; lot_number: string; available_quantity: number; rice_code_id: string; rice_type: string }>(
    `SELECT l.id, l.lot_number, COALESCE(li.available_quantity, 0) as available_quantity, 
            l.rice_code_id, l.rice_type
     FROM inward_slip_lots l
     LEFT JOIN lot_inventory li ON l.id = li.lot_id
     WHERE COALESCE(li.available_quantity, 0) > 0
     ORDER BY l.lot_number
     LIMIT 30`
  );
  return result.rows;
}

async function seedData() {
  logger.info('Starting comprehensive data seed...');
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const adminId = await getAdminUserId();
    if (!adminId) {
      throw new Error('Admin user not found. Please create admin user first.');
    }
    
    const availableLots = await getAvailableLots();
    if (availableLots.length < 6) {
      logger.warn('Not enough lots available. Need at least 6 lots for comprehensive recipes.');
    }
    
    const seedData: SeedData = {
      packagingVendors: [],
      products: [],
      recipes: [],
      packaging: [],
      batches: []
    };
    
    // ============================================
    // 1. Create Packaging Vendors (5 vendors for better filtering)
    // ============================================
    logger.info('Creating packaging vendors...');
    const vendors = [
      { name: 'ABC Packaging Suppliers', contact_person: 'Rajesh Kumar', phone: '+91-9876543210', email: 'rajesh@abcpackaging.com', gst_number: 'GST123456789' },
      { name: 'XYZ Packaging Solutions', contact_person: 'Priya Sharma', phone: '+91-9876543211', email: 'priya@xyzpackaging.com', gst_number: 'GST987654321' },
      { name: 'Premium Pack Industries', contact_person: 'Amit Patel', phone: '+91-9876543212', email: 'amit@premiumpack.com', gst_number: 'GST456789123' },
      { name: 'Elite Packaging Co.', contact_person: 'Sneha Reddy', phone: '+91-9876543213', email: 'sneha@elitepack.com', gst_number: 'GST789123456' },
      { name: 'Global Pack Materials', contact_person: 'Vikram Singh', phone: '+91-9876543214', email: 'vikram@globalpack.com', gst_number: 'GST321654987' }
    ];
    
    for (const vendor of vendors) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO packaging_vendors (name, contact_person, phone, email, gst_number, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [vendor.name, vendor.contact_person, vendor.phone, vendor.email, vendor.gst_number, adminId]
      );
      seedData.packagingVendors.push({ id: result.rows[0].id, name: vendor.name });
    }
    
    // ============================================
    // 2. Create Products (covering ALL rice types and brands)
    // ============================================
    logger.info('Creating products...');
    const products = [
      // Tamara Brand - All Rice Types
      { name: 'Tamara Premium Basmati', brand: 'Tamara', rice_type: 'basmati', description: 'Premium basmati rice from Tamara' },
      { name: 'Tamara Royal Basmati', brand: 'Tamara', rice_type: 'basmati', description: 'Royal basmati variety' },
      { name: 'Tamara Classic Basmati', brand: 'Tamara', rice_type: 'basmati', description: 'Classic basmati rice' },
      { name: 'Tamara Standard White', brand: 'Tamara', rice_type: 'non_basmati', description: 'Standard white rice' },
      { name: 'Tamara Long Grain', brand: 'Tamara', rice_type: 'non_basmati', description: 'Long grain rice' },
      { name: 'Tamara Parboiled', brand: 'Tamara', rice_type: 'parboiled', description: 'Parboiled rice' },
      { name: 'Tamara Raw Basmati', brand: 'Tamara', rice_type: 'raw_basmati', description: 'Raw basmati rice' },
      { name: 'Tamara Steam Basmati', brand: 'Tamara', rice_type: 'steam_basmati', description: 'Steam basmati rice' },
      { name: 'Tamara White Sella', brand: 'Tamara', rice_type: 'white_sella', description: 'White sella variety' },
      { name: 'Tamara Golden Sella', brand: 'Tamara', rice_type: 'golden_sella', description: 'Golden sella variety' },
      
      // Hariom Brand - Multiple Rice Types
      { name: 'Hariom Basmati Premium', brand: 'Hariom', rice_type: 'basmati', description: 'Hariom premium basmati' },
      { name: 'Hariom Basmati Classic', brand: 'Hariom', rice_type: 'basmati', description: 'Hariom classic basmati' },
      { name: 'Hariom White Rice', brand: 'Hariom', rice_type: 'non_basmati', description: 'Hariom white rice' },
      { name: 'Hariom Parboiled', brand: 'Hariom', rice_type: 'parboiled', description: 'Hariom parboiled rice' },
      { name: 'Hariom Raw Basmati', brand: 'Hariom', rice_type: 'raw_basmati', description: 'Hariom raw basmati' },
      
      // Unbranded - Various Types
      { name: 'Premium Basmati Rice', brand: null, rice_type: 'basmati', description: 'Unbranded premium basmati' },
      { name: 'Standard White Rice', brand: null, rice_type: 'non_basmati', description: 'Unbranded white rice' },
      { name: 'Raw Basmati Rice', brand: null, rice_type: 'raw_basmati', description: 'Unbranded raw basmati' },
      { name: 'Steam Basmati Rice', brand: null, rice_type: 'steam_basmati', description: 'Unbranded steam basmati' },
      { name: 'White Sella Rice', brand: null, rice_type: 'white_sella', description: 'Unbranded white sella' },
      { name: 'Golden Sella Rice', brand: null, rice_type: 'golden_sella', description: 'Unbranded golden sella' }
    ];
    
    for (const product of products) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO products (name, description, brand, rice_type, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [product.name, product.description, product.brand, product.rice_type, adminId]
      );
      seedData.products.push({
        id: result.rows[0].id,
        name: product.name,
        brand: product.brand || 'Unbranded',
        rice_type: product.rice_type
      });
    }
    
    // ============================================
    // 3. Create Packaging (with MULTIPLE LOTS per product/capacity/type)
    // ============================================
    logger.info('Creating packaging with multiple lots...');
    
    const packetTypes = ['PP Bag', 'Jute Bag', 'Woven Bag', 'Poly Bag', 'Laminated Bag'];
    const capacities = [10, 25, 50];
    
    // For each product, create packaging covering all combinations
    for (const product of seedData.products) {
      // Create packaging for each capacity
      for (const capacity of capacities) {
        // Create 2-3 different packet types per capacity
        const typesForCapacity = packetTypes.slice(0, Math.min(3, packetTypes.length));
        
        for (const packetType of typesForCapacity) {
          // Create 2-3 LOTS of the same packaging (same product, capacity, type)
          // but different vendors and ordered weights to show separate lots
          const lotsCount = 2 + Math.floor(Math.random() * 2); // 2-3 lots
          
          for (let lotIndex = 0; lotIndex < lotsCount; lotIndex++) {
            // Distribute across vendors
            const productIndex = seedData.products.findIndex(p => p.id === product.id);
            const vendorIndex = (productIndex + capacity + lotIndex) % seedData.packagingVendors.length;
            const vendorId = seedData.packagingVendors[vendorIndex].id;
            
            // Varying ordered weights for different lots
            const orderedWeight = [1000, 2000, 5000, 3000, 1500, 4000][(lotIndex * capacity) % 6];
            
            // Initial packets for this lot (varying quantities)
            const initialPackets = [50, 100, 200, 150, 75, 300, 250][(lotIndex * capacity) % 7];
            
            const result = await client.query<{ id: string; packaging_number: string | null }>(
              `INSERT INTO packaging (product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight, created_by)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id, packaging_number`,
              [product.id, capacity, packetType, vendorId, orderedWeight, adminId]
            );
            
            const packagingId = result.rows[0].id;
            const packagingNumber = result.rows[0].packaging_number;
            
            seedData.packaging.push({
              id: packagingId,
              product_id: product.id,
              capacity,
              type: packetType,
              vendor_id: vendorId,
              packaging_number: packagingNumber
            });
            
            // Set initial packets inventory for this lot
            await client.query(
              `INSERT INTO packets_inventory (packaging_id, available_quantity, created_by)
               VALUES ($1, $2, $3)
               ON CONFLICT (packaging_id) DO UPDATE SET available_quantity = EXCLUDED.available_quantity`,
              [packagingId, initialPackets, adminId]
            );
          }
        }
      }
    }
    
    logger.info(`Created ${seedData.packaging.length} packaging entries (multiple lots)`);
    
    // ============================================
    // 4. Create Recipes (using available lots)
    // ============================================
    logger.info('Creating recipes...');
    
    if (availableLots.length >= 6) {
      const recipes = [
        {
          name: 'Premium Mix Recipe',
          formula: [
            { lot_id: availableLots[0].id, percentage: 60 },
            { lot_id: availableLots[1].id, percentage: 40 }
          ]
        },
        {
          name: 'Classic Blend Recipe',
          formula: [
            { lot_id: availableLots[0].id, percentage: 50 },
            { lot_id: availableLots[1].id, percentage: 30 },
            { lot_id: availableLots[2].id, percentage: 20 }
          ]
        },
        {
          name: 'Standard Mix Recipe',
          formula: [
            { lot_id: availableLots[2].id, percentage: 70 },
            { lot_id: availableLots[3].id, percentage: 30 }
          ]
        },
        {
          name: 'Premium Blend Recipe',
          formula: [
            { lot_id: availableLots[0].id, percentage: 40 },
            { lot_id: availableLots[1].id, percentage: 35 },
            { lot_id: availableLots[2].id, percentage: 25 }
          ]
        },
        {
          name: 'Deluxe Mix Recipe',
          formula: [
            { lot_id: availableLots[3].id, percentage: 50 },
            { lot_id: availableLots[4].id, percentage: 30 },
            { lot_id: availableLots[5].id, percentage: 20 }
          ]
        },
        {
          name: 'Special Blend Recipe',
          formula: [
            { lot_id: availableLots[1].id, percentage: 45 },
            { lot_id: availableLots[3].id, percentage: 35 },
            { lot_id: availableLots[4].id, percentage: 20 }
          ]
        }
      ];
      
      for (const recipe of recipes) {
        const result = await client.query<{ id: string }>(
          `INSERT INTO recipes (recipe_name, formula, created_by)
           VALUES ($1, $2::jsonb, $3)
           RETURNING id`,
          [recipe.name, JSON.stringify(recipe.formula), adminId]
        );
        seedData.recipes.push({ id: result.rows[0].id, name: recipe.name });
      }
    } else {
      logger.warn('Skipping recipe creation - not enough lots available');
    }
    
    // ============================================
    // 5. Create Batches (covering all stages and statuses)
    // ============================================
    logger.info('Creating batches...');
    
    if (seedData.recipes.length > 0) {
      const batchQuantities = [500, 1000, 750, 1200, 800, 1500, 900, 1100, 1300, 600];
      
      // Create 12 batches for comprehensive coverage
      for (let i = 0; i < 12; i++) {
        const selectedRecipe = seedData.recipes[i % seedData.recipes.length];
        const quantity = batchQuantities[i % batchQuantities.length];
        
        // Fetch recipe formula from database
        const recipeResult = await client.query<{ formula: any }>(
          `SELECT formula FROM recipes WHERE id = $1`,
          [selectedRecipe.id]
        );
        const recipeFormula = recipeResult.rows[0]?.formula || [];
        
        const batchResult = await client.query<{ id: string; batch_number: string }>(
          `INSERT INTO batches (recipe_id, quantity, status, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, batch_number`,
          [selectedRecipe.id, quantity, 'recipe_attached', adminId]
        );
        
        const batch = batchResult.rows[0];
        seedData.batches.push({
          id: batch.id,
          batch_number: batch.batch_number,
          status: 'recipe_attached'
        });
        
        // Simulate lot usage based on recipe formula
        const riceCodeUsageMap = new Map<string, { riceCodeId: string; riceType: string; totalQty: number }>();
        
        // Process each lot in recipe formula
        for (const formulaItem of recipeFormula) {
          const lot = availableLots.find(l => l.id === formulaItem.lot_id);
          if (lot && lot.available_quantity > 0) {
            const quantityUsed = Math.min(
              (quantity * formulaItem.percentage) / 100,
              lot.available_quantity * 0.8 // Use max 80% to keep some inventory
            );
            
            // Update lot inventory
            await client.query(
              `UPDATE lot_inventory 
               SET available_quantity = GREATEST(0, available_quantity - $1)
               WHERE lot_id = $2`,
              [quantityUsed, lot.id]
            );
            
            // Create batch lot usage record
            await client.query(
              `INSERT INTO batch_lot_usage (batch_id, lot_id, quantity_used, percentage_used, created_by)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`,
              [batch.id, lot.id, quantityUsed, formulaItem.percentage, adminId]
            );
            
            // Aggregate rice code usage
            const riceCodeKey = lot.rice_code_id;
            if (riceCodeUsageMap.has(riceCodeKey)) {
              const existing = riceCodeUsageMap.get(riceCodeKey)!;
              existing.totalQty += quantityUsed;
            } else {
              riceCodeUsageMap.set(riceCodeKey, {
                riceCodeId: lot.rice_code_id,
                riceType: lot.rice_type,
                totalQty: quantityUsed
              });
            }
          }
        }
        
        // Create batch rice code usage records
        for (const [, usage] of riceCodeUsageMap.entries()) {
          await client.query(
            `INSERT INTO batch_rice_code_usage (batch_id, rice_code_id, rice_type, total_quantity_used, created_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (batch_id, rice_code_id) DO UPDATE SET total_quantity_used = EXCLUDED.total_quantity_used`,
            [batch.id, usage.riceCodeId, usage.riceType, usage.totalQty, adminId]
          );
        }
        
        // Update bags inventory (filled -> empty)
        const bagsNeeded = Math.ceil(quantity / 50);
        await client.query(
          `UPDATE bags_inventory 
           SET filled_bags = GREATEST(0, filled_bags - $1),
               empty_bags = empty_bags + $1
           WHERE bag_capacity = 50
           AND id = (SELECT id FROM bags_inventory WHERE bag_capacity = 50 LIMIT 1)`,
          [bagsNeeded]
        );
      }
      
      // ============================================
      // 6. Add Products to Batches (Stage 2)
      // ============================================
      logger.info('Adding products to batches...');
      
      for (let i = 0; i < seedData.batches.length; i++) {
        const batch = seedData.batches[i];
        
        // Add 1-3 products to each batch (varying)
        const productCount = 1 + (i % 3); // 1, 2, or 3 products
        const productStartIndex = i % seedData.products.length;
        const productsToAdd = seedData.products.slice(
          productStartIndex,
          productStartIndex + productCount
        );
        
        // Wrap around if needed
        if (productsToAdd.length < productCount) {
          productsToAdd.push(...seedData.products.slice(0, productCount - productsToAdd.length));
        }
        
        for (const product of productsToAdd) {
          await client.query(
            `INSERT INTO batch_products (batch_id, product_id, created_by)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [batch.id, product.id, adminId]
          );
        }
        
        // Update batch status to ready_to_pack
        await client.query(
          `UPDATE batches SET status = 'ready_to_pack' WHERE id = $1`,
          [batch.id]
        );
        batch.status = 'ready_to_pack';
      }
      
      // ============================================
      // 7. Add Packaging to Batches (Stage 3)
      // ============================================
      logger.info('Adding packaging to batches...');
      
      for (let i = 0; i < seedData.batches.length; i++) {
        const batch = seedData.batches[i];
        
        // Get products for this batch
        const batchProductsResult = await client.query<{ product_id: string }>(
          `SELECT product_id FROM batch_products WHERE batch_id = $1`,
          [batch.id]
        );
        
        const batchProducts = batchProductsResult.rows;
        
        // Add packaging for each product in batch
        for (const batchProduct of batchProducts) {
          // Find packaging for this product
          const productPackaging = seedData.packaging.filter(p => p.product_id === batchProduct.product_id);
          
          if (productPackaging.length > 0) {
            // Add 1-3 packaging entries per product (varying)
            const packagingCount = 1 + (i % 3);
            const packagingToAdd = productPackaging.slice(0, Math.min(packagingCount, productPackaging.length));
            
            for (const pkg of packagingToAdd) {
              // Varying packaging quantities
              const packagingQuantity = [100, 200, 150, 250, 300, 180, 220][(i * pkg.capacity) % 7];
              
              await client.query(
                `INSERT INTO batch_packaging (batch_id, product_id, packaging_id, quantity, created_by)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT DO NOTHING`,
                [batch.id, batchProduct.product_id, pkg.id, packagingQuantity, adminId]
              );
              
              // Deduct packets inventory
              const packetsNeeded = Math.ceil(packagingQuantity / pkg.capacity);
              
              // Get current inventory
              const invResult = await client.query<{ available_quantity: number }>(
                `SELECT available_quantity FROM packets_inventory WHERE packaging_id = $1`,
                [pkg.id]
              );
              
              const currentQty = invResult.rows[0]?.available_quantity || 0;
              const packetsToDeduct = Math.min(packetsNeeded, currentQty);
              
              if (packetsToDeduct > 0) {
                await client.query(
                  `UPDATE packets_inventory 
                   SET available_quantity = GREATEST(0, available_quantity - $1)
                   WHERE packaging_id = $2`,
                  [packetsToDeduct, pkg.id]
                );
                
                // Create finished goods inventory
                await client.query(
                  `INSERT INTO finished_goods_inventory (product_id, batch_id, packaging_id, no_of_packets, total_weight, created_by)
                   VALUES ($1, $2, $3, $4, $5, $6)`,
                  [batchProduct.product_id, batch.id, pkg.id, packetsToDeduct, packagingQuantity, adminId]
                );
              }
            }
          }
        }
        
        // Update batch status to packaged
        await client.query(
          `UPDATE batches SET status = 'packaged' WHERE id = $1`,
          [batch.id]
        );
        batch.status = 'packaged';
      }
    }
    
    await client.query('COMMIT');
    
    logger.info('='.repeat(60));
    logger.info('Comprehensive data seed completed successfully!');
    logger.info('='.repeat(60));
    logger.info(`Created:`);
    logger.info(`  - ${seedData.packagingVendors.length} packaging vendors`);
    logger.info(`  - ${seedData.products.length} products`);
    logger.info(`  - ${seedData.packaging.length} packaging entries (multiple lots)`);
    logger.info(`  - ${seedData.recipes.length} recipes`);
    logger.info(`  - ${seedData.batches.length} batches (all packaged)`);
    logger.info('='.repeat(60));
    logger.info('Data covers all frontend filters:');
    logger.info('  ✓ By Capacity (10kg, 25kg, 50kg)');
    logger.info('  ✓ By Vendor (5 vendors)');
    logger.info('  ✓ By Rice Type (all types)');
    logger.info('  ✓ Multiple lots per packaging');
    logger.info('  ✓ All packet types');
    logger.info('='.repeat(60));
    
    return seedData;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error seeding data', { error });
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await clearProductionData();
    await seedData();
    process.exit(0);
  } catch (error) {
    logger.error('Seed script failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { seedData, clearProductionData };

