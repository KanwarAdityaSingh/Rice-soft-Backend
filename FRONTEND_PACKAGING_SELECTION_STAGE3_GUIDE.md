# Frontend Guide: Packaging Selection in Batch Stage 3

## Overview

This comprehensive guide explains how to implement packaging selection in Stage 3 of the batch creation workflow. It covers all available packaging keys/fields, filtering strategies, validation requirements, and implementation patterns.

---

## Table of Contents

1. [Stage 3 Context & Requirements](#1-stage-3-context--requirements)
2. [Packaging Data Structure & Available Keys](#2-packaging-data-structure--available-keys)
3. [Packaging Selection Logic](#3-packaging-selection-logic)
4. [Filtering Strategies](#4-filtering-strategies)
5. [API Endpoints & Data Flow](#5-api-endpoints--data-flow)
6. [Implementation Patterns](#6-implementation-patterns)
7. [Validation & Error Handling](#7-validation--error-handling)
8. [User Experience Flow](#8-user-experience-flow)

---

## 1. Stage 3 Context & Requirements

### Prerequisites

**Before Stage 3 can be accessed:**
- Stage 1 must be completed: Batch created with recipe attached, status = `recipe_attached`
- Stage 2 must be completed: At least one product added to batch, status = `ready_to_pack` or `packaged`

### Stage 3 Purpose

**Objective:** Attach packaging to the batch for each product that was added in Stage 2.

**Key Requirements:**
- Only show packaging for products that are attached to the batch
- Packaging must belong to the product (validated by `product_id`)
- Multiple packaging entries can be added per product
- Each packaging entry requires a quantity (in kg)
- Packets inventory must be sufficient for the selected packaging
- Finished goods inventory is created automatically upon packaging attachment

---

## 2. Packaging Data Structure & Available Keys

### Packaging Model

```typescript
interface Packaging {
  id: string;                    // Unique packaging identifier
  product_id: string;             // REQUIRED - Links packaging to product
  holding_capacity: 10 | 25 | 50; // Weight capacity per packet (kg)
  packet_type: string;           // Type of packet (e.g., "PP Bag", "Jute Bag", "Woven Bag")
  packaging_vendor_id: string | null; // Vendor who supplies this packaging
  ordered_weight: number | null;  // Initial ordered quantity from vendor (static)
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
}
```

### Available Keys for Selection/Filtering

1. **`product_id`** (REQUIRED)
   - **Purpose:** Primary filter - only show packaging for products attached to batch
   - **Type:** `string` (UUID)
   - **Usage:** Filter packaging by products in `batch_products`

2. **`holding_capacity`** (10, 25, 50 kg)
   - **Purpose:** Filter/group by packet size
   - **Type:** `10 | 25 | 50`
   - **Usage:** Allow users to select packaging by capacity

3. **`packet_type`** (PP Bag, Jute Bag, etc.)
   - **Purpose:** Filter/group by packet material/type
   - **Type:** `string`
   - **Usage:** Allow users to select packaging by material type

4. **`packaging_vendor_id`** (UUID or null)
   - **Purpose:** Filter/group by vendor
   - **Type:** `string | null`
   - **Usage:** Allow users to select packaging by supplier

5. **`ordered_weight`** (number or null)
   - **Purpose:** Display initial order quantity (informational)
   - **Type:** `number | null`
   - **Usage:** Show procurement history, not used for filtering

---

## 3. Packaging Selection Logic

### Step-by-Step Selection Process

#### Step 1: Get Products Attached to Batch

```typescript
// API Call
GET /api/v1/batches/{batchId}/products

// Response
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "batch_id": "uuid",
      "product_id": "uuid",
      "created_at": "2025-12-28T...",
      "updated_at": "2025-12-28T..."
    }
  ]
}
```

**Frontend Logic:**
```typescript
const batchProducts = await fetch(`/api/v1/batches/${batchId}/products`);
const products = batchProducts.data;

// Extract unique product IDs
const productIds = products.map(bp => bp.product_id);
```

#### Step 2: Fetch Packaging for Attached Products

```typescript
// Option 1: Fetch all packaging, then filter
GET /api/v1/packaging

// Option 2: Fetch packaging for specific product
GET /api/v1/packaging?product_id={productId}
```

**Frontend Logic:**
```typescript
// For each product, fetch its packaging
const packagingByProduct = new Map<string, Packaging[]>();

for (const productId of productIds) {
  const response = await fetch(`/api/v1/packaging?product_id=${productId}`);
  const packaging = response.data;
  packagingByProduct.set(productId, packaging);
}
```

#### Step 3: Get Packets Inventory for Available Packaging

```typescript
// API Call
GET /api/v1/inventory/packets

// Response includes packaging details
{
  "success": true,
  "data": [
    {
      "packaging_id": "uuid",
      "available_quantity": 100,  // Number of empty packets available
      "packaging": {
        "id": "uuid",
        "product_id": "uuid",
        "holding_capacity": 25,
        "packet_type": "PP Bag",
        "packaging_vendor_id": "uuid",
        "ordered_weight": 2000
      }
    }
  ]
}
```

**Frontend Logic:**
```typescript
const packetsInventory = await fetch('/api/v1/inventory/packets');
const packetsMap = new Map<string, number>();

// Create map of packaging_id -> available_quantity
packetsInventory.data.forEach(item => {
  packetsMap.set(item.packaging_id, item.available_quantity);
});
```

#### Step 4: Enrich Packaging with Inventory & Vendor Data

```typescript
// Fetch vendors
const vendors = await fetch('/api/v1/packaging-vendors');
const vendorsMap = new Map<string, PackagingVendor>();
vendors.data.forEach(v => vendorsMap.set(v.id, v));

// Enrich packaging data
const enrichedPackaging = packagingByProduct.map((packaging, productId) => {
  return packaging.map(pkg => {
    const availablePackets = packetsMap.get(pkg.id) || 0;
    const vendor = pkg.packaging_vendor_id 
      ? vendorsMap.get(pkg.packaging_vendor_id) 
      : null;
    
    return {
      ...pkg,
      available_packets: availablePackets,
      available_weight: availablePackets * pkg.holding_capacity, // Total kg available
      vendor: vendor
    };
  });
});
```

---

## 4. Filtering Strategies

### Strategy 1: Filter by Product (Primary - Required)

**Purpose:** Only show packaging for products attached to batch

**Implementation:**
```typescript
function filterPackagingByBatchProducts(
  allPackaging: Packaging[],
  batchProductIds: string[]
): Packaging[] {
  return allPackaging.filter(pkg => 
    batchProductIds.includes(pkg.product_id)
  );
}
```

**Why:** This is a hard requirement - packaging must belong to products in the batch.

---

### Strategy 2: Filter by Holding Capacity

**Purpose:** Allow users to select packaging by size (10kg, 25kg, 50kg)

**Implementation:**
```typescript
function filterPackagingByCapacity(
  packaging: Packaging[],
  capacities: number[]
): Packaging[] {
  return packaging.filter(pkg => 
    capacities.includes(pkg.holding_capacity)
  );
}

// Usage examples:
const smallPackaging = filterPackagingByCapacity(packaging, [10]);
const mediumPackaging = filterPackagingByCapacity(packaging, [25]);
const largePackaging = filterPackagingByCapacity(packaging, [50]);
const allSizes = filterPackagingByCapacity(packaging, [10, 25, 50]);
```

**UI Pattern:**
- Checkboxes or toggle buttons for capacity selection
- "10kg", "25kg", "50kg" options
- Can select multiple capacities

---

### Strategy 3: Filter by Packet Type

**Purpose:** Allow users to select packaging by material/type

**Implementation:**
```typescript
function filterPackagingByType(
  packaging: Packaging[],
  types: string[]
): Packaging[] {
  return packaging.filter(pkg => 
    types.includes(pkg.packet_type)
  );
}

// Usage examples:
const ppBags = filterPackagingByType(packaging, ['PP Bag']);
const juteBags = filterPackagingByType(packaging, ['Jute Bag']);
const allTypes = filterPackagingByType(packaging, ['PP Bag', 'Jute Bag', 'Woven Bag']);
```

**UI Pattern:**
- Dropdown or multi-select for packet types
- Show unique packet types from available packaging
- Can select multiple types

---

### Strategy 4: Filter by Vendor

**Purpose:** Allow users to select packaging by supplier

**Implementation:**
```typescript
function filterPackagingByVendor(
  packaging: Packaging[],
  vendorIds: string[]
): Packaging[] {
  return packaging.filter(pkg => {
    if (!pkg.packaging_vendor_id) return false; // Exclude unassigned
    return vendorIds.includes(pkg.packaging_vendor_id);
  });
}

// Usage examples:
const vendorAPackaging = filterPackagingByVendor(packaging, [vendorAId]);
const multipleVendors = filterPackagingByVendor(packaging, [vendorAId, vendorBId]);
```

**UI Pattern:**
- Dropdown or multi-select for vendors
- Show vendor names (not IDs)
- Include "Unassigned" option if needed
- Can select multiple vendors

---

### Strategy 5: Filter by Availability (Packets Inventory)

**Purpose:** Only show packaging with sufficient empty packets

**Implementation:**
```typescript
function filterPackagingByAvailability(
  packaging: Packaging[],
  packetsMap: Map<string, number>,
  minAvailable: number = 0
): Packaging[] {
  return packaging.filter(pkg => {
    const available = packetsMap.get(pkg.id) || 0;
    return available >= minAvailable;
  });
}

// Usage examples:
// Show only packaging with at least 10 packets available
const availablePackaging = filterPackagingByAvailability(
  packaging, 
  packetsMap, 
  10
);

// Show only packaging with sufficient packets for a specific quantity
function filterByQuantityRequirement(
  packaging: Packaging[],
  packetsMap: Map<string, number>,
  requiredQuantity: number
): Packaging[] {
  return packaging.filter(pkg => {
    const availablePackets = packetsMap.get(pkg.id) || 0;
    const packetsNeeded = Math.ceil(requiredQuantity / pkg.holding_capacity);
    return availablePackets >= packetsNeeded;
  });
}
```

**UI Pattern:**
- Show availability status (Available / Low Stock / Out of Stock)
- Disable or hide packaging with insufficient inventory
- Show available quantity next to each packaging option

---

### Strategy 6: Combined Multi-Filter

**Purpose:** Apply multiple filters simultaneously

**Implementation:**
```typescript
interface PackagingFilters {
  productIds?: string[];        // Required - from batch products
  capacities?: number[];        // Optional - 10, 25, 50
  packetTypes?: string[];       // Optional - PP Bag, Jute Bag, etc.
  vendorIds?: string[];         // Optional - vendor IDs
  minAvailablePackets?: number; // Optional - minimum inventory
  searchText?: string;          // Optional - search in packet_type or vendor name
}

function filterPackaging(
  allPackaging: Packaging[],
  filters: PackagingFilters,
  packetsMap: Map<string, number>,
  vendorsMap: Map<string, PackagingVendor>
): Packaging[] {
  let filtered = allPackaging;

  // 1. Filter by product (required)
  if (filters.productIds && filters.productIds.length > 0) {
    filtered = filtered.filter(pkg => 
      filters.productIds!.includes(pkg.product_id)
    );
  }

  // 2. Filter by capacity
  if (filters.capacities && filters.capacities.length > 0) {
    filtered = filtered.filter(pkg => 
      filters.capacities!.includes(pkg.holding_capacity)
    );
  }

  // 3. Filter by packet type
  if (filters.packetTypes && filters.packetTypes.length > 0) {
    filtered = filtered.filter(pkg => 
      filters.packetTypes!.includes(pkg.packet_type)
    );
  }

  // 4. Filter by vendor
  if (filters.vendorIds && filters.vendorIds.length > 0) {
    filtered = filtered.filter(pkg => {
      if (!pkg.packaging_vendor_id) return false;
      return filters.vendorIds!.includes(pkg.packaging_vendor_id);
    });
  }

  // 5. Filter by availability
  if (filters.minAvailablePackets !== undefined) {
    filtered = filtered.filter(pkg => {
      const available = packetsMap.get(pkg.id) || 0;
      return available >= filters.minAvailablePackets!;
    });
  }

  // 6. Search filter
  if (filters.searchText) {
    const searchLower = filters.searchText.toLowerCase();
    filtered = filtered.filter(pkg => {
      const matchesType = pkg.packet_type.toLowerCase().includes(searchLower);
      const vendor = pkg.packaging_vendor_id 
        ? vendorsMap.get(pkg.packaging_vendor_id) 
        : null;
      const matchesVendor = vendor?.name.toLowerCase().includes(searchLower);
      return matchesType || matchesVendor;
    });
  }

  return filtered;
}
```

---

## 5. API Endpoints & Data Flow

### Required API Calls for Stage 3

#### 1. Get Batch Products (Required)
```
GET /api/v1/batches/{batchId}/products
```
**Purpose:** Get list of products attached to batch  
**When:** On Stage 3 load  
**Response:** Array of `BatchProduct` objects

#### 2. Get Batch Details (Optional but Recommended)
```
GET /api/v1/batches/{batchId}
```
**Purpose:** Get full batch details including status  
**When:** On Stage 3 load, after adding packaging  
**Response:** `BatchWithDetailsResponse` with status, products, packaging

#### 3. Get Packaging (Required)
```
GET /api/v1/packaging?product_id={productId}
```
**Purpose:** Get packaging options for a specific product  
**When:** For each product in batch  
**Response:** Array of `Packaging` objects

**Alternative:** Fetch all packaging and filter client-side
```
GET /api/v1/packaging
```

#### 4. Get Packets Inventory (Required)
```
GET /api/v1/inventory/packets
```
**Purpose:** Get available empty packets for each packaging  
**When:** On Stage 3 load  
**Response:** Array with `packaging_id` and `available_quantity`

#### 5. Get Packaging Vendors (Optional but Recommended)
```
GET /api/v1/packaging-vendors
```
**Purpose:** Get vendor details for display  
**When:** On Stage 3 load  
**Response:** Array of `PackagingVendor` objects

#### 6. Add Packaging to Batch (Required)
```
POST /api/v1/batches/{batchId}/packaging
```
**Request Body:**
```json
{
  "product_id": "uuid",      // REQUIRED - must match product in batch
  "packaging_id": "uuid",    // REQUIRED - must belong to product_id
  "quantity": 200            // REQUIRED - quantity in kg
}
```
**Purpose:** Attach packaging to batch  
**When:** User selects packaging and enters quantity  
**Response:** Success message

**Backend Validation:**
- Batch status must be `ready_to_pack` or `packaged`
- Product must be in `batch_products`
- Packaging must belong to the specified `product_id`
- Sufficient packets inventory must be available

#### 7. Get Batch Packaging (Optional)
```
GET /api/v1/batches/{batchId}/packaging
```
**Purpose:** Get list of packaging already attached to batch  
**When:** On Stage 3 load, after adding packaging  
**Response:** Array of `BatchPackaging` objects

---

### Complete Data Flow

```typescript
async function loadStage3Data(batchId: string) {
  // 1. Get batch products
  const batchProducts = await fetch(`/api/v1/batches/${batchId}/products`);
  const productIds = batchProducts.data.map(bp => bp.product_id);

  // 2. Get batch details (for status check)
  const batch = await fetch(`/api/v1/batches/${batchId}`);
  if (batch.data.status !== 'ready_to_pack' && batch.data.status !== 'packaged') {
    throw new Error('Batch not ready for packaging');
  }

  // 3. Get packaging for each product
  const packagingPromises = productIds.map(productId =>
    fetch(`/api/v1/packaging?product_id=${productId}`)
  );
  const packagingResponses = await Promise.all(packagingPromises);
  const allPackaging = packagingResponses.flatMap(res => res.data);

  // 4. Get packets inventory
  const packetsInventory = await fetch('/api/v1/inventory/packets');
  const packetsMap = new Map(
    packetsInventory.data.map(item => [item.packaging_id, item.available_quantity])
  );

  // 5. Get vendors
  const vendors = await fetch('/api/v1/packaging-vendors');
  const vendorsMap = new Map(vendors.data.map(v => [v.id, v]));

  // 6. Get already attached packaging (optional)
  const batchPackaging = await fetch(`/api/v1/batches/${batchId}/packaging`);

  // 7. Enrich and group packaging
  const enrichedPackaging = enrichPackagingData(
    allPackaging,
    packetsMap,
    vendorsMap,
    productIds
  );

  return {
    batch,
    products: batchProducts.data,
    packaging: enrichedPackaging,
    attachedPackaging: batchPackaging.data
  };
}
```

---

## 6. Implementation Patterns

### Pattern 1: Group Packaging by Product

**Purpose:** Display packaging organized by product

**Implementation:**
```typescript
function groupPackagingByProduct(
  packaging: Packaging[],
  productIds: string[]
): Map<string, Packaging[]> {
  const grouped = new Map<string, Packaging[]>();
  
  productIds.forEach(productId => {
    const productPackaging = packaging.filter(pkg => pkg.product_id === productId);
    grouped.set(productId, productPackaging);
  });
  
  return grouped;
}
```

**UI Structure:**
```
Product A
  ├── 10kg PP Bag (Vendor A) - 50 packets available
  ├── 25kg PP Bag (Vendor A) - 30 packets available
  └── 10kg Jute Bag (Vendor B) - 20 packets available

Product B
  ├── 25kg PP Bag (Vendor A) - 40 packets available
  └── 50kg PP Bag (Vendor C) - 15 packets available
```

---

### Pattern 2: Group Packaging by Capacity

**Purpose:** Display packaging organized by size

**Implementation:**
```typescript
function groupPackagingByCapacity(
  packaging: Packaging[]
): Map<number, Packaging[]> {
  const grouped = new Map<number, Packaging[]>();
  
  packaging.forEach(pkg => {
    if (!grouped.has(pkg.holding_capacity)) {
      grouped.set(pkg.holding_capacity, []);
    }
    grouped.get(pkg.holding_capacity)!.push(pkg);
  });
  
  return grouped;
}
```

**UI Structure:**
```
10kg Packaging
  ├── Product A - PP Bag (Vendor A) - 50 packets
  ├── Product A - Jute Bag (Vendor B) - 20 packets
  └── Product B - PP Bag (Vendor A) - 30 packets

25kg Packaging
  ├── Product A - PP Bag (Vendor A) - 30 packets
  └── Product B - PP Bag (Vendor A) - 40 packets
```

---

### Pattern 3: Group Packaging by Vendor

**Purpose:** Display packaging organized by supplier

**Implementation:**
```typescript
function groupPackagingByVendor(
  packaging: Packaging[],
  vendorsMap: Map<string, PackagingVendor>
): Map<string, { vendor: PackagingVendor | null; packaging: Packaging[] }> {
  const grouped = new Map();
  
  packaging.forEach(pkg => {
    const vendorKey = pkg.packaging_vendor_id || 'unassigned';
    if (!grouped.has(vendorKey)) {
      grouped.set(vendorKey, {
        vendor: pkg.packaging_vendor_id ? vendorsMap.get(pkg.packaging_vendor_id) : null,
        packaging: []
      });
    }
    grouped.get(vendorKey).packaging.push(pkg);
  });
  
  return grouped;
}
```

**UI Structure:**
```
Vendor A (ABC Packaging)
  ├── Product A - 10kg PP Bag - 50 packets
  ├── Product A - 25kg PP Bag - 30 packets
  └── Product B - 25kg PP Bag - 40 packets

Vendor B (XYZ Suppliers)
  └── Product A - 10kg Jute Bag - 20 packets
```

---

### Pattern 4: Calculate Packets Needed

**Purpose:** Validate and calculate required packets for a quantity

**Implementation:**
```typescript
function calculatePacketsNeeded(
  quantity: number,           // Quantity in kg
  holdingCapacity: number     // Capacity per packet (10, 25, or 50)
): number {
  return Math.ceil(quantity / holdingCapacity);
}

function validatePackagingSelection(
  packaging: Packaging,
  quantity: number,
  availablePackets: number
): { valid: boolean; error?: string; packetsNeeded: number } {
  const packetsNeeded = calculatePacketsNeeded(quantity, packaging.holding_capacity);
  
  if (packetsNeeded > availablePackets) {
    return {
      valid: false,
      error: `Insufficient packets. Available: ${availablePackets}, Required: ${packetsNeeded}`,
      packetsNeeded
    };
  }
  
  if (quantity <= 0) {
    return {
      valid: false,
      error: 'Quantity must be greater than 0',
      packetsNeeded: 0
    };
  }
  
  return { valid: true, packetsNeeded };
}
```

---

### Pattern 5: Display Packaging with Availability Status

**Purpose:** Show packaging with clear availability indicators

**Implementation:**
```typescript
interface PackagingDisplay {
  packaging: Packaging;
  availablePackets: number;
  availableWeight: number;  // availablePackets * holding_capacity
  vendor: PackagingVendor | null;
  status: 'available' | 'low_stock' | 'out_of_stock';
  statusMessage: string;
}

function createPackagingDisplay(
  packaging: Packaging,
  availablePackets: number,
  vendor: PackagingVendor | null
): PackagingDisplay {
  const availableWeight = availablePackets * packaging.holding_capacity;
  
  let status: 'available' | 'low_stock' | 'out_of_stock';
  let statusMessage: string;
  
  if (availablePackets === 0) {
    status = 'out_of_stock';
    statusMessage = 'Out of stock';
  } else if (availablePackets < 10) {
    status = 'low_stock';
    statusMessage = `Low stock (${availablePackets} packets)`;
  } else {
    status = 'available';
    statusMessage = `${availablePackets} packets available (${availableWeight}kg)`;
  }
  
  return {
    packaging,
    availablePackets,
    availableWeight,
    vendor,
    status,
    statusMessage
  };
}
```

---

## 7. Validation & Error Handling

### Client-Side Validation

#### Validation 1: Quantity Validation

```typescript
function validateQuantity(quantity: number): { valid: boolean; error?: string } {
  if (!quantity || quantity <= 0) {
    return { valid: false, error: 'Quantity must be greater than 0' };
  }
  
  if (quantity > 10000) {
    return { valid: false, error: 'Quantity cannot exceed 10,000 kg' };
  }
  
  return { valid: true };
}
```

#### Validation 2: Packets Availability Validation

```typescript
function validatePacketsAvailability(
  packaging: Packaging,
  quantity: number,
  availablePackets: number
): { valid: boolean; error?: string; packetsNeeded?: number } {
  const packetsNeeded = Math.ceil(quantity / packaging.holding_capacity);
  
  if (packetsNeeded > availablePackets) {
    return {
      valid: false,
      error: `Insufficient empty packets. Available: ${availablePackets}, Required: ${packetsNeeded}`,
      packetsNeeded
    };
  }
  
  return { valid: true, packetsNeeded };
}
```

#### Validation 3: Product-Packaging Match Validation

```typescript
function validateProductPackagingMatch(
  productId: string,
  packaging: Packaging,
  batchProductIds: string[]
): { valid: boolean; error?: string } {
  // Check product is in batch
  if (!batchProductIds.includes(productId)) {
    return {
      valid: false,
      error: 'Product must be attached to batch before adding packaging'
    };
  }
  
  // Check packaging belongs to product
  if (packaging.product_id !== productId) {
    return {
      valid: false,
      error: 'Packaging does not belong to the specified product'
    };
  }
  
  return { valid: true };
}
```

#### Validation 4: Batch Status Validation

```typescript
function validateBatchStatus(status: string): { valid: boolean; error?: string } {
  const validStatuses = ['ready_to_pack', 'packaged'];
  
  if (!validStatuses.includes(status)) {
    return {
      valid: false,
      error: `Cannot add packaging to batch in status: ${status}. Expected: ready_to_pack or packaged`
    };
  }
  
  return { valid: true };
}
```

### Server-Side Error Handling

**Common Errors and Responses:**

1. **Batch Not Found**
   ```json
   {
     "success": false,
     "message": "Batch not found",
     "error": "NotFoundError"
   }
   ```

2. **Invalid Batch Status**
   ```json
   {
     "success": false,
     "message": "Cannot add packaging to batch in status: recipe_attached. Expected: ready_to_pack or packaged",
     "error": "BadRequestError"
   }
   ```

3. **Product Not in Batch**
   ```json
   {
     "success": false,
     "message": "Product must be attached to batch before adding packaging",
     "error": "BadRequestError"
   }
   ```

4. **Packaging Doesn't Belong to Product**
   ```json
   {
     "success": false,
     "message": "Packaging does not belong to the specified product",
     "error": "BadRequestError"
   }
   ```

5. **Insufficient Packets**
   ```json
   {
     "success": false,
     "message": "Insufficient empty packets for 25.00 kg packaging. Available: 5, Required: 8",
     "error": "BadRequestError"
   }
   ```

### Error Handling Implementation

```typescript
async function addPackagingToBatch(
  batchId: string,
  productId: string,
  packagingId: string,
  quantity: number
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    // Client-side validation
    const quantityValidation = validateQuantity(quantity);
    if (!quantityValidation.valid) {
      return { success: false, error: quantityValidation.error };
    }

    // Make API call
    const response = await fetch(`/api/v1/batches/${batchId}/packaging`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        product_id: productId,
        packaging_id: packagingId,
        quantity: quantity
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.message || 'Failed to add packaging to batch'
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
```

---

## 8. User Experience Flow

### Recommended UI Flow

#### Step 1: Display Products with Packaging Options

**For each product in batch:**
1. Show product name
2. List available packaging options for that product
3. For each packaging option, display:
   - Capacity (10kg, 25kg, 50kg)
   - Packet type (PP Bag, Jute Bag, etc.)
   - Vendor name (if available)
   - Available packets count
   - Available weight (packets × capacity)
   - Status indicator (Available / Low Stock / Out of Stock)

#### Step 2: Filtering Options

**Provide filters:**
- By Capacity: Checkboxes for 10kg, 25kg, 50kg
- By Type: Dropdown/multi-select for packet types
- By Vendor: Dropdown/multi-select for vendors
- By Availability: Toggle to show only available packaging
- Search: Text input to search by type or vendor name

#### Step 3: Selection Interface

**For each packaging option:**
1. Show packaging details (capacity, type, vendor, availability)
2. Provide quantity input field (in kg)
3. Show calculated packets needed (auto-calculate: `ceil(quantity / capacity)`)
4. Show validation status (green if valid, red if insufficient)
5. Provide "Add" button (disabled if validation fails)

#### Step 4: Selected Packaging Display

**Show list of packaging already added:**
- Product name
- Packaging details (capacity, type, vendor)
- Quantity (kg)
- Packets used
- Remove button

#### Step 5: Summary & Submission

**Before finalizing:**
- Show total quantity across all packaging
- Show total packets needed
- Validate all selections
- Provide "Complete Packaging" or "Save" button

### Complete Implementation Example

```typescript
interface Stage3State {
  batchId: string;
  batchStatus: string;
  products: Array<{ id: string; name: string }>;
  packagingByProduct: Map<string, PackagingDisplay[]>;
  selectedPackaging: Array<{
    product_id: string;
    packaging_id: string;
    quantity: number;
    packetsNeeded: number;
  }>;
  filters: PackagingFilters;
  loading: boolean;
  error: string | null;
}

async function initializeStage3(batchId: string): Promise<Stage3State> {
  // Load all required data
  const data = await loadStage3Data(batchId);
  
  // Validate batch status
  const statusValidation = validateBatchStatus(data.batch.data.status);
  if (!statusValidation.valid) {
    throw new Error(statusValidation.error);
  }
  
  // Group packaging by product
  const packagingByProduct = groupPackagingByProduct(
    data.packaging,
    data.products.map(p => p.product_id)
  );
  
  // Create display data
  const enrichedPackaging = new Map<string, PackagingDisplay[]>();
  packagingByProduct.forEach((packaging, productId) => {
    enrichedPackaging.set(
      productId,
      packaging.map(pkg => createPackagingDisplay(
        pkg,
        data.packetsMap.get(pkg.id) || 0,
        data.vendorsMap.get(pkg.packaging_vendor_id || '')
      ))
    );
  });
  
  return {
    batchId,
    batchStatus: data.batch.data.status,
    products: data.products,
    packagingByProduct: enrichedPackaging,
    selectedPackaging: [],
    filters: {
      productIds: data.products.map(p => p.product_id),
      capacities: [],
      packetTypes: [],
      vendorIds: [],
      minAvailablePackets: 0
    },
    loading: false,
    error: null
  };
}

function handlePackagingSelection(
  state: Stage3State,
  productId: string,
  packagingId: string,
  quantity: number
): { valid: boolean; error?: string; updatedState?: Stage3State } {
  // Find packaging
  const productPackaging = state.packagingByProduct.get(productId) || [];
  const packaging = productPackaging.find(p => p.packaging.id === packagingId);
  
  if (!packaging) {
    return { valid: false, error: 'Packaging not found' };
  }
  
  // Validate product-packaging match
  const matchValidation = validateProductPackagingMatch(
    productId,
    packaging.packaging,
    state.products.map(p => p.id)
  );
  if (!matchValidation.valid) {
    return { valid: false, error: matchValidation.error };
  }
  
  // Validate quantity
  const quantityValidation = validateQuantity(quantity);
  if (!quantityValidation.valid) {
    return { valid: false, error: quantityValidation.error };
  }
  
  // Validate packets availability
  const availabilityValidation = validatePacketsAvailability(
    packaging.packaging,
    quantity,
    packaging.availablePackets
  );
  if (!availabilityValidation.valid) {
    return { valid: false, error: availabilityValidation.error };
  }
  
  // Add to selected packaging
  const updatedSelected = [...state.selectedPackaging, {
    product_id: productId,
    packaging_id: packagingId,
    quantity: quantity,
    packetsNeeded: availabilityValidation.packetsNeeded!
  }];
  
  return {
    valid: true,
    updatedState: {
      ...state,
      selectedPackaging: updatedSelected
    }
  };
}

async function submitPackaging(
  state: Stage3State
): Promise<{ success: boolean; error?: string }> {
  // Submit each packaging selection
  const results = await Promise.all(
    state.selectedPackaging.map(selection =>
      addPackagingToBatch(
        state.batchId,
        selection.product_id,
        selection.packaging_id,
        selection.quantity
      )
    )
  );
  
  // Check for errors
  const errors = results.filter(r => !r.success);
  if (errors.length > 0) {
    return {
      success: false,
      error: errors.map(e => e.error).join(', ')
    };
  }
  
  return { success: true };
}
```

---

## Summary

### Key Points for Packaging Selection in Stage 3:

1. **Primary Filter:** Always filter packaging by `product_id` - only show packaging for products attached to batch
2. **Required Keys:** `product_id` (required), `holding_capacity`, `packet_type`, `packaging_vendor_id` (optional)
3. **Availability Check:** Always check `packets_inventory` before allowing selection
4. **Validation:** Validate quantity, availability, and product-packaging match before submission
5. **Multiple Selection:** Allow multiple packaging entries per product
6. **Grouping Options:** Group by product, capacity, type, or vendor based on UX needs
7. **Real-time Calculation:** Calculate packets needed as user enters quantity
8. **Error Handling:** Handle all validation errors gracefully with clear messages

### API Flow:
1. Get batch products → `GET /batches/{id}/products`
2. Get packaging for each product → `GET /packaging?product_id={id}`
3. Get packets inventory → `GET /inventory/packets`
4. Get vendors (optional) → `GET /packaging-vendors`
5. Add packaging → `POST /batches/{id}/packaging`

This guide provides all the information needed to implement comprehensive packaging selection in Stage 3 of batch creation.

