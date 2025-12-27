# Frontend Integration Guide: Inventory System Changes

## Overview

Due to the packaging refactor (product-specific packaging with fixed weights), the inventory system behavior has changed. This document explains the backend logic changes that affect how inventory is tracked and displayed.

---

## Key Inventory Changes

### 1. Packets Inventory (Empty Packets)

**What Changed**:
- Packets inventory is now tracked per product + weight combination
- Each packaging entry (product_id + weight) has its own packets inventory
- Previously: Tracked by packaging_id only (which was weight + packet_type)
- Now: Tracked by packaging_id, but packaging_id is now unique per (product_id + weight)

**Backend Logic**:
- When a product is created, 3 packaging entries are auto-created (10kg, 25kg, 50kg)
- Each packaging entry automatically gets a packets_inventory entry initialized with 0 quantity
- Packets inventory is still tracked by `packaging_id`, but now each product has 3 separate packaging entries

**API Impact**:
- `GET /api/v1/inventory/packets` - Returns packets inventory for all packaging
- Each entry now has a `packaging_id` that is product-specific
- To get packets for a specific product: Filter by fetching packaging first, then get packets inventory

**Frontend Logic**:
```javascript
// Get packaging for a product
const packaging = await fetch(`/api/v1/packaging?product_id=${productId}`);
// Returns: [10kg, 25kg, 50kg packaging entries]

// Get packets inventory for each packaging
const packetsInventory = await fetch('/api/v1/inventory/packets');
// Filter by packaging IDs from the product
const productPackets = packetsInventory.filter(p => 
  packaging.some(pkg => pkg.id === p.packaging_id)
);
```

**Display Logic**:
- Show packets inventory grouped by product
- For each product, show 3 rows: 10kg packets, 25kg packets, 50kg packets
- Each has its own available quantity

---

### 2. Finished Goods Inventory

**What Changed**:
- **MAJOR CHANGE**: A single batch can now produce multiple finished goods entries
- Previously: One batch = one finished goods entry (one packaging size)
- Now: One batch = multiple finished goods entries (one per packaging size produced)

**Backend Logic**:
- When a batch is created with `packaging_quantities` array:
  - For each packaging size (10kg, 25kg, 50kg) with quantity > 0:
  - A separate finished_goods_inventory entry is created
  - Each entry tracks: product_id, batch_id, packaging_id, no_of_packets, total_weight

**Example**:
```
Batch created with:
- 10kg: 100 kg → Creates finished goods entry (10 packets, 100 kg)
- 25kg: 200 kg → Creates finished goods entry (8 packets, 200 kg)
- 50kg: 150 kg → Creates finished goods entry (3 packets, 150 kg)

Result: 3 finished goods entries for the same batch_id
```

**API Impact**:
- `GET /api/v1/inventory/finished-goods?batch_id={id}` - Now returns **array** (not single object)
- `GET /api/v1/inventory/finished-goods?product_id={id}` - Returns all finished goods for product (may have multiple per batch)

**Response Structure**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid1",
      "product_id": "uuid",
      "batch_id": "uuid",
      "packaging_id": "uuid-10kg",
      "no_of_packets": 10,
      "total_weight": 100,
      "packaging": {
        "id": "uuid-10kg",
        "holding_capacity": 10,
        "packet_type": "PP Bag"
      }
    },
    {
      "id": "uuid2",
      "product_id": "uuid",
      "batch_id": "uuid",  // Same batch_id
      "packaging_id": "uuid-25kg",
      "no_of_packets": 8,
      "total_weight": 200,
      "packaging": {
        "id": "uuid-25kg",
        "holding_capacity": 25,
        "packet_type": "PP Bag"
      }
    }
  ]
}
```

**Frontend Logic**:
```javascript
// Fetch finished goods for a batch
const finishedGoods = await fetch(`/api/v1/inventory/finished-goods?batch_id=${batchId}`);
// Returns: Array of finished goods (one per packaging size)

