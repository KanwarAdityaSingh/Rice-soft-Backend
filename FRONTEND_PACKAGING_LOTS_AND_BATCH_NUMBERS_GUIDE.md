# Frontend Guide: Packaging Lots & Auto-Incremental Batch Numbers

## Overview

This guide explains the recent changes to packaging lot tracking and batch number generation. These changes affect how packaging entries are created, displayed, and how batch numbers are generated.

---

## Table of Contents

1. [Packaging Multiple Lots System](#1-packaging-multiple-lots-system)
2. [Auto-Incremental Batch Numbers](#2-auto-incremental-batch-numbers)
3. [Implementation Changes](#3-implementation-changes)
4. [API Changes](#4-api-changes)
5. [UI/UX Implications](#5-uiux-implications)

---

## 1. Packaging Multiple Lots System

### What Changed

**Previous Behavior:**
- System prevented creating multiple packaging entries with same `product_id` and `holding_capacity`
- Error: "Packaging with weight X kg already exists for this product"
- Only one packaging entry allowed per product per capacity

**New Behavior:**
- **Unlimited packaging entries allowed** with same `product_id`, `holding_capacity`, and `packet_type`
- Each packaging entry is a **separate lot** with its own unique ID
- Each lot has its own separate packets inventory
- All lots exist in parallel and are shown as separate entities

### Business Logic

**Concept:**
- Each packaging entry represents a **specific lot/order** of packaging material
- When you receive a new shipment of packaging (even with identical specifications), create a **new packaging entry**
- Each lot is tracked independently with its own:
  - Unique UUID ID (auto-generated)
  - Separate packets inventory
  - Own `ordered_weight` (can differ between lots)
  - Own `packaging_vendor_id` (can differ between lots)
  - Own `initial_packets` (sets stock for that lot only)

**Example Scenario:**
```
Lot 1: Received 2000kg of 25kg PP Bags from Vendor A
  - Packaging Entry ID: uuid-1
  - Initial Packets: 80
  - Ordered Weight: 2000
  - Used over time until inventory reaches 0

Lot 2: Received 1500kg of 25kg PP Bags from Vendor A (same product, same capacity, same type)
  - Packaging Entry ID: uuid-2 (DIFFERENT - separate entity)
  - Initial Packets: 60
  - Ordered Weight: 1500
  - Exists in parallel with Lot 1
  - When Lot 1 is used up, Lot 2 is still available
```

### Key Points

1. **No Duplicate Check:**
   - System does NOT check for existing packaging with same details
   - You can create unlimited entries with identical specifications
   - Each gets a unique UUID automatically

2. **Separate Inventory:**
   - Each packaging entry has its own `packets_inventory` record
   - Lot 1's inventory is completely separate from Lot 2's inventory
   - When you set `initial_packets`, it only affects that specific lot

3. **Independent Tracking:**
   - Each lot can have different:
     - `ordered_weight` (different order quantities)
     - `packaging_vendor_id` (different suppliers)
     - `initial_packets` (different initial stock)
   - All tracked independently

---

## 2. Auto-Incremental Batch Numbers

### What Changed

**Previous Behavior:**
- Batch numbers generated as: `BATCH-YYYYMMDD-XXXXXXXX`
- Example: `BATCH-20251228-0580dd7c`
- Based on timestamp + UUID substring

**New Behavior:**
- Batch numbers generated as: `BATCH-001`, `BATCH-002`, `BATCH-003`, etc.
- Auto-incremental sequential numbers
- Zero-padded to 3 digits minimum
- Format: `BATCH-XXX` where XXX is sequential

### Business Logic

**Concept:**
- Each batch gets a sequential number automatically
- Numbers increment: 1, 2, 3, 4, ...
- Formatted with leading zeros: 001, 002, 003, ...
- Can still be manually overridden if `batch_number` is provided in request

**Example:**
```
Batch 1: BATCH-001
Batch 2: BATCH-002
Batch 3: BATCH-003
...
Batch 100: BATCH-100
Batch 101: BATCH-101
```

### Key Points

1. **Automatic Generation:**
   - If `batch_number` is not provided or is empty, system auto-generates
   - Uses PostgreSQL sequence for thread-safe incrementing
   - Format: `BATCH-` + zero-padded number

2. **Manual Override:**
   - You can still provide custom `batch_number` in request
   - If provided, system uses your value instead of auto-generating
   - Useful for special batches or external numbering systems

3. **Sequential Guarantee:**
   - Numbers are always sequential (no gaps unless manually overridden)
   - Thread-safe (handles concurrent batch creation)
   - Persistent across server restarts

---

## 3. Implementation Changes

### Packaging Creation API

**No Changes to Request/Response Structure:**
- Same API endpoint: `POST /api/v1/packaging`
- Same request body structure
- Same response structure

**Behavioral Changes:**
- **No duplicate check** - can create multiple entries with same details
- **No error** for "packaging already exists"
- Each entry gets unique UUID automatically
- `initial_packets` sets stock for that specific lot only

### Batch Creation API

**No Changes to Request/Response Structure:**
- Same API endpoint: `POST /api/v1/batches`
- Same request body structure
- Same response structure

**Behavioral Changes:**
- `batch_number` is now auto-generated if not provided
- Format changed from timestamp-based to sequential
- Can still provide custom `batch_number` to override

---

## 4. API Changes

### Packaging Creation

**Endpoint:** `POST /api/v1/packaging`

**Request (Unchanged):**
```json
{
  "product_id": "uuid",
  "holding_capacity": 25,
  "packet_type": "PP Bag",
  "packaging_vendor_id": "uuid",  // Optional
  "ordered_weight": 2000,          // Optional
  "initial_packets": 80            // Optional
}
```

**Response (Unchanged):**
```json
{
  "success": true,
  "message": "Packaging created successfully",
  "data": {
    "id": "unique-uuid-here",  // Always unique, even for same details
    "product_id": "uuid",
    "holding_capacity": 25,
    "packet_type": "PP Bag",
    "packaging_vendor_id": "uuid",
    "ordered_weight": 2000,
    "created_at": "2025-12-28T17:30:00.000Z",
    "updated_at": "2025-12-28T17:30:00.000Z"
  }
}
```

**Key Changes:**
- No error for duplicate details
- Each call creates a new entry with new UUID
- `initial_packets` sets stock for this specific entry only

### Batch Creation

**Endpoint:** `POST /api/v1/batches`

**Request (Unchanged):**
```json
{
  "recipe_id": "uuid",
  "quantity": 500,
  "batch_number": null  // Optional - if null/empty, auto-generated
}
```

**Response (Changed - batch_number format):**
```json
{
  "success": true,
  "message": "Batch created successfully",
  "data": {
    "id": "uuid",
    "batch_number": "BATCH-001",  // NEW FORMAT: Sequential number
    "recipe_id": "uuid",
    "quantity": 500,
    "status": "recipe_attached",
    "created_at": "2025-12-28T17:30:00.000Z",
    "updated_at": "2025-12-28T17:30:00.000Z"
  }
}
```

**Key Changes:**
- `batch_number` format: `BATCH-001`, `BATCH-002`, etc.
- Auto-generated if not provided
- Sequential and incremental

---

## 5. UI/UX Implications

### Packaging Creation Form

#### Changes Needed:

1. **Remove Duplicate Warning:**
   - **OLD:** Show warning/error if packaging with same details exists
   - **NEW:** No warning needed - multiple lots are allowed

2. **Update Help Text:**
   - **OLD:** "Packaging with this capacity already exists for this product"
   - **NEW:** "Each packaging entry is a separate lot. You can create multiple lots with the same details."

3. **Initial Packets Field:**
   - **OLD:** "Sets initial stock. If packaging already has inventory, this will replace it."
   - **NEW:** "Sets initial stock for this specific packaging lot. Each lot has its own separate inventory."

4. **Success Message:**
   - **OLD:** "Packaging created successfully"
   - **NEW:** "Packaging lot created successfully" (optional - for clarity)

#### Form Behavior:

```typescript
// No need to check for existing packaging
// Just create directly - system allows multiple lots

async function handleCreatePackaging(formData: CreatePackagingFormData) {
  // No duplicate check needed
  const response = await createPackaging(formData);
  
  // Success - new lot created with unique ID
  // Show success message
  // Optionally refresh packaging list to show new lot
}
```

### Packaging List/Display

#### Changes Needed:

1. **Show All Lots:**
   - Display ALL packaging entries, even with identical details
   - Each lot shown as separate row/item
   - Show unique ID or lot identifier

2. **Grouping Options:**
   - **Option 1:** Show all lots flat (each as separate item)
   - **Option 2:** Group by (product + capacity + type), then show lots within group
   - **Option 3:** Show lots with lot number/identifier

3. **Inventory Display:**
   - Show inventory for each lot separately
   - Don't aggregate inventory across lots
   - Each lot shows its own available packets

#### Display Structure Options:

**Option 1: Flat List (All Lots Separate)**
```
Packaging List:
  - Lot 1: Product A - 25kg PP Bag (Vendor A) - 80 packets
  - Lot 2: Product A - 25kg PP Bag (Vendor A) - 60 packets
  - Lot 3: Product B - 10kg Jute Bag (Vendor B) - 50 packets
```

**Option 2: Grouped by Specifications**
```
Product A - 25kg PP Bag:
  - Lot 1 (ID: uuid-1): Vendor A, Ordered: 2000kg, Stock: 80 packets
  - Lot 2 (ID: uuid-2): Vendor A, Ordered: 1500kg, Stock: 60 packets

Product B - 10kg Jute Bag:
  - Lot 3 (ID: uuid-3): Vendor B, Ordered: 1000kg, Stock: 50 packets
```

**Option 3: With Lot Numbers**
```
Product A - 25kg PP Bag:
  - Lot #1: 80 packets available (Ordered: 2000kg from Vendor A)
  - Lot #2: 60 packets available (Ordered: 1500kg from Vendor A)
```

### Batch Creation Form

#### Changes Needed:

1. **Batch Number Field:**
   - **OLD:** Optional field, shows generated format `BATCH-YYYYMMDD-XXXXXXXX`
   - **NEW:** Optional field, shows format `BATCH-XXX` (sequential)
   - Help text: "Leave empty for auto-generation (BATCH-001, BATCH-002, etc.)"

2. **Display Format:**
   - Show next expected number: "Next batch will be: BATCH-XXX"
   - Or show last batch number: "Last batch: BATCH-XXX"

#### Form Behavior:

```typescript
// Batch number is optional - auto-generated if not provided
async function handleCreateBatch(formData: CreateBatchFormData) {
  const response = await createBatch({
    recipe_id: formData.recipe_id,
    quantity: formData.quantity,
    batch_number: formData.batch_number || null  // null = auto-generate
  });
  
  // Response includes generated batch_number
  // Format: BATCH-001, BATCH-002, etc.
}
```

### Batch List/Display

#### Changes Needed:

1. **Display Format:**
   - Show batch numbers in new format: `BATCH-001`, `BATCH-002`, etc.
   - Sort by batch number (will be sequential)
   - Show sequential order clearly

2. **Filtering/Search:**
   - Can filter by batch number range: "BATCH-001 to BATCH-010"
   - Search by number: "001", "002", etc.

---

## Implementation Examples

### Example 1: Creating Multiple Packaging Lots

```typescript
// Create Lot 1
const lot1 = await createPackaging({
  product_id: "product-uuid",
  holding_capacity: 25,
  packet_type: "PP Bag",
  packaging_vendor_id: "vendor-uuid",
  ordered_weight: 2000,
  initial_packets: 80
});
// Result: { id: "lot-1-uuid", ... }

// Create Lot 2 (same details - allowed now!)
const lot2 = await createPackaging({
  product_id: "product-uuid",      // Same
  holding_capacity: 25,            // Same
  packet_type: "PP Bag",            // Same
  packaging_vendor_id: "vendor-uuid", // Same
  ordered_weight: 1500,             // Different order
  initial_packets: 60               // Different initial stock
});
// Result: { id: "lot-2-uuid", ... } - DIFFERENT ID

// Both lots exist in parallel
// Both have separate inventory
// Both shown as separate entities
```

### Example 2: Displaying Multiple Lots

```typescript
// Fetch all packaging
const allPackaging = await fetch('/api/v1/packaging').then(r => r.json());

// Group by product + capacity + type
const grouped = groupPackagingBySpecs(allPackaging.data);

function groupPackagingBySpecs(packaging: Packaging[]) {
  const groups = new Map<string, Packaging[]>();
  
  packaging.forEach(pkg => {
    const key = `${pkg.product_id}-${pkg.holding_capacity}-${pkg.packet_type}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pkg);
  });
  
  return groups;
}

// Display
grouped.forEach((lots, key) => {
  console.log(`Specification: ${key}`);
  lots.forEach((lot, index) => {
    console.log(`  Lot ${index + 1} (ID: ${lot.id}): ${lot.ordered_weight}kg ordered, ${getInventory(lot.id)} packets`);
  });
});
```

### Example 3: Batch Number Display

```typescript
// Create batch without batch_number
const batch1 = await createBatch({
  recipe_id: "recipe-uuid",
  quantity: 500
  // batch_number not provided
});
// Result: { batch_number: "BATCH-001", ... }

// Create another batch
const batch2 = await createBatch({
  recipe_id: "recipe-uuid",
  quantity: 750
  // batch_number not provided
});
// Result: { batch_number: "BATCH-002", ... }

// Create batch with custom number
const batch3 = await createBatch({
  recipe_id: "recipe-uuid",
  quantity: 1000,
  batch_number: "CUSTOM-BATCH-001"  // Override
});
// Result: { batch_number: "CUSTOM-BATCH-001", ... }

// Next auto-generated will be BATCH-003 (sequence continues)
```

### Example 4: Packaging Inventory Display

```typescript
// Fetch packaging with inventory
const packaging = await fetch('/api/v1/packaging').then(r => r.json());
const inventory = await fetch('/api/v1/inventory/packets').then(r => r.json());

// Create map of packaging_id -> available_quantity
const inventoryMap = new Map(
  inventory.data.map(item => [item.packaging_id, item.available_quantity])
);

// Display each lot separately
packaging.data.forEach(lot => {
  const availablePackets = inventoryMap.get(lot.id) || 0;
  console.log(`
    Lot ID: ${lot.id}
    Product: ${lot.product_id}
    Capacity: ${lot.holding_capacity}kg
    Type: ${lot.packet_type}
    Vendor: ${lot.packaging_vendor_id}
    Ordered: ${lot.ordered_weight}kg
    Available Packets: ${availablePackets}
  `);
});

// Even if multiple lots have same product/capacity/type,
// they are shown as separate entries with different IDs
```

---

## Key Implementation Points

### For Packaging:

1. **No Duplicate Validation:**
   - Remove any client-side checks for duplicate packaging
   - Remove error handling for "packaging already exists"
   - Allow unlimited entries with same details

2. **Display All Lots:**
   - Show all packaging entries, even with identical specifications
   - Each lot displayed as separate entity
   - Show unique ID or lot identifier
   - Display inventory per lot (not aggregated)

3. **Initial Packets:**
   - Update help text to clarify it sets stock for that specific lot
   - Each lot's inventory is independent
   - No replacement of other lots' inventory

4. **Grouping Options:**
   - Consider grouping by (product + capacity + type) for better UX
   - Show lots within each group
   - Allow filtering by lot attributes (vendor, ordered_weight, etc.)

### For Batches:

1. **Batch Number Display:**
   - Update to show new format: `BATCH-001`, `BATCH-002`, etc.
   - Show sequential order
   - Can display "Next batch: BATCH-XXX" if helpful

2. **Sorting:**
   - Sort by batch number (will be sequential)
   - Can also sort by creation date

3. **Search/Filter:**
   - Allow searching by batch number: "001", "002", etc.
   - Filter by range: "BATCH-001 to BATCH-010"

---

## Migration Notes

### Breaking Changes:

**None** - These are additive/enhancement changes:
- Packaging API structure unchanged
- Batch API structure unchanged
- Only behavior changed (allows multiple lots, different batch number format)

### Backward Compatibility:

- Existing packaging entries remain valid
- Existing batch numbers remain valid (not changed retroactively)
- New batches get new sequential numbers
- Old batches keep their original numbers

### Data Migration:

- No data migration needed
- Existing packaging entries continue to work
- New packaging entries can be created alongside existing ones
- Batch number sequence starts from current max or 1

---

## Summary

### Packaging Multiple Lots:
- ✅ Unlimited packaging entries allowed with same details
- ✅ Each entry is separate lot with unique UUID
- ✅ Each lot has separate inventory
- ✅ All lots shown as separate entities
- ✅ `initial_packets` sets stock for that lot only

### Auto-Incremental Batch Numbers:
- ✅ Format: `BATCH-001`, `BATCH-002`, `BATCH-003`, etc.
- ✅ Sequential and auto-incremental
- ✅ Auto-generated if not provided
- ✅ Can be manually overridden

### Frontend Changes Required:
1. Remove duplicate packaging validation/checks
2. Update help text for initial_packets field
3. Display all packaging lots (even with same details)
4. Show batch numbers in new format
5. Update any batch number format expectations

These changes improve lot tracking and make batch numbering more intuitive and sequential.

