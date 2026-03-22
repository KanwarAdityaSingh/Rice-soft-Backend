# Frontend Integration Guide: Three-Stage Batch System Refactor

## Overview

The production system has been completely refactored to implement a three-stage batch workflow. This document explains the business logic, backend changes, and API structure to help frontend developers integrate these changes.

---

## Business Logic Changes

### 1. Product Changes

**Previous Behavior:**
- Products required `packet_type` field
- Products had a many-to-many relationship with recipes
- Creating a product automatically created 3 packaging entries (10kg, 25kg, 50kg)

**New Behavior:**
- Products no longer require `packet_type` (removed from schema)
- Products no longer have recipe relationships (removed `product_recipes` table)
- Products now have `rice_type` field (basmati, non_basmati, parboiled, raw, raw_basmati, steam_basmati, white_sella, golden_sella)
- Creating a product does NOT automatically create packaging
- Packaging must be created manually and linked to products

**Business Rationale:**
- Products are now more flexible - they represent the final good without being tied to specific packaging
- Packaging is managed separately and can be created/ordered from vendors independently
- Rice type is now a product attribute, making it easier to categorize and filter products

---

### 2. Packaging Changes

**Previous Behavior:**
- Packaging had a `source` field (text field)
- Packaging was automatically created when product was created
- Packaging was identified by `(holding_capacity, packet_type)` combination

**New Behavior:**
- Packaging has `packaging_vendor_id` field (links to packaging vendor)
- Packaging has `ordered_weight` field (initial ordered quantity from vendor - static, not incremented/decremented)
- Packaging `source` field removed
- Packaging is now product-specific (requires `product_id`)
- Packaging must be manually created and linked to a vendor

**Business Rationale:**
- Better vendor management - track which vendor supplies which packaging
- Track initial order quantities separately from inventory
- Packaging is now explicitly linked to products, allowing better inventory organization

---

### 3. Batch Workflow Changes (MAJOR CHANGE)

**Previous Behavior:**
- Batch creation required: `product_id`, `recipe_id`, `packaging_id`, `quantity`
- All inventory operations happened at once during batch creation
- Single packaging per batch

**New Behavior - Three-Stage Workflow:**

#### Stage 1: Recipe Attachment
- Create batch with only `recipe_id` and `quantity`
- System deducts lots based on recipe formula
- System updates bags inventory (filled → empty)
- Batch status: `recipe_attached`
- **No products or packaging attached yet**
- **No finished goods created yet**

#### Stage 2: Product Attachment
- Add one or more products to the batch
- Products are attached via `POST /batches/{id}/products`
- Batch status changes to: `ready_to_pack`
- **Still no packaging or finished goods**

#### Stage 3: Packaging Attachment
- Add packaging to the batch (can add multiple packaging entries)
- Packaging is filtered by the products attached in Stage 2
- System deducts packets inventory
- System creates finished goods inventory entries
- Batch status changes to: `packaged`
- **Multiple packaging entries allowed per product**

**Business Rationale:**
- Separates recipe execution from product assignment
- Allows flexibility to assign different products to the same batch
- Allows multiple packaging sizes per product in a single batch
- Better workflow control and tracking

---

### 4. Inventory Display Changes

**Previous Behavior:**
- Flat inventory lists
- Grouped by packaging type

**New Behavior:**
- Hierarchical inventory structure
- Groups by: Brand → Products → Packaging → Finished Goods
- Shows vendor information for each packaging
- Shows all finished goods nested under their packaging

**Business Rationale:**
- Better visualization of inventory structure
- Easier to understand which products are in which packaging
- Shows complete production chain from brand to final packaged goods

---

## Backend Logic & Data Flow

### Database Schema Changes

#### New Tables:
1. **`packaging_vendors`** - Stores vendor information
   - Fields: `id`, `name`, `contact_person`, `phone`, `email`, `address`, `gst_number`
   