// Group by batch for display
const groupedByBatch = finishedGoods.reduce((acc, fg) => {
  if (!acc[fg.batch_id]) {
    acc[fg.batch_id] = [];
  }
  acc[fg.batch_id].push(fg);
  return acc;
}, {});

// Display logic
Object.entries(groupedByBatch).forEach(([batchId, entries]) => {
  // entries is an array - one per packaging size
  entries.forEach(entry => {
    // Display: {entry.packaging.holding_capacity}kg - {entry.no_of_packets} packets - {entry.total_weight} kg
  });
});
```

**Display Changes Required**:
- Batch details page: Show breakdown by packaging size
- Finished goods list: Group by batch, show multiple rows per batch
- Inventory summary: Aggregate correctly (sum packets and weights per batch)

---

### 3. Lot Inventory (No Changes)

**What Changed**: **NONE**

**Backend Logic**:
- Lot inventory calculations remain the same
- When a batch is created, lot inventory is decremented based on total quantity
- Total quantity = sum of all packaging_quantities[].quantity
- Lot usage is shared across all packaging sizes in a batch

**Example**:
```
Batch with:
- 10kg: 100 kg
- 25kg: 200 kg
- 50kg: 150 kg
Total: 450 kg

Lot inventory is decremented by 450 kg total (not per packaging size)
```

**API Impact**: None - API remains the same

---

### 4. Bags Inventory (No Changes)

**What Changed**: **NONE**

**Backend Logic**:
- Bags inventory calculations remain the same
- Based on lot usage (which is shared across packaging sizes)
- Bags are emptied based on total quantity used from lots

**API Impact**: None - API remains the same

---

## Inventory Aggregation Changes

### Finished Goods Summary

**Previous Logic**:
- One batch = one finished goods entry
- Summary: Count batches, sum packets, sum weights

**New Logic**:
- One batch = multiple finished goods entries
- Summary: Count unique batches, sum packets across all entries, sum weights across all entries

**Frontend Calculation**:
```javascript
// Get all finished goods
const finishedGoods = await fetch('/api/v1/inventory/finished-goods');

// Calculate summary
const summary = {
  totalBatches: new Set(finishedGoods.map(fg => fg.batch_id)).size,
  totalPackets: finishedGoods.reduce((sum, fg) => sum + fg.no_of_packets, 0),
  totalWeight: finishedGoods.reduce((sum, fg) => sum + fg.total_weight, 0),
  
  // By product
  byProduct: finishedGoods.reduce((acc, fg) => {
    if (!acc[fg.product_id]) {
      acc[fg.product_id] = { packets: 0, weight: 0 };
    }
    acc[fg.product_id].packets += fg.no_of_packets;
    acc[fg.product_id].weight += fg.total_weight;
    return acc;
  }, {})
};
```

---

### Packets Inventory Summary

**Previous Logic**:
- Group by packaging (weight + packet_type)
- Show total available packets

**New Logic**:
- Group by product + weight
- Each product has 3 separate packet inventories (10kg, 25kg, 50kg)

**Frontend Calculation**:
```javascript
// Get all packets inventory
const packetsInventory = await fetch('/api/v1/inventory/packets');

// Get all packaging to map product_id
const packaging = await fetch('/api/v1/packaging');

// Group by product
const byProduct = packaging.reduce((acc, pkg) => {
  const packets = packetsInventory.find(pi => pi.packaging_id === pkg.id);
  if (!acc[pkg.product_id]) {
    acc[pkg.product_id] = {
      '10kg': 0,
      '25kg': 0,
      '50kg': 0
    };
  }
  acc[pkg.product_id][`${pkg.holding_capacity}kg`] = packets?.available_quantity || 0;
  return acc;
}, {});
```

---

## Batch Details Display Changes

### Previous Display:
```
Batch: BATCH-20240101-abc123
Product: Premium Rice
Recipe: Recipe A
Packaging: 25kg PP Bag
Quantity: 1000 kg
Packets: 40
Status: completed

Finished Goods:
- 40 packets × 25kg = 1000 kg
```

### New Display:
```
Batch: BATCH-20240101-abc123
Product: Premium Rice
Recipe: Recipe A
Total Quantity: 450 kg
Status: completed

