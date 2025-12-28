import { db } from '../database/connection';
import { logger } from '../utils/logger';

/**
 * Comprehensive seed script to create realistic production data
 * covering all bifurcations for frontend visualization
 */

interface SeedData {
  packagingVendors: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; brand: string; rice_type: string }>;
  recipes: Array<{ id: string; name: string }>;
  packaging: Array<{ id: string; product_id: string; capacity: number; type: string; vendor_id: string | null }>;
  batches: Array<{ id: string; batch_number: string; status: string }>;
}

async function clearProductionData() {
  logger.info('Clearing all production-related data...');
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Clear in order due to foreign key constraints
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
    
    // Reset bags inventory to 0 (don't delete, just reset)
    await client.query('UPDATE bags_inventory SET filled_bags = 0, empty_bags = 0');
    
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
     LIMIT 20`
  );
  return result.rows;
}

async function seedData() {
  logger.info('Starting data seed...');
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const adminId = await getAdminUserId();
    if (!adminId) {
      throw new Error('Admin user not found. Please create admin user first.');
    }
    
    const availableLots = await getAvailableLots();
    if (availableLots.length < 4) {
      logger.warn('Not enough lots available. Need at least 4 lots for realistic recipes.');
    }
    
    const seedData: SeedData = {
      packagingVendors: [],
      products: [],
      recipes: [],
      packaging: [],
      batches: []
    };
    
    // ============================================
    // 1. Create Packaging Vendors (3 vendors)
    // ============================================
    logger.info('Creating packaging vendors...');
    const vendors = [
      { name: 'ABC Packaging Suppliers', contact_person: 'Rajesh Kumar', phone: '+91-9876543210', email: 'rajesh@abcpackaging.com', gst_number: 'GST123456789' },
      { name: 'XYZ Packaging Solutions', contact_person: 'Priya Sharma', phone: '+91-9876543211', email: 'priya@xyzpackaging.com', gst_number: 'GST987654321' },
      { name: 'Premium Pack Industries', contact_person: 'Amit Patel', phone: '+91-9876543212', email: 'amit@premiumpack.com', gst_number: 'GST456789123' }
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
    // 2. Create Products (covering all bifurcations)
    // ============================================
    logger.info('Creating products...');
    const products = [
      // Tamara Brand - Basmati
      { name: 'Premium Basmati Rice', brand: 'Tamara', rice_type: 'basmati', description: 'High quality premium basmati rice' },
      { name: 'Royal Basmati Rice', brand: 'Tamara', rice_type: 'basmati', description: 'Premium royal basmati variety' },
      { name: 'Classic Basmati Rice', brand: 'Tamara', rice_type: 'basmati', description: 'Classic basmati rice' },
      
      // Tamara Brand - Non-Basmati
      { name: 'Standard White Rice', brand: 'Tamara', rice_type: 'non_basmati', description: 'Standard white rice' },
      { name: 'Premium Long Grain', brand: 'Tamara', rice_type: 'non_basmati', description: 'Premium long grain rice' },
      
      // Tamara Brand - Parboiled
      { name: 'Parboiled Rice', brand: 'Tamara', rice_type: 'parboiled', description: 'Nutritious parboiled rice' },
      
      // Hariom Brand - Basmati
      { name: 'Hariom Basmati Premium', brand: 'Hariom', rice_type: 'basmati', description: 'Hariom premium basmati' },
      { name: 'Hariom Basmati Classic', brand: 'Hariom', rice_type: 'basmati', description: 'Hariom classic basmati' },
      
      // Hariom Brand - Non-Basmati
      { name: 'Hariom White Rice', brand: 'Hariom', rice_type: 'non_basmati', description: 'Hariom white rice' },
      
      // Unbranded
      { name: 'Raw Basmati Rice', brand: null, rice_type: 'raw_basmati', description: 'Raw basmati rice' },
      { name: 'Steam Basmati Rice', brand: null, rice_type: 'steam_basmati', description: 'Steam basmati rice' },
      { name: 'White Sella Rice', brand: null, rice_type: 'white_sella', description: 'White sella variety' },
      { name: 'Golden Sella Rice', brand: null, rice_type: 'golden_sella', description: 'Golden sella variety' }
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
    // 3. Create Packaging (covering all bifurcations)
    // ============================================
    logger.info('Creating packaging...');
    
    // For each product, create multiple packaging options
    // Different capacities (10kg, 25kg, 50kg)
    // Different types (PP Bag, Jute Bag, Woven Bag)
    // Different vendors (distributed across vendors)
    
    const packetTypes = ['PP Bag', 'Jute Bag', 'Woven Bag'];
    const capacities = [10, 25, 50];
    
    for (let i = 0; i < seedData.products.length; i++) {
      const product = seedData.products[i];
      
      // Create 2-3 packaging entries per product with different combinations
      const packagingCount = Math.min(3, Math.floor(Math.random() * 3) + 2);
      
      for (let j = 0; j < packagingCount; j++) {
        const capacity = capacities[j % capacities.length];
        const packetType = packetTypes[j % packetTypes.length];
        const vendorIndex = j % seedData.packagingVendors.length;
        const vendorId = seedData.packagingVendors[vendorIndex].id;
        const orderedWeight = [1000, 2000, 5000, 3000, 1500][j % 5]; // Varying order weights
        
        const result = await client.query<{ id: string }>(
          `INSERT INTO packaging (product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [product.id, capacity, packetType, vendorId, orderedWeight, adminId]
        );
        
        seedData.packaging.push({
          id: result.rows[0].id,
          product_id: product.id,
          capacity,
          type: packetType,
          vendor_id: vendorId
        });
      }
    }
    
    // ============================================
    // 4. Create Recipes (using available lots)
    // ============================================
    logger.info('Creating recipes...');
    
    if (availableLots.length >= 4) {
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
    // 5. Create Packets Inventory (for some packaging)
    // ============================================
    logger.info('Creating packets inventory...');
    
    // Add packets inventory for 60% of packaging entries
    const packagingWithPackets = seedData.packaging.slice(0, Math.floor(seedData.packaging.length * 0.6));
    
    for (const pkg of packagingWithPackets) {
      const availableQuantity = [50, 100, 200, 150, 75, 300][Math.floor(Math.random() * 6)];
      
      await client.query(
        `INSERT INTO packets_inventory (packaging_id, available_quantity, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (packaging_id) DO UPDATE SET available_quantity = EXCLUDED.available_quantity`,
        [pkg.id, availableQuantity, adminId]
      );
    }
    
    // ============================================
    // 6. Create Batches (covering all stages)
    // ============================================
    logger.info('Creating batches...');
    
    if (seedData.recipes.length > 0) {
      const batchQuantities = [500, 1000, 750, 1200, 800, 1500];
      
      // Create batches in different stages
      for (let i = 0; i < 8; i++) {
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
          if (lot) {
            const quantityUsed = (quantity * formulaItem.percentage) / 100;
            
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
        await client.query(
          `UPDATE bags_inventory 
           SET filled_bags = GREATEST(0, filled_bags - $1),
               empty_bags = empty_bags + $1
           WHERE bag_capacity = 50
           AND id = (SELECT id FROM bags_inventory WHERE bag_capacity = 50 LIMIT 1)`,
          [Math.ceil(quantity / 50)]
        );
      }
      
      // ============================================
      // 7. Add Products to Batches (Stage 2)
      // ============================================
      logger.info('Adding products to batches...');
      
      for (let i = 0; i < seedData.batches.length; i++) {
        const batch = seedData.batches[i];
        
        // Add 1-2 products to each batch
        const productCount = Math.floor(Math.random() * 2) + 1;
        const productsToAdd = seedData.products.slice(i, i + productCount);
        
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
      // 8. Add Packaging to Batches (Stage 3)
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
            // Add 1-2 packaging entries per product
            const packagingToAdd = productPackaging.slice(0, Math.min(2, productPackaging.length));
            
            for (const pkg of packagingToAdd) {
              const packagingQuantity = [100, 200, 150, 250, 300][Math.floor(Math.random() * 5)];
              
              await client.query(
                `INSERT INTO batch_packaging (batch_id, product_id, packaging_id, quantity, created_by)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT DO NOTHING`,
                [batch.id, batchProduct.product_id, pkg.id, packagingQuantity, adminId]
              );
              
              // Deduct packets inventory
              const packetsNeeded = Math.ceil(packagingQuantity / pkg.capacity);
              await client.query(
                `UPDATE packets_inventory 
                 SET available_quantity = GREATEST(0, available_quantity - $1)
                 WHERE packaging_id = $2`,
                [packetsNeeded, pkg.id]
              );
              
              // Create finished goods inventory
              await client.query(
                `INSERT INTO finished_goods_inventory (product_id, batch_id, packaging_id, no_of_packets, total_weight, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [batchProduct.product_id, batch.id, pkg.id, packetsNeeded, packagingQuantity, adminId]
              );
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
    
    logger.info('Data seed completed successfully!');
    logger.info(`Created: ${seedData.packagingVendors.length} vendors, ${seedData.products.length} products, ${seedData.packaging.length} packaging, ${seedData.recipes.length} recipes, ${seedData.batches.length} batches`);
    
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