2. **`batch_products`** - Junction table for batch-product relationship (Stage 2)
   - Fields: `id`, `batch_id`, `product_id`
   - Many-to-many: One batch can have multiple products, one product can be in multiple batches
   
3. **`batch_packaging`** - Junction table for batch-packaging relationship (Stage 3)
   - Fields: `id`, `batch_id`, `product_id`, `packaging_id`, `quantity`
   - Many-to-many: One batch can have multiple packaging entries
   - Includes `product_id` for validation (packaging must belong to attached product)

#### Modified Tables:
1. **`products`**
   - Added: `rice_type` (enum, nullable)
   - Removed: No `packet_type` column (was never in DB, only in DTO)
   - Removed: `product_recipes` junction table dropped

2. **`packaging`**
   - Added: `packaging_vendor_id` (UUID, nullable, references `packaging_vendors`)
   - Added: `ordered_weight` (DECIMAL, nullable)
   - Removed: `source` column
   - Kept: `product_id` (already existed)

3. **`batches`**
   - Modified: `product_id` is now nullable (set in Stage 2)
   - Modified: `packaging_id` is now nullable (kept for backward compatibility)
   - Modified: `status` enum now includes: `recipe_attached`, `ready_to_pack`, `packaged`

---

## API Structure

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication
All endpoints require Bearer token authentication:
```
Authorization: Bearer <token>
```

---

## API Endpoints

### 1. Packaging Vendor Endpoints

#### Create Packaging Vendor
```
POST /packaging-vendors
```
**Request Body:**
```json
{
  "name": "ABC Packaging Suppliers",
  "contact_person": "John Doe",
  "phone": "+1234567890",
  "email": "john@abcpackaging.com",
  "address": "123 Main St, City, State",
  "gst_number": "GST123456"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Packaging vendor created successfully",
  "data": {
    "id": "uuid",
    "name": "ABC Packaging Suppliers",
    "contact_person": "John Doe",
    "phone": "+1234567890",
    "email": "john@abcpackaging.com",
    "address": "123 Main St, City, State",
    "gst_number": "GST123456",
    "created_at": "2025-12-28T07:30:31.649Z",
    "updated_at": "2025-12-28T07:30:31.649Z"
  }
}
```

#### Get All Packaging Vendors
```
GET /packaging-vendors
```
**Response:** Array of packaging vendor objects

#### Lookup GST (prefill vendor form)
Same response as `GET /vendors/lookupGST` (`gst_data`, `mapped_data`). Paths: `GET /packaging-vendors/lookupGST?gst_number=` (aliases: `/lookupgst`, `/lookup-gst`; legacy: `/packaging-vendors/gst/lookup`).

#### Get Packaging Vendor by ID
```
GET /packaging-vendors/:id
```

#### Update Packaging Vendor
```
PUT /packaging-vendors/:id
```

#### Delete Packaging Vendor
```
DELETE /packaging-vendors/:id
```

---

### 2. Product Endpoints (Modified)

#### Create Product
```
POST /products
```
**Request Body (CHANGED):**
```json
{
  "name": "Premium Basmati Rice",
  "description": "High quality basmati rice",
  "brand": "Tamara",
  "rice_type": "basmati"  // NEW FIELD, optional
  // packet_type REMOVED - no longer required
}
```
**Response:**
```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "id": "uuid",
    "name": "Premium Basmati Rice",
    "description": "High quality basmati rice",
    "brand": "Tamara",
    "rice_type": "basmati",  // NEW FIELD
    "created_at": "2025-12-28T07:30:37.545Z",
    "updated_at": "2025-12-28T07:30:37.545Z"
  }
}
```
**Note:** No automatic packaging creation. Packaging must be created separately.

#### Get All Products
```
GET /products
```
**Response:** Array of products (NO `recipes` field anymore)

#### Get Product by ID
```
GET /products/:id
```
**Response:** Single product object (NO `recipes` field)

#### Update Product
```
PUT /products/:id
```
**Request Body:**
```json
{
  "name": "Updated Name",
  "rice_type": "non_basmati"  // Can update rice_type
}
```

