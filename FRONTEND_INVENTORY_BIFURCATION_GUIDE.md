# Frontend Inventory Bifurcation & Hierarchical Visualization Guide

## Overview

This comprehensive guide explains all possible bifurcations (groupings/subdivisions) for packaging, products, and bags in the inventory system, along with various hierarchical visualization structures. This document provides frontend developers with complete understanding of data organization possibilities and implementation strategies.

---

## Table of Contents

1. [Packaging Bifurcations](#1-packaging-bifurcations)
2. [Product Bifurcations](#2-product-bifurcations)
3. [Bags Bifurcations](#3-bags-bifurcations)
4. [Hierarchical Visualization Structures](#4-hierarchical-visualization-structures)
5. [API Endpoints & Data Structures](#5-api-endpoints--data-structures)
6. [Implementation Examples](#6-implementation-examples)
7. [Filtering & Search Strategies](#7-filtering--search-strategies)

---

## 1. Packaging Bifurcations

### 1.1 By Holding Capacity (Weight)

**Available Values:**
- `10` (10 kg)
- `25` (25 kg)
- `50` (50 kg)

**Type:** `PackagingWeight` enum

**Use Cases:**
- Group packaging by size for capacity planning
- Filter by weight for batch creation
- Display inventory by capacity
- Calculate total capacity per weight category

**Data Structure:**
```typescript
interface Packaging {
  holding_capacity: 10 | 25 | 50;
  // ... other fields
}
```

**Grouping Example:**
```javascript
// Group packaging by capacity
const packagingByCapacity = {
  10: [/* all 10kg packaging */],
  25: [/* all 25kg packaging */],
  50: [/* all 50kg packaging */]
};
```

---

### 1.2 By Packet Type

**Available Values:**
- Any string value (e.g., "PP Bag", "Jute Bag", "Woven Bag", "Polypropylene Bag", etc.)

**Type:** `string`

**Use Cases:**
- Group by material type
- Filter by packet type for procurement
- Track quality/cost by material
- Display vendor offerings by type

**Data Structure:**
```typescript
interface Packaging {
  packet_type: string;
  // ... other fields
}
```

**Grouping Example:**
```javascript
// Group packaging by packet type
const packagingByType = {
  "PP Bag": [/* all PP Bag packaging */],
  "Jute Bag": [/* all Jute Bag packaging */],
  "Woven Bag": [/* all Woven Bag packaging */]
};
```

---

### 1.3 By Packaging Vendor

**Available Values:**
- Vendor ID (UUID) or `null` (unassigned)

**Type:** `string | null`

**Use Cases:**
- Track which vendor supplies which packaging
- Filter packaging by vendor for procurement
- Compare vendor offerings
- Display vendor-specific inventory
- Group for vendor performance analysis

**Data Structure:**
```typescript
interface Packaging {
  packaging_vendor_id: string | null;
  // ... other fields
}

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

**Grouping Example:**
```javascript
// Group packaging by vendor
const packagingByVendor = {
  "vendor-uuid-1": {
    vendor: { id: "uuid", name: "ABC Packaging" },
    packaging: [/* all packaging from this vendor */]
  },
  "vendor-uuid-2": {
    vendor: { id: "uuid", name: "XYZ Suppliers" },
    packaging: [/* all packaging from this vendor */]
  },
  "unassigned": {
    vendor: null,
    packaging: [/* all packaging without vendor */]
  }
};
```

---

### 1.4 By Product

**Available Values:**
- Product ID (UUID)

**Type:** `string`

**Use Cases:**
- Each product has its own packaging entries
- Filter packaging for specific product
- Display product-specific packaging options
- Group packaging by product in inventory

**Data Structure:**
```typescript
interface Packaging {
  product_id: string;
  // ... other fields
}
```

**Grouping Example:**
```javascript
// Group packaging by product
const packagingByProduct = {
  "product-uuid-1": {
    product: { id: "uuid", name: "Premium Basmati" },
    packaging: [/* all packaging for this product */]
  },
  "product-uuid-2": {
    product: { id: "uuid", name: "Standard Rice" },
    packaging: [/* all packaging for this product */]
  }
};
```

---

### 1.5 By Ordered Weight (Volume Ranges)

**Available Values:**
- Number (kg) or `null` (not ordered)

**Type:** `number | null`

**Use Cases:**
- Group by order volume (high/medium/low)
- Filter by ordered quantity ranges
- Analyze ordering patterns
- Display procurement history

**Data Structure:**
```typescript
interface Packaging {
  ordered_weight: number | null;
  // ... other fields
}
```

**Grouping Example:**
```javascript
// Group packaging by ordered weight ranges
const packagingByOrderVolume = {
  "high_volume": { // > 5000 kg
    range: "High Volume (> 5000 kg)",
    packaging: [/* packaging with ordered_weight > 5000 */]
  },
  "medium_volume": { // 1000-5000 kg
    range: "Medium Volume (1000-5000 kg)",
    packaging: [/* packaging with ordered_weight between 1000-5000 */]
  },
  "low_volume": { // < 1000 kg
    range: "Low Volume (< 1000 kg)",
    packaging: [/* packaging with ordered_weight < 1000 */]
  },
  "not_ordered": {
    range: "Not Ordered",
    packaging: [/* packaging with ordered_weight = null */]
  }
};
```

---

### 1.6 Combined Bifurcations (Multi-Level Grouping)

**Possible Combinations:**

#### Combination 1: Capacity → Type → Vendor
```
10kg
  ├── PP Bag
  │   ├── Vendor A
  │   └── Vendor B
  └── Jute Bag
      └── Vendor C
25kg
  ├── PP Bag
  │   └── Vendor A
  └── Woven Bag
      └── Vendor D
```

#### Combination 2: Vendor → Capacity → Type
```
Vendor A
  ├── 10kg
  │   ├── PP Bag
  │   └── Jute Bag
  └── 25kg
      └── PP Bag
Vendor B
  └── 10kg
      └── PP Bag
```

#### Combination 3: Product → Capacity → Vendor
```
Product A
  ├── 10kg
  │   ├── Vendor A (PP Bag)
  │   └── Vendor B (Jute Bag)
  └── 25kg
      └── Vendor A (PP Bag)
Product B
  └── 10kg
      └── Vendor C (PP Bag)
```

#### Combination 4: Type → Capacity → Vendor
```
PP Bag
  ├── 10kg
  │   ├── Vendor A
  │   └── Vendor B
  └── 25kg
      └── Vendor A
Jute Bag
  └── 10kg
      └── Vendor C
```

---

## 2. Product Bifurcations

### 2.1 By Brand

**Available Values:**
- `"Tamara"` | `"Hariom"` | `null` (Unbranded)

**Type:** `Brand | null`

**Use Cases:**
- Group products by brand in inventory
- Filter products by brand
- Display brand-specific inventory
- Analyze brand performance

**Data Structure:**
```typescript
type Brand = 'Tamara' | 'Hariom';

interface Product {
  brand: Brand | null;
  // ... other fields
}
```

**Grouping Example:**
```javascript
// Group products by brand
const productsByBrand = {
  "Tamara": [/* all Tamara products */],
  "Hariom": [/* all Hariom products */],
  "Unbranded": [/* all unbranded products */]
};
```

---

### 2.2 By Rice Type

**Available Values:**
- `"basmati"` | `"non_basmati"` | `"parboiled"` | `"raw"` | `"raw_basmati"` | `"steam_basmati"` | `"white_sella"` | `"golden_sella"` | `null`

**Type:** `RiceType | null`

**Use Cases:**
- Group products by rice variety
- Filter by rice type
- Display rice type-specific inventory
- Analyze rice type performance

**Data Structure:**
```typescript
type RiceType = 'basmati' | 'non_basmati' | 'parboiled' | 'raw' | 'raw_basmati' | 'steam_basmati' | 'white_sella' | 'golden_sella';

interface Product {
  rice_type: RiceType | null;
  // ... other fields
}
```

**Grouping Example:**
```javascript
// Group products by rice type
const productsByRiceType = {
  "basmati": [/* all basmati products */],
  "non_basmati": [/* all non-basmati products */],
  "parboiled": [/* all parboiled products */],
  "raw": [/* all raw products */],
  // ... other types
  "unclassified": [/* products without rice_type */]
};
```

---

### 2.3 Combined Product Bifurcations

**Possible Combinations:**

#### Combination 1: Brand → Rice Type
```
Tamara
  ├── Basmati
  │   ├── Product A
  │   └── Product B
  └── Non-Basmati
      └── Product C
Hariom
  └── Basmati
      └── Product D
```

#### Combination 2: Rice Type → Brand
```
Basmati
  ├── Tamara
  │   ├── Product A
  │   └── Product B
  └── Hariom
      └── Product D
Non-Basmati
  └── Tamara
      └── Product C
```

---

## 3. Bags Bifurcations

### 3.1 By Bag Type

**Available Values:**
- `"jute"` | `"pp"`

**Type:** `BagType`

**Use Cases:**
- Group bags by material type
- Filter bags by type
- Display type-specific bag inventory
- Track bag usage by type

**Data Structure:**
```typescript
type BagType = 'jute' | 'pp';

interface BagsInventory {
  bag_type: BagType;
  // ... other fields
}
```

**Grouping Example:**
```javascript
// Group bags by type
const bagsByType = {
  "jute": [/* all jute bag entries */],
  "pp": [/* all PP bag entries */]
};
```

---

### 3.2 By Bag Capacity

**Available Values:**
- Any positive number (kg) (e.g., 50, 100, 150)

**Type:** `number`

**Use Cases:**
- Group bags by weight capacity
- Filter bags by capacity
- Display capacity-specific inventory
- Track bag usage by capacity

**Data Structure:**
```typescript
interface BagsInventory {
  bag_capacity: number; // Weight capacity in kg per bag
  // ... other fields
}
```

**Grouping Example:**
```javascript
// Group bags by capacity
const bagsByCapacity = {
  50: [/* all 50kg bag entries */],
  100: [/* all 100kg bag entries */],
  150: [/* all 150kg bag entries */]
};
```

---

### 3.3 By Bag Status (Filled vs Empty)

**Available Values:**
- `filled_bags`: number
- `empty_bags`: number

**Type:** `number` (counts)

**Use Cases:**
- Display filled vs empty bag counts
- Filter by availability
- Track bag utilization
- Show bag status distribution

**Data Structure:**
```typescript
interface BagsInventory {
  filled_bags: number;
  empty_bags: number;
  // ... other fields
}
```

**Grouping Example:**
```javascript
// Group bags by status
const bagsByStatus = {
  "filled": bags.filter(b => b.filled_bags > 0),
  "empty": bags.filter(b => b.empty_bags > 0),
  "both": bags.filter(b => b.filled_bags > 0 && b.empty_bags > 0),
  "none": bags.filter(b => b.filled_bags === 0 && b.empty_bags === 0)
};
```

---

### 3.4 Combined Bags Bifurcations

**Possible Combinations:**

#### Combination 1: Type → Capacity
```
Jute Bags
  ├── 50kg (filled: 100, empty: 50)
  ├── 100kg (filled: 200, empty: 75)
  └── 150kg (filled: 50, empty: 25)
PP Bags
  ├── 50kg (filled: 150, empty: 100)
  └── 100kg (filled: 300, empty: 150)
```

#### Combination 2: Capacity → Type
```
50kg Bags
  ├── Jute (filled: 100, empty: 50)
  └── PP (filled: 150, empty: 100)
100kg Bags
  ├── Jute (filled: 200, empty: 75)
  └── PP (filled: 300, empty: 150)
```

---

## 4. Hierarchical Visualization Structures

### 4.1 Current Hierarchical Structure (Brand → Product → Packaging → Finished Goods)

**Structure:**
```
Brand
  └── Product
      └── Packaging (flat list)
          ├── holding_capacity
          ├── packet_type
          ├── vendor
          └── finished_goods
              └── batch details
```

**API Endpoint:**
```
GET /inventory/hierarchical
```

**Response Structure:**
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
              "packaging_number": "PACK-001",  // Sequential number for display
              "holding_capacity": "25.00",
              "packet_type": "PP Bag",
              "vendor": {
                "id": "uuid",
                "name": "ABC Packaging Suppliers"
              },
              "finished_goods": [
                {
                  "batch_id": "uuid",
                  "batch_number": "BATCH-20251228-001",
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

---

### 4.2 Alternative Structure 1: Brand → Product → Capacity → Packaging → Finished Goods

**Structure:**
```
Brand
  └── Product
      └── Capacity (10kg, 25kg, 50kg)
          └── Packaging (grouped by type + vendor)
              └── finished_goods
```

**Frontend Implementation:**
```javascript
// Transform hierarchical data
const transformByCapacity = (hierarchicalData) => {
  return hierarchicalData.map(brandGroup => ({
    brand: brandGroup.brand,
    products: brandGroup.products.map(product => ({
      ...product,
      packaging_by_capacity: {
        10: product.packaging.filter(p => p.holding_capacity === 10),
        25: product.packaging.filter(p => p.holding_capacity === 25),
        50: product.packaging.filter(p => p.holding_capacity === 50)
      }
    }))
  }));
};
```

**Visual Structure:**
```
Tamara
  └── Premium Basmati Rice
      ├── 10kg
      │   ├── PP Bag (Vendor A) → Finished Goods
      │   └── Jute Bag (Vendor B) → Finished Goods
      ├── 25kg
      │   └── PP Bag (Vendor A) → Finished Goods
      └── 50kg
          └── PP Bag (Vendor A) → Finished Goods
```

---

### 4.3 Alternative Structure 2: Brand → Product → Vendor → Packaging → Finished Goods

**Structure:**
```
Brand
  └── Product
      └── Vendor
          └── Packaging (grouped by capacity + type)
              └── finished_goods
```

**Frontend Implementation:**
```javascript
// Transform hierarchical data by vendor
const transformByVendor = (hierarchicalData) => {
  return hierarchicalData.map(brandGroup => ({
    brand: brandGroup.brand,
    products: brandGroup.products.map(product => {
      // Group packaging by vendor
      const vendorMap = new Map();
      
      product.packaging.forEach(pkg => {
        const vendorKey = pkg.vendor?.id || 'unassigned';
        if (!vendorMap.has(vendorKey)) {
          vendorMap.set(vendorKey, {
            vendor: pkg.vendor,
            packaging: []
          });
        }
        vendorMap.get(vendorKey).packaging.push(pkg);
      });
      
      return {
        ...product,
        packaging_by_vendor: Array.from(vendorMap.values())
      };
    })
  }));
};
```

**Visual Structure:**
```
Tamara
  └── Premium Basmati Rice
      ├── ABC Packaging Suppliers
      │   ├── 10kg PP Bag → Finished Goods
      │   ├── 25kg PP Bag → Finished Goods
      │   └── 50kg PP Bag → Finished Goods
      └── XYZ Suppliers
          └── 10kg Jute Bag → Finished Goods
```

---

### 4.4 Alternative Structure 3: Brand → Rice Type → Product → Packaging → Finished Goods

**Structure:**
```
Brand
  └── Rice Type
      └── Product
          └── Packaging
              └── finished_goods
```

**Frontend Implementation:**
```javascript
// Transform hierarchical data by rice type
const transformByRiceType = (hierarchicalData) => {
  return hierarchicalData.map(brandGroup => {
    // Group products by rice type
    const riceTypeMap = new Map();
    
    brandGroup.products.forEach(product => {
      const riceTypeKey = product.rice_type || 'unclassified';
      if (!riceTypeMap.has(riceTypeKey)) {
        riceTypeMap.set(riceTypeKey, []);
      }
      riceTypeMap.get(riceTypeKey).push(product);
    });
    
    return {
      brand: brandGroup.brand,
      rice_types: Array.from(riceTypeMap.entries()).map(([riceType, products]) => ({
        rice_type: riceType,
        products
      }))
    };
  });
};
```

**Visual Structure:**
```
Tamara
  ├── Basmati
  │   ├── Premium Basmati Rice
  │   │   └── Packaging → Finished Goods
  │   └── Standard Basmati Rice
  │       └── Packaging → Finished Goods
  └── Non-Basmati
      └── Standard Rice
          └── Packaging → Finished Goods
```

---

### 4.5 Alternative Structure 4: Vendor → Brand → Product → Packaging → Finished Goods

**Structure:**
```
Vendor
  └── Brand
      └── Product
          └── Packaging (for this vendor)
              └── finished_goods
```

**Frontend Implementation:**
```javascript
// Transform hierarchical data by vendor (top level)
const transformByVendorTopLevel = (hierarchicalData) => {
  const vendorMap = new Map();
  
  hierarchicalData.forEach(brandGroup => {
    brandGroup.products.forEach(product => {
      product.packaging.forEach(pkg => {
        const vendorKey = pkg.vendor?.id || 'unassigned';
        const vendorName = pkg.vendor?.name || 'Unassigned';
        
        if (!vendorMap.has(vendorKey)) {
          vendorMap.set(vendorKey, {
            vendor: pkg.vendor || { id: 'unassigned', name: 'Unassigned' },
            brands: new Map()
          });
        }
        
        const vendorData = vendorMap.get(vendorKey);
        const brandKey = brandGroup.brand;
        
        if (!vendorData.brands.has(brandKey)) {
          vendorData.brands.set(brandKey, {
            brand: brandKey,
            products: []
          });
        }
        
        // Check if product already exists
        let productEntry = vendorData.brands.get(brandKey).products.find(
          p => p.product_id === product.product_id
        );
        
        if (!productEntry) {
          productEntry = {
            ...product,
            packaging: []
          };
          vendorData.brands.get(brandKey).products.push(productEntry);
        }
        
        // Add packaging for this vendor
        productEntry.packaging.push(pkg);
      });
    });
  });
  
  return Array.from(vendorMap.values()).map(vendorData => ({
    vendor: vendorData.vendor,
    brands: Array.from(vendorData.brands.values())
  }));
};
```

**Visual Structure:**
```
ABC Packaging Suppliers
  └── Tamara
      └── Premium Basmati Rice
          └── 25kg PP Bag → Finished Goods
XYZ Suppliers
  ├── Tamara
  │   └── Premium Basmati Rice
  │       └── 10kg Jute Bag → Finished Goods
  └── Hariom
      └── Standard Rice
          └── 10kg PP Bag → Finished Goods
```

---

### 4.6 Alternative Structure 5: Capacity → Brand → Product → Packaging → Finished Goods

**Structure:**
```
Capacity (10kg, 25kg, 50kg)
  └── Brand
      └── Product
          └── Packaging (of this capacity)
              └── finished_goods
```

**Frontend Implementation:**
```javascript
// Transform hierarchical data by capacity (top level)
const transformByCapacityTopLevel = (hierarchicalData) => {
  const capacityMap = new Map();
  
  hierarchicalData.forEach(brandGroup => {
    brandGroup.products.forEach(product => {
      product.packaging.forEach(pkg => {
        const capacity = pkg.holding_capacity;
        
        if (!capacityMap.has(capacity)) {
          capacityMap.set(capacity, {
            capacity,
            brands: new Map()
          });
        }
        
        const capacityData = capacityMap.get(capacity);
        const brandKey = brandGroup.brand;
        
        if (!capacityData.brands.has(brandKey)) {
          capacityData.brands.set(brandKey, {
            brand: brandKey,
            products: []
          });
        }
        
        // Check if product already exists
        let productEntry = capacityData.brands.get(brandKey).products.find(
          p => p.product_id === product.product_id
        );
        
        if (!productEntry) {
          productEntry = {
            ...product,
            packaging: []
          };
          capacityData.brands.get(brandKey).products.push(productEntry);
        }
        
        // Add packaging of this capacity
        productEntry.packaging.push(pkg);
      });
    });
  });
  
  return Array.from(capacityMap.values()).map(capacityData => ({
    capacity: capacityData.capacity,
    brands: Array.from(capacityData.brands.values())
  }));
};
```

**Visual Structure:**
```
10kg Packaging
  └── Tamara
      └── Premium Basmati Rice
          ├── PP Bag (Vendor A) → Finished Goods
          └── Jute Bag (Vendor B) → Finished Goods
25kg Packaging
  └── Tamara
      └── Premium Basmati Rice
          └── PP Bag (Vendor A) → Finished Goods
50kg Packaging
  └── Tamara
      └── Premium Basmati Rice
          └── PP Bag (Vendor A) → Finished Goods
```

---

### 4.7 Alternative Structure 6: Packet Type → Brand → Product → Packaging → Finished Goods

**Structure:**
```
Packet Type (PP Bag, Jute Bag, etc.)
  └── Brand
      └── Product
          └── Packaging (of this type)
              └── finished_goods
```

**Frontend Implementation:**
```javascript
// Transform hierarchical data by packet type (top level)
const transformByPacketTypeTopLevel = (hierarchicalData) => {
  const typeMap = new Map();
  
  hierarchicalData.forEach(brandGroup => {
    brandGroup.products.forEach(product => {
      product.packaging.forEach(pkg => {
        const packetType = pkg.packet_type;
        
        if (!typeMap.has(packetType)) {
          typeMap.set(packetType, {
            packet_type: packetType,
            brands: new Map()
          });
        }
        
        const typeData = typeMap.get(packetType);
        const brandKey = brandGroup.brand;
        
        if (!typeData.brands.has(brandKey)) {
          typeData.brands.set(brandKey, {
            brand: brandKey,
            products: []
          });
        }
        
        // Check if product already exists
        let productEntry = typeData.brands.get(brandKey).products.find(
          p => p.product_id === product.product_id
        );
        
        if (!productEntry) {
          productEntry = {
            ...product,
            packaging: []
          };
          typeData.brands.get(brandKey).products.push(productEntry);
        }
        
        // Add packaging of this type
        productEntry.packaging.push(pkg);
      });
    });
  });
  
  return Array.from(typeMap.values()).map(typeData => ({
    packet_type: typeData.packet_type,
    brands: Array.from(typeData.brands.values())
  }));
};
```

**Visual Structure:**
```
PP Bag
  └── Tamara
      └── Premium Basmati Rice
          ├── 10kg (Vendor A) → Finished Goods
          ├── 25kg (Vendor A) → Finished Goods
          └── 50kg (Vendor A) → Finished Goods
Jute Bag
  └── Tamara
      └── Premium Basmati Rice
          └── 10kg (Vendor B) → Finished Goods
```

---

### 4.8 Complete Inventory Tree Structure (All Levels)

**Structure:**
```
Inventory
  ├── Finished Goods
  │   └── [Brand → Product → Packaging → Finished Goods]
  ├── Empty Packets
  │   └── [Brand → Product → Packaging → Packets Inventory]
  ├── Bags
  │   └── [Type → Capacity → Filled/Empty Counts]
  └── Lots
      └── [Lot → Available Quantity]
```

**Frontend Implementation:**
```javascript
// Get complete inventory structure
const getCompleteInventoryTree = async () => {
  const [
    hierarchicalInventory,
    packetsInventory,
    bagsInventory,
    lotsInventory
  ] = await Promise.all([
    fetch('/api/v1/inventory/hierarchical').then(r => r.json()),
    fetch('/api/v1/inventory/packets').then(r => r.json()),
    fetch('/api/v1/inventory/bags').then(r => r.json()),
    fetch('/api/v1/inventory/lots').then(r => r.json())
  ]);
  
  return {
    finished_goods: hierarchicalInventory.data,
    empty_packets: transformPacketsInventory(packetsInventory.data),
    bags: transformBagsInventory(bagsInventory.data),
    lots: lotsInventory.data
  };
};
```

---

## 5. API Endpoints & Data Structures

### 5.1 Hierarchical Inventory Endpoint

**Endpoint:**
```
GET /api/v1/inventory/hierarchical
```

**Response:**
```typescript
interface HierarchicalInventoryResponse {
  success: boolean;
  data: Array<{
    brand: string;
    products: Array<{
      product_id: string;
      product_name: string;
      rice_type: string | null;
      packaging: Array<{
        packaging_id: string;
        packaging_number: string | null; // Sequential number: PACK-001, PACK-002, etc.
        holding_capacity: number;
        packet_type: string;
        vendor: {
          id: string;
          name: string;
        } | null;
        finished_goods: Array<{
          batch_id: string;
          batch_number: string;
          quantity: number;
          packets: number;
          weight: number;
        }>;
      }>;
    }>;
  }>;
}
```

---

### 5.2 Packets Inventory Endpoint

**Endpoint:**
```
GET /api/v1/inventory/packets
```

**Response:**
```typescript
interface PacketsInventoryResponse {
  success: boolean;
  data: Array<{
    packaging_id: string;
    available_quantity: number;
    packaging?: {
      id: string;
      packaging_number: string | null; // Sequential number: PACK-001, PACK-002, etc.
      product_id: string;
      holding_capacity: number;
      packet_type: string;
      packaging_vendor_id: string | null;
      ordered_weight: number | null;
    };
  }>;
}
```

**Bifurcation Possibilities:**
- By `product_id`
- By `holding_capacity`
- By `packet_type`
- By `packaging_vendor_id`
- By `ordered_weight` ranges

---

### 5.3 Finished Goods Inventory Endpoint

**Endpoint:**
```
GET /api/v1/inventory/finished-goods?product_id={id}&batch_id={id}
```

**Response:**
```typescript
interface FinishedGoodsInventoryResponse {
  success: boolean;
  data: Array<{
    id: string;
    product_id: string;
    batch_id: string;
    packaging_id: string;
    no_of_packets: number;
    total_weight: number;
    product?: {
      id: string;
      name: string;
    };
    batch?: {
      id: string;
      batch_number: string;
    };
    packaging?: {
      id: string;
      packaging_number: string | null; // Sequential number: PACK-001, PACK-002, etc.
      holding_capacity: number;
      packet_type: string;
    };
  }>;
}
```

**Bifurcation Possibilities:**
- By `product_id`
- By `batch_id`
- By `packaging_id`
- By `holding_capacity` (via packaging)
- By `packet_type` (via packaging)
- By `packaging_vendor_id` (via packaging)

---

### 5.4 Bags Inventory Endpoint

**Endpoint:**
```
GET /api/v1/inventory/bags?bag_type={jute|pp}
```

**Response:**
```typescript
interface BagsInventoryResponse {
  success: boolean;
  data: Array<{
    id: string;
    bag_type: 'jute' | 'pp';
    bag_capacity: number;
    filled_bags: number;
    empty_bags: number;
    created_at: string;
    updated_at: string;
  }>;
}
```

**Bifurcation Possibilities:**
- By `bag_type` (jute/pp)
- By `bag_capacity`
- By status (filled/empty/both)

---

### 5.5 Products Endpoint

**Endpoint:**
```
GET /api/v1/products
```

**Response:**
```typescript
interface ProductsResponse {
  success: boolean;
  data: Array<{
    id: string;
    name: string;
    description: string | null;
    brand: 'Tamara' | 'Hariom' | null;
    rice_type: RiceType | null;
    created_at: string;
    updated_at: string;
  }>;
}
```

**Bifurcation Possibilities:**
- By `brand`
- By `rice_type`

---

### 5.6 Packaging Endpoint

**Endpoint:**
```
GET /api/v1/packaging?product_id={id}
```

**Response:**
```typescript
interface PackagingResponse {
  success: boolean;
  data: Array<{
    id: string;
    product_id: string;
    holding_capacity: 10 | 25 | 50;
    packet_type: string;
    packaging_vendor_id: string | null;
    ordered_weight: number | null;
    created_at: string;
    updated_at: string;
  }>;
}
```

**Bifurcation Possibilities:**
- By `product_id`
- By `holding_capacity`
- By `packet_type`
- By `packaging_vendor_id`
- By `ordered_weight` ranges

---

### 5.7 Packaging Vendors Endpoint

**Endpoint:**
```
GET /api/v1/packaging-vendors
```

**Response:**
```typescript
interface PackagingVendorsResponse {
  success: boolean;
  data: Array<{
    id: string;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    gst_number: string | null;
    created_at: string;
    updated_at: string;
  }>;
}
```

---

## 6. Implementation Examples

### 6.1 Multi-Level Grouping Utility

```typescript
// Utility function for multi-level grouping
function groupBy<T>(
  array: T[],
  keys: Array<keyof T | ((item: T) => string)>
): any {
  if (keys.length === 0) return array;
  
  const [firstKey, ...restKeys] = keys;
  const getKey = typeof firstKey === 'function' 
    ? firstKey 
    : (item: T) => String(item[firstKey] ?? 'null');
  
  const grouped = array.reduce((acc, item) => {
    const key = getKey(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
  
  if (restKeys.length > 0) {
    return Object.entries(grouped).reduce((acc, [key, items]) => {
      acc[key] = groupBy(items, restKeys);
      return acc;
    }, {} as Record<string, any>);
  }
  
  return grouped;
}

// Usage examples:
// Group packaging by capacity, then type, then vendor
const grouped = groupBy(packaging, [
  'holding_capacity',
  'packet_type',
  'packaging_vendor_id'
]);
```

---

### 6.2 Filtering Utility

```typescript
// Filter packaging by multiple criteria
function filterPackaging(
  packaging: Packaging[],
  filters: {
    product_id?: string;
    holding_capacity?: number[];
    packet_type?: string[];
    vendor_id?: string[];
    min_ordered_weight?: number;
    max_ordered_weight?: number;
  }
): Packaging[] {
  return packaging.filter(pkg => {
    if (filters.product_id && pkg.product_id !== filters.product_id) return false;
    if (filters.holding_capacity && !filters.holding_capacity.includes(pkg.holding_capacity)) return false;
    if (filters.packet_type && !filters.packet_type.includes(pkg.packet_type)) return false;
    if (filters.vendor_id) {
      if (!pkg.packaging_vendor_id || !filters.vendor_id.includes(pkg.packaging_vendor_id)) return false;
    }
    if (filters.min_ordered_weight && (!pkg.ordered_weight || pkg.ordered_weight < filters.min_ordered_weight)) return false;
    if (filters.max_ordered_weight && (!pkg.ordered_weight || pkg.ordered_weight > filters.max_ordered_weight)) return false;
    return true;
  });
}
```

---

### 6.3 Hierarchical Tree Component Data Structure

```typescript
// Tree node structure for hierarchical display
interface InventoryTreeNode {
  id: string;
  label: string;
  type: 'brand' | 'product' | 'packaging' | 'finished_goods' | 'vendor' | 'capacity' | 'type';
  data: any;
  children?: InventoryTreeNode[];
  metadata?: {
    total_quantity?: number;
    total_packets?: number;
    vendor?: { id: string; name: string };
    capacity?: number;
    packet_type?: string;
  };
}

// Transform hierarchical inventory to tree structure
function transformToTree(
  hierarchicalData: HierarchicalInventoryResponse['data'],
  groupingStrategy: 'default' | 'by_capacity' | 'by_vendor' | 'by_type'
): InventoryTreeNode[] {
  const tree: InventoryTreeNode[] = [];
  
  hierarchicalData.forEach(brandGroup => {
    const brandNode: InventoryTreeNode = {
      id: `brand-${brandGroup.brand}`,
      label: brandGroup.brand,
      type: 'brand',
      data: { brand: brandGroup.brand },
      children: []
    };
    
    brandGroup.products.forEach(product => {
      const productNode: InventoryTreeNode = {
        id: `product-${product.product_id}`,
        label: product.product_name,
        type: 'product',
        data: product,
        children: []
      };
      
      // Group packaging based on strategy
      let packagingGroups: Map<string, typeof product.packaging>;
      
      switch (groupingStrategy) {
        case 'by_capacity':
          packagingGroups = groupByCapacity(product.packaging);
          break;
        case 'by_vendor':
          packagingGroups = groupByVendor(product.packaging);
          break;
        case 'by_type':
          packagingGroups = groupByType(product.packaging);
          break;
        default:
          packagingGroups = new Map([['all', product.packaging]]);
      }
      
      packagingGroups.forEach((packagingList, groupKey) => {
        const groupNode: InventoryTreeNode = {
          id: `packaging-group-${product.product_id}-${groupKey}`,
          label: groupKey,
          type: groupingStrategy === 'by_capacity' ? 'capacity' : 
                groupingStrategy === 'by_vendor' ? 'vendor' : 'type',
          data: { groupKey, packaging: packagingList },
          children: packagingList.map(pkg => ({
            id: `packaging-${pkg.packaging_id}`,
            label: `${pkg.packaging_number || pkg.packaging_id} - ${pkg.holding_capacity}kg ${pkg.packet_type}`,
            type: 'packaging',
            data: pkg,
            metadata: {
              vendor: pkg.vendor,
              capacity: pkg.holding_capacity,
              packet_type: pkg.packet_type
            },
            children: pkg.finished_goods.map(fg => ({
              id: `fg-${fg.batch_id}-${pkg.packaging_id}`,
              label: `${fg.batch_number}: ${fg.packets} packets, ${fg.weight}kg`,
              type: 'finished_goods',
              data: fg
            }))
          }))
        };
        
        productNode.children!.push(groupNode);
      });
      
      brandNode.children!.push(productNode);
    });
    
    tree.push(brandNode);
  });
  
  return tree;
}
```

---

### 6.4 Aggregation Functions

```typescript
// Calculate totals for a group
function calculateGroupTotals(items: any[], type: 'packaging' | 'finished_goods' | 'packets') {
  switch (type) {
    case 'finished_goods':
      return {
        total_packets: items.reduce((sum, item) => sum + (item.packets || 0), 0),
        total_weight: items.reduce((sum, item) => sum + (item.weight || item.quantity || 0), 0),
        total_batches: new Set(items.map(item => item.batch_id)).size
      };
    case 'packets':
      return {
        total_available: items.reduce((sum, item) => sum + (item.available_quantity || 0), 0)
      };
    case 'packaging':
      return {
        total_packaging: items.length,
        total_ordered_weight: items.reduce((sum, item) => sum + (item.ordered_weight || 0), 0)
      };
  }
}

// Usage
const totals = calculateGroupTotals(finishedGoods, 'finished_goods');
console.log(`Total: ${totals.total_packets} packets, ${totals.total_weight}kg`);
```

---

## 7. Filtering & Search Strategies

### 7.1 Multi-Criteria Filtering

```typescript
interface InventoryFilters {
  // Brand filters
  brands?: string[];
  
  // Product filters
  product_ids?: string[];
  rice_types?: RiceType[];
  
  // Packaging filters
  holding_capacities?: number[];
  packet_types?: string[];
  vendor_ids?: string[];
  ordered_weight_range?: { min?: number; max?: number };
  
  // Finished goods filters
  batch_ids?: string[];
  min_quantity?: number;
  max_quantity?: number;
  
  // Bags filters
  bag_types?: BagType[];
  bag_capacities?: number[];
  
  // Search
  search_text?: string; // Search in product names, batch numbers, etc.
}

function applyFilters(
  hierarchicalData: HierarchicalInventoryResponse['data'],
  filters: InventoryFilters
): HierarchicalInventoryResponse['data'] {
  return hierarchicalData
    .filter(brandGroup => 
      !filters.brands || filters.brands.includes(brandGroup.brand)
    )
    .map(brandGroup => ({
      ...brandGroup,
      products: brandGroup.products
        .filter(product => {
          if (filters.product_ids && !filters.product_ids.includes(product.product_id)) return false;
          if (filters.rice_types && (!product.rice_type || !filters.rice_types.includes(product.rice_type))) return false;
          if (filters.search_text) {
            const searchLower = filters.search_text.toLowerCase();
            if (!product.product_name.toLowerCase().includes(searchLower)) return false;
          }
          return true;
        })
        .map(product => ({
          ...product,
          packaging: product.packaging
            .filter(pkg => {
              if (filters.holding_capacities && !filters.holding_capacities.includes(pkg.holding_capacity)) return false;
              if (filters.packet_types && !filters.packet_types.includes(pkg.packet_type)) return false;
              if (filters.vendor_ids) {
                if (!pkg.vendor || !filters.vendor_ids.includes(pkg.vendor.id)) return false;
              }
              if (filters.ordered_weight_range) {
                // Note: ordered_weight is on packaging, not in hierarchical response
                // Would need to fetch packaging details separately
              }
              return true;
            })
            .map(pkg => ({
              ...pkg,
              finished_goods: pkg.finished_goods.filter(fg => {
                if (filters.batch_ids && !filters.batch_ids.includes(fg.batch_id)) return false;
                if (filters.min_quantity && fg.quantity < filters.min_quantity) return false;
                if (filters.max_quantity && fg.quantity > filters.max_quantity) return false;
                if (filters.search_text) {
                  const searchLower = filters.search_text.toLowerCase();
                  if (!fg.batch_number.toLowerCase().includes(searchLower)) return false;
                }
                return true;
              })
            }))
        }))
    }))
    .filter(brandGroup => brandGroup.products.length > 0);
}
```

---

### 7.2 Search Implementation

```typescript
function searchInventory(
  hierarchicalData: HierarchicalInventoryResponse['data'],
  searchQuery: string
): {
  brands: string[];
  products: Array<{ product_id: string; product_name: string }>;
  packaging: Array<{ packaging_id: string; label: string }>;
  finished_goods: Array<{ batch_id: string; batch_number: string }>;
} {
  const query = searchQuery.toLowerCase();
  const results = {
    brands: [] as string[],
    products: [] as Array<{ product_id: string; product_name: string }>,
    packaging: [] as Array<{ packaging_id: string; label: string }>,
    finished_goods: [] as Array<{ batch_id: string; batch_number: string }>
  };
  
  hierarchicalData.forEach(brandGroup => {
    if (brandGroup.brand.toLowerCase().includes(query)) {
      results.brands.push(brandGroup.brand);
    }
    
    brandGroup.products.forEach(product => {
      if (product.product_name.toLowerCase().includes(query)) {
        results.products.push({
          product_id: product.product_id,
          product_name: product.product_name
        });
      }
      
      product.packaging.forEach(pkg => {
        const pkgLabel = `${pkg.packaging_number || pkg.packaging_id} - ${pkg.holding_capacity}kg ${pkg.packet_type}`;
        if (pkgLabel.toLowerCase().includes(query) || 
            pkg.packaging_number?.toLowerCase().includes(query) ||
            pkg.vendor?.name.toLowerCase().includes(query)) {
          results.packaging.push({
            packaging_id: pkg.packaging_id,
            label: pkgLabel
          });
        }
        
        pkg.finished_goods.forEach(fg => {
          if (fg.batch_number.toLowerCase().includes(query)) {
            results.finished_goods.push({
              batch_id: fg.batch_id,
              batch_number: fg.batch_number
            });
          }
        });
      });
    });
  });
  
  return results;
}
```

---

## Summary

### Packaging Bifurcations Available:
1. **By Holding Capacity**: 10kg, 25kg, 50kg
2. **By Packet Type**: PP Bag, Jute Bag, Woven Bag, etc.
3. **By Packaging Vendor**: Vendor ID or unassigned
4. **By Product**: Product ID
5. **By Ordered Weight**: Volume ranges (high/medium/low/not ordered)

### Product Bifurcations Available:
1. **By Brand**: Tamara, Hariom, Unbranded
2. **By Rice Type**: basmati, non_basmati, parboiled, raw, etc.

### Bags Bifurcations Available:
1. **By Bag Type**: jute, pp
2. **By Bag Capacity**: 50kg, 100kg, 150kg, etc.
3. **By Status**: filled, empty, both

### Hierarchical Visualization Options:
1. **Default**: Brand → Product → Packaging → Finished Goods
2. **By Capacity**: Brand → Product → Capacity → Packaging → Finished Goods
3. **By Vendor**: Brand → Product → Vendor → Packaging → Finished Goods
4. **By Rice Type**: Brand → Rice Type → Product → Packaging → Finished Goods
5. **Vendor Top-Level**: Vendor → Brand → Product → Packaging → Finished Goods
6. **Capacity Top-Level**: Capacity → Brand → Product → Packaging → Finished Goods
7. **Type Top-Level**: Packet Type → Brand → Product → Packaging → Finished Goods

### Key Implementation Points:
- All bifurcations can be combined for multi-level grouping
- Frontend can transform API responses to any desired structure
- Filtering and search can be applied at any level
- Aggregation functions can calculate totals for any group
- Tree structures support expandable/collapsible UI components

This comprehensive guide provides all the information needed to implement flexible, multi-dimensional inventory visualization in the frontend.