Packaging Breakdown:
- 10kg: 100 kg → 10 packets
- 25kg: 200 kg → 8 packets
- 50kg: 150 kg → 3 packets

Finished Goods:
- 10kg: 10 packets × 10kg = 100 kg
- 25kg: 8 packets × 25kg = 200 kg
- 50kg: 3 packets × 50kg = 150 kg
Total: 21 packets, 450 kg
```

**Frontend Implementation**:
```javascript
// Fetch batch details
const batch = await fetch(`/api/v1/batches/${batchId}`);

// Fetch finished goods for this batch (returns array)
const finishedGoods = await fetch(`/api/v1/inventory/finished-goods?batch_id=${batchId}`);

// Display breakdown
finishedGoods.forEach(fg => {
  // Show each packaging size separately
  console.log(`${fg.packaging.holding_capacity}kg: ${fg.no_of_packets} packets, ${fg.total_weight} kg`);
});
```

---

## Inventory Audit Changes

**What Changed**:
- Audit logs now track multiple finished goods entries per batch
- Packets inventory audits are per packaging (product-specific)
- Lot and bags audits remain the same (shared across packaging sizes)

**Backend Logic**:
- When batch is created:
  - One lot inventory audit per lot used (shared)
  - One bags inventory audit per bag type (shared)
  - Multiple packets inventory audits (one per packaging size)
  - Multiple finished goods inventory audits (one per packaging size)

**API Impact**:
- `GET /api/v1/batches/:id/inventory-audit` - Returns all audit entries
- Now includes multiple finished goods audit entries per batch
- Multiple packets audit entries per batch (one per packaging size)

**Frontend Display**:
- Group audit entries by type
- Show multiple entries for finished goods and packets
- Show single entries for lots and bags

---

## Summary of Frontend Changes Required

### 1. Finished Goods Display
- [ ] Handle array response from `GET /api/v1/inventory/finished-goods?batch_id={id}`
- [ ] Group by batch_id when displaying list
- [ ] Show breakdown by packaging size in batch details
- [ ] Update aggregation calculations (count unique batches, sum all entries)

### 2. Packets Inventory Display
- [ ] Group by product when displaying
- [ ] Show 3 rows per product (10kg, 25kg, 50kg)
- [ ] Fetch packaging first to get product_id mapping

### 3. Batch Details Page
- [ ] Fetch finished goods as array
- [ ] Display packaging breakdown section
- [ ] Show multiple finished goods entries per batch
- [ ] Calculate and display totals correctly

### 4. Inventory Summary/Reports
- [ ] Update aggregation logic to handle multiple entries per batch
- [ ] Count unique batches (not total entries)
- [ ] Sum packets and weights across all finished goods entries
- [ ] Group by product correctly

### 5. Inventory Audit Display
- [ ] Handle multiple finished goods audit entries per batch
- [ ] Handle multiple packets audit entries per batch
- [ ] Group and display correctly

---

## API Endpoints Summary

### No Changes:
- `GET /api/v1/inventory/lots` - Same behavior
- `GET /api/v1/inventory/bags` - Same behavior
- `GET /api/v1/inventory/packets` - Same structure, but packaging_id is now product-specific

### Changed Behavior:
- `GET /api/v1/inventory/finished-goods?batch_id={id}` - **Now returns array** (was single object)
- `GET /api/v1/inventory/finished-goods?product_id={id}` - Returns all entries (may have multiple per batch)

### New/Updated:
- `GET /api/v1/packaging?product_id={id}` - Filter packaging by product
- `GET /api/v1/batches/:id/inventory-audit` - May have multiple finished goods/packets entries

---

## Testing Checklist

- [ ] Verify finished goods API returns array for batch_id query
- [ ] Verify batch details shows multiple finished goods entries
- [ ] Verify packets inventory is grouped by product correctly
- [ ] Verify inventory summary calculations are correct
- [ ] Verify lot inventory calculations remain unchanged
- [ ] Verify bags inventory calculations remain unchanged
- [ ] Verify audit logs show multiple entries where expected