#### Delete Product
```
DELETE /products/:id
```

**REMOVED Endpoints:**
- `POST /products/:id/recipes` - No longer exists
- `DELETE /products/:id/recipes/:recipeId` - No longer exists

---

### 3. Packaging Endpoints (Modified)

#### Create Packaging
```
POST /packaging
```
**Request Body (CHANGED):**
```json
{
  "product_id": "uuid",  // REQUIRED - packaging is product-specific
  "holding_capacity": 25,  // 10, 25, or 50
  "packet_type": "PP Bag",
  "packaging_vendor_id": "uuid",  // NEW FIELD, optional
  "ordered_weight": 1000  // NEW FIELD, optional (initial ordered quantity)
  // source REMOVED - no longer exists
}
```
**Response:**
```json
{
  "success": true,
  "message": "Packaging created successfully",
  "data": {
    "id": "uuid",
    "product_id": "uuid",
    "holding_capacity": "25.00",
    "packet_type": "PP Bag",
    "packaging_vendor_id": "uuid",  // NEW FIELD
    "ordered_weight": "1000.00",  // NEW FIELD
    "created_at": "2025-12-28T07:30:45.591Z",
    "updated_at": "2025-12-28T07:30:45.591Z"
  }
}
```

#### Get All Packaging
```
GET /packaging?product_id={productId}  // Optional filter
```
**Response:** Array of packaging objects with `packaging_vendor_id` and `ordered_weight`

#### Get Packaging by ID
```
GET /packaging/:id
```

#### Update Packaging
```
PUT /packaging/:id
```
**Request Body:**
```json
{
  "packaging_vendor_id": "uuid",  // Can update vendor
  "ordered_weight": 1500  // Can update ordered weight
}
```

#### Delete Packaging
```
DELETE /packaging/:id
```

#### Add Packets Inventory
```
POST /packaging/:id/inventory
```
**Request Body:**
```json
{
  "packaging_id": "uuid",  // REQUIRED (even though it's in URL)
  "available_quantity": 100
}
```
**Note:** The `packaging_id` must be included in the body even though it's in the URL path.

---

### 4. Recipe Endpoints (Unchanged)

Recipes work the same way, but they are no longer linked to products.

#### Create Recipe
```
POST /recipes
```
**Request Body:**
```json
{
  "recipe_name": "Premium Mix Recipe",
  "formula": [
    {"lot_id": "uuid", "percentage": 60},
    {"lot_id": "uuid", "percentage": 40}
  ]
}
```

---

### 5. Batch Endpoints (MAJOR CHANGES)

#### Create Batch (Stage 1: Recipe Attachment)
```
POST /batches
```
**Request Body (CHANGED):**
```json
{
  "recipe_id": "uuid",  // REQUIRED
  "quantity": 500,  // REQUIRED - total quantity in kg
  "batch_number": "optional-custom-number",  // Optional
  "status": "recipe_attached"  // Optional, defaults to "recipe_attached"
  // product_id REMOVED - no longer in request
  // packaging_id REMOVED - no longer in request
  // packaging_quantities REMOVED - handled in Stage 3
}
```
**Response:**
```json
{
  "success": true,
  "message": "Batch created successfully",
  "data": {
    "id": "uuid",
    "batch_number": "BATCH-20251228-0580dd7c",
    "product_id": null,  // NULL in Stage 1
    "recipe_id": "uuid",
    "packaging_id": null,  // NULL in Stage 1
    "quantity": 500,
    "status": "recipe_attached",  // NEW STATUS
    "created_at": "2025-12-28T07:31:01.272Z",
    "updated_at": "2025-12-28T07:31:01.272Z"
  }
}
```
**Backend Logic:**
- Validates recipe exists
- Validates recipe formula sums to 100%
- Calculates lot quantities based on recipe percentages
- Checks lot inventory has sufficient quantity
- Deducts lot inventory
- Updates bags inventory (filled → empty)
- Creates batch_lot_usage records
- Creates batch_rice_code_usage records
- Sets status to `recipe_attached`

#### Get Batch by ID
```
GET /batches/:id
```
**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "batch_number": "BATCH-20251228-0580dd7c",
    "product_id": null,  // May be null
    "recipe_id": "uuid",
    "packaging_id": null,  // May be null
    "quantity": 500,
    "status": "recipe_attached" | "ready_to_pack" | "packaged" | "completed" | "cancelled",
    "recipe": {
      "id": "uuid",
      "recipe_name": "Premium Mix Recipe"
    },
    "lot_usage": [
      {
        "id": "uuid",
        "lot_id": "uuid",
        "quantity_used": 300,
        "percentage_used": 60
      }
    ],
    "rice_code_usage": [
      {
        "id": "uuid",
        "rice_code_id": "uuid",
        "rice_type": "basmati",
        "total_quantity_used": 500
      }
    ],
    "products": [  // NEW FIELD
      {
        "id": "uuid",
        "product_id": "uuid"
      }
    ],
    "packaging_list": [  // NEW FIELD
      {
        "id": "uuid",
        "product_id": "uuid",
        "packaging_id": "uuid",
        "quantity": 200
      }
    ]
  }
}
```

#### Update Batch
```
PUT /batches/:id
```
**Request Body:**
```json
{
  "status": "completed",  // Can update status
  "quantity": 500  // Can update quantity
}
```

---

### 6. Batch Product Endpoints (NEW - Stage 2)

#### Add Product to Batch
```
POST /batches/:id/products
```
**Request Body:**
```json
{
  "product_id": "uuid"  // REQUIRED
}
```
**Response:**
```json
{
  "success": true,
  "message": "Product added to batch successfully"
}
```
**Backend Logic:**
- Validates batch exists and status is `recipe_attached`
- Validates product exists
- Adds product to `batch_products` table
- Updates batch status to `ready_to_pack` (if not already)
- Allows multiple products to be added

#### Get Batch Products
```
GET /batches/:id/products
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "batch_id": "uuid",
      "product_id": "uuid",
      "created_at": "2025-12-28T07:31:06.085Z",
      "updated_at": "2025-12-28T07:31:06.085Z"
    }
  ]
}
```

#### Remove Product from Batch
```
DELETE /batches/:id/products/:productId
```
**Backend Logic:**
- Validates batch status is `ready_to_pack`
- Removes product from batch
- If no products remain, reverts status to `recipe_attached`

---

### 7. Batch Packaging Endpoints (NEW - Stage 3)

#### Add Packaging to Batch
```
POST /batches/:id/packaging
```
**Request Body:**
```json
{
  "product_id": "uuid",  // REQUIRED - must match product attached in Stage 2
  "packaging_id": "uuid",  // REQUIRED - must belong to the product_id
  "quantity": 200  // REQUIRED - quantity in kg for this packaging
}
```
**Response:**
```json
{
  "success": true,
  "message": "Packaging added to batch successfully"
}
```
**Backend Logic:**
- Validates batch exists and status is `ready_to_pack` or `packaged`
- Validates product is attached to batch (from Stage 2)
- Validates packaging exists and belongs to the specified product
- Calculates packets needed: `ceil(quantity / holding_capacity)`
- Checks packets inventory has sufficient quantity
- Deducts packets inventory
- Creates finished goods inventory entry
- Updates batch status to `packaged` (if not already)
- Allows multiple packaging entries per product

**Important:** You can add multiple packaging entries to the same batch, even after status is `packaged`.

#### Get Batch Packaging
```
GET /batches/:id/packaging
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "batch_id": "uuid",
      "product_id": "uuid",
      "packaging_id": "uuid",
      "quantity": "200.00",  // Quantity in kg
      "created_at": "2025-12-28T07:31:47.431Z",
      "updated_at": "2025-12-28T07:31:47.431Z"
    }
  ]
}
```

#### Get Batch Packaging by Product
```
GET /batches/:id/packaging?product_id={productId}
```
**Note:** Filter packaging by product (useful for Stage 3 UI)

#### Remove Packaging from Batch
```
DELETE /batches/:id/packaging/:packagingId
```
**Note:** This does NOT reverse finished goods or packets inventory (design decision).

---

### 8. Inventory Endpoints (Modified)

#### Get Finished Goods Inventory
```
GET /inventory/finished-goods?product_id={productId}&batch_id={batchId}
```
**Response:** Same as before, but now includes packaging vendor info in packaging object

#### Get Packets Inventory
```
GET /inventory/packets
```
**Response:** Same structure, but packaging object now has `packaging_vendor_id` and `ordered_weight` instead of `source`

#### Get Hierarchical Inventory (NEW)
```
GET /inventory/hierarchical
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "brand": "Tamara",
      "products": [
        {
          "product_id": "uuid",
          "product_name": "Premium Basmati Rice",
          "rice_type": "basmati",
          "packaging": [
            {
              "packaging_id": "uuid",
              "holding_capacity": "25.00",
              "packet_type": "PP Bag",
              "vendor": {
                "id": "uuid",
                "name": "ABC Packaging Suppliers"
              },
              "finished_goods": [
                {
                  "batch_id": "uuid",
                  "batch_number": "BATCH-20251228-0580dd7c",
                  "quantity": 200,
                  "packets": 8,
                  "weight": 200
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```
**Structure:**
- Groups by brand
- Each brand has array of products
- Each product has array of packaging
- Each packaging has vendor info and array of finished goods
- Top-down hierarchy: Brand → Product → Packaging → Finished Goods

---

## Frontend Implementation Guide

### 1. Product Creation Flow

**Before:**
```javascript
// OLD - Required packet_type
const product = await createProduct({
  name: "Premium Rice",
  brand: "Tamara",
  packet_type: "PP Bag"  // Required
});
// Packaging automatically created
```

**After:**
```javascript
// NEW - No packet_type, has rice_type
const product = await createProduct({
  name: "Premium Rice",
  brand: "Tamara",
  rice_type: "basmati"  // Optional
});
// No automatic packaging - must create separately
```

### 2. Packaging Creation Flow

**Before:**
```javascript
// OLD - Had source field
const packaging = await createPackaging({
  product_id: productId,
  holding_capacity: 25,
  packet_type: "PP Bag",
  source: "Vendor ABC"  // Old field
});
```

**After:**
```javascript
// NEW - Has vendor_id and ordered_weight
const packaging = await createPackaging({
  product_id: productId,
  holding_capacity: 25,
  packet_type: "PP Bag",
  packaging_vendor_id: vendorId,  // NEW - link to vendor
  ordered_weight: 1000  // NEW - initial order quantity
});
```

### 3. Batch Creation Flow (Three Stages)

#### Stage 1: Recipe Attachment
```javascript
// Step 1: Create batch with recipe
const batch = await createBatch({
  recipe_id: recipeId,
  quantity: 500  // Total quantity in kg
});
// Status: "recipe_attached"
// Lots deducted, bags updated
// No products or packaging yet
```

#### Stage 2: Product Attachment
```javascript
// Step 2: Add products to batch
await addProductToBatch(batch.id, {
  product_id: productId
});
// Status: "ready_to_pack"
// Can add multiple products
```

#### Stage 3: Packaging Attachment
```javascript
// Step 3: Add packaging to batch
// First, get packaging for the attached products
const packaging = await getPackaging({ product_id: productId });

// Then add packaging
await addPackagingToBatch(batch.id, {
  product_id: productId,
  packaging_id: packagingId,
  quantity: 200  // Quantity in kg
});
// Status: "packaged"
// Packets deducted, finished goods created
// Can add multiple packaging entries
```

### 4. Batch Status Flow

```
planned → recipe_attached → ready_to_pack → packaged → completed
                              ↑
                         (add products)
                              ↓
                         (add packaging)
```

**Status Meanings:**
- `recipe_attached`: Recipe applied, lots deducted, ready for product assignment
- `ready_to_pack`: Products assigned, ready for packaging
- `packaged`: Packaging attached, finished goods created
- `completed`: Batch finalized (manual status update)
- `cancelled`: Batch cancelled

### 5. UI Flow Recommendations

#### Batch Creation Screen
1. **Stage 1 Section:**
   - Recipe selector (dropdown)
   - Quantity input (kg)
   - Show lot requirements based on recipe
   - Create batch button
   - After creation: Show lot usage, bags updated

2. **Stage 2 Section (enabled after Stage 1):**
   - Product selector (multi-select)
   - Add product button
   - List of attached products
   - Remove product button
   - Status indicator: "Ready to Pack"

3. **Stage 3 Section (enabled after Stage 2):**
   - Filter packaging by selected products
   - Show available packaging for each product
   - For each packaging:
     - Packaging details (capacity, type, vendor)
     - Available packets count
     - Quantity input (kg)
     - Add packaging button
   - List of attached packaging
   - Remove packaging button
   - Status indicator: "Packaged"

#### Packaging Selection Logic (Stage 3)
```javascript
// Get products attached to batch
const batchProducts = await getBatchProducts(batchId);

// For each product, get its packaging
const packagingOptions = [];
for (const batchProduct of batchProducts) {
  const packaging = await getPackaging({ 
    product_id: batchProduct.product_id 
  });
  packagingOptions.push({
    product: batchProduct,
    packaging: packaging
  });
}

// Display packaging grouped by product
// User selects packaging and enters quantity
```

### 6. Inventory Display

#### Hierarchical Inventory View
```javascript
const hierarchical = await getHierarchicalInventory();

// Structure:
hierarchical.data.forEach(brand => {
  console.log(`Brand: ${brand.brand}`);
  brand.products.forEach(product => {
    console.log(`  Product: ${product.product_name} (${product.rice_type})`);
    product.packaging.forEach(pkg => {
      console.log(`    Packaging: ${pkg.holding_capacity}kg ${pkg.packet_type}`);
      console.log(`      Vendor: ${pkg.vendor?.name || 'N/A'}`);
      pkg.finished_goods.forEach(fg => {
        console.log(`        Batch: ${fg.batch_number} - ${fg.packets} packets, ${fg.weight}kg`);
      });
    });
  });
});
```

**UI Structure:**
```
Brand: Tamara
  ├── Product: Premium Basmati Rice (basmati)
  │   ├── Packaging: 25kg PP Bag
  │   │   ├── Vendor: ABC Packaging Suppliers
  │   │   └── Finished Goods:
  │   │       └── BATCH-20251228-0580dd7c: 8 packets, 200kg
  │   └── Packaging: 10kg PP Bag
  │       ├── Vendor: ABC Packaging Suppliers
  │       └── Finished Goods:
  │           └── BATCH-20251228-0580dd7c: 10 packets, 100kg
  └── Product: Another Product...
```

---

## Data Models

### Product Model
```typescript
interface Product {
  id: string;
  name: string;
  description: string | null;
  brand: 'Tamara' | 'Hariom' | null;
  rice_type: 'basmati' | 'non_basmati' | 'parboiled' | 'raw' | 'raw_basmati' | 'steam_basmati' | 'white_sella' | 'golden_sella' | null;
  created_at: string;
  updated_at: string;
}
```

### Packaging Model
```typescript
interface Packaging {
  id: string;
  product_id: string;
  holding_capacity: 10 | 25 | 50;
  packet_type: string;
  packaging_vendor_id: string | null;  // NEW
  ordered_weight: number | null;  // NEW
  created_at: string;
  updated_at: string;
}
```

### Packaging Vendor Model
```typescript
interface PackagingVendor {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  created_at: string;
  updated_at: string;
}
```

### Batch Model
```typescript
interface Batch {
  id: string;
  batch_number: string;
  product_id: string | null;  // NULLABLE - set in Stage 2
  recipe_id: string;
  packaging_id: string | null;  // NULLABLE - kept for backward compatibility
  quantity: number;
  status: 'planned' | 'in_progress' | 'recipe_attached' | 'ready_to_pack' | 'packaged' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

interface BatchProduct {
  id: string;
  batch_id: string;
  product_id: string;
  created_at: string;
  updated_at: string;
}

interface BatchPackaging {
  id: string;
  batch_id: string;
  product_id: string;
  packaging_id: string;
  quantity: number;  // Quantity in kg
  created_at: string;
  updated_at: string;
}
```

---

## Error Handling

### Common Error Scenarios

1. **Adding packaging without sufficient packets:**
   ```
   Error: "Insufficient empty packets for 25.00 kg packaging. Available: 0, Required: 8"
   ```
   **Solution:** Add packets inventory first

2. **Adding packaging when batch not ready:**
   ```
   Error: "Cannot add packaging to batch in status: recipe_attached. Expected: ready_to_pack or packaged"
   ```
   **Solution:** Add products first (Stage 2)

3. **Adding packaging for product not in batch:**
   ```
   Error: "Product must be attached to batch before adding packaging"
   ```
   **Solution:** Add product to batch first

4. **Adding product when batch not ready:**
   ```
   Error: "Cannot add products to batch in status: packaged. Expected: recipe_attached"
   ```
   **Solution:** Products can only be added when status is `recipe_attached`

---

## Migration Notes for Frontend

### Breaking Changes

1. **Product Creation:**
   - Remove `packet_type` field from product creation form
   - Add `rice_type` dropdown/selector
   - Remove automatic packaging creation logic
   - Add manual packaging creation flow

2. **Product Display:**
   - Remove recipe relationship display
   - Add `rice_type` display
   - Remove "Linked Recipes" section

3. **Batch Creation:**
   - Completely redesign batch creation flow
   - Implement three-stage wizard/stepper
   - Remove `product_id` and `packaging_id` from initial batch creation
   - Add Stage 2: Product attachment UI
   - Add Stage 3: Packaging attachment UI

4. **Packaging:**
   - Add vendor selector to packaging creation
   - Add `ordered_weight` input field
   - Remove `source` field
   - Update packaging display to show vendor info

5. **Inventory:**
   - Implement hierarchical inventory view
   - Update inventory display to show brand → product → packaging structure
   - Add vendor information display

---

## Key Implementation Points

1. **Batch Status Management:**
   - Track batch status to enable/disable UI sections
   - Show appropriate actions based on status
   - Prevent invalid state transitions

2. **Packaging Filtering (Stage 3):**
   - Only show packaging for products attached to batch
   - Group packaging by product
   - Show vendor information for each packaging option

3. **Multiple Packaging Support:**
   - Allow adding multiple packaging entries
   - Show list of all packaging attached to batch
   - Calculate total production across all packaging

4. **Inventory Display:**
   - Implement expandable/collapsible tree structure
   - Show vendor information at packaging level
   - Show finished goods nested under packaging
   - Group by brand for top-level organization

---

## Testing Checklist for Frontend

- [ ] Create product without packet_type
- [ ] Create product with rice_type
- [ ] Create packaging with vendor_id and ordered_weight
- [ ] Create batch with only recipe and quantity
- [ ] Add products to batch (Stage 2)
- [ ] Add packaging to batch (Stage 3)
- [ ] Add multiple packaging entries to same batch
- [ ] Verify batch status transitions
- [ ] Display hierarchical inventory correctly
- [ ] Handle error cases (insufficient packets, wrong status, etc.)
- [ ] Filter packaging by product in Stage 3
- [ ] Display vendor information in inventory

---

## Summary

The system now supports a flexible three-stage batch workflow that separates recipe execution from product assignment and packaging. This allows for:
- Better workflow control
- Multiple products per batch
- Multiple packaging per product
- Better inventory organization
- Vendor tracking for packaging

All changes maintain backward compatibility where possible, but the batch creation flow is fundamentally different and requires frontend updates.

