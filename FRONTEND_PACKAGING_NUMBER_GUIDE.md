# Frontend Guide: Packaging Sequential Numbers

## Overview

Packaging entries now have sequential numbers (like batch numbers) in addition to UUID IDs. This guide explains the changes and how to handle them on the frontend.

---

## What Changed

### Packaging Model Update

**New Field Added:**
- `packaging_number`: Sequential number in format `PACK-001`, `PACK-002`, `PACK-003`, etc.
- Auto-generated if not provided
- Can be manually overridden
- Unique per packaging entry

**Structure:**
```typescript
interface Packaging {
  id: string;                    // UUID primary key (unchanged)
  packaging_number: string | null; // NEW: Sequential number (PACK-001, PACK-002, etc.)
  product_id: string;
  holding_capacity: 10 | 25 | 50;
  packet_type: string;
  packaging_vendor_id: string | null;
  ordered_weight: number | null;
  created_at: string;
  updated_at: string;
}
```

---

## API Response Changes

### Packaging Creation Response

**Before:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "product_id": "uuid",
    "holding_capacity": 25,
    "packet_type": "PP Bag",
    ...
  }
}
```

**After:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",  // UUID (unchanged)
    "packaging_number": "PACK-001",                // NEW: Sequential number
    "product_id": "uuid",
    "holding_capacity": 25,
    "packet_type": "PP Bag",
    ...
  }
}
```

### All Packaging Endpoints

All packaging endpoints now return `packaging_number`:
- `GET /api/v1/packaging` - All responses include `packaging_number`
- `GET /api/v1/packaging/:id` - Response includes `packaging_number`
- `POST /api/v1/packaging` - Response includes auto-generated `packaging_number`
- `PUT /api/v1/packaging/:id` - Response includes `packaging_number`

### Inventory Endpoints

**Packets Inventory (`GET /api/v1/inventory/packets`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "packaging_id": "uuid",
      "available_quantity": 80,
      "packaging": {
        "id": "uuid",
        "packaging_number": "PACK-001",  // NEW: Included in inventory
        "holding_capacity": 25,
        "packet_type": "PP Bag",
        "packaging_vendor_id": "uuid",
        "ordered_weight": 2000
      }
    }
  ]
}
```

**Hierarchical Inventory (`GET /api/v1/inventory/hierarchical`):**
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
          "packaging": [
            {
              "packaging_id": "uuid",
              "packaging_number": "PACK-001",  // NEW: Included in inventory
              "holding_capacity": 25,
              "packet_type": "PP Bag",
              "vendor": { "id": "uuid", "name": "ABC Packaging" },
              "finished_goods": [...]
            }
          ]
        }
      ]
    }
  ]
}
```

**Finished Goods Inventory (`GET /api/v1/inventory/finished-goods`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "packaging_id": "uuid",
      "packaging": {
        "id": "uuid",
        "packaging_number": "PACK-001",  // NEW: Included in inventory
        "holding_capacity": 25,
        "packet_type": "PP Bag"
      },
      ...
    }
  ]
}
```

---

## Frontend Implementation

### 1. Display Packaging Number

**Use `packaging_number` for display instead of UUID:**

```typescript
// Display packaging in lists
function PackagingListItem({ packaging }: { packaging: Packaging }) {
  return (
    <div>
      <h3>{packaging.packaging_number || packaging.id}</h3>
      {/* Use packaging_number for display, fallback to id if null */}
      <p>{packaging.holding_capacity}kg {packaging.packet_type}</p>
    </div>
  );
}
```

**Benefits:**
- More user-friendly: `PACK-001` vs `550e8400-e29b-41d4-a716-446655440000`
- Sequential and easy to reference
- Can sort by packaging number

### 2. Sorting by Packaging Number

```typescript
// Sort packaging by sequential number
const sortedPackaging = packaging.sort((a, b) => {
  if (!a.packaging_number || !b.packaging_number) return 0;
  const numA = parseInt(a.packaging_number.replace('PACK-', ''));
  const numB = parseInt(b.packaging_number.replace('PACK-', ''));
  return numA - numB;
});
```

### 3. Grouping Multiple Lots

**When displaying multiple lots with same details, show packaging number:**

```typescript
// Group by product + capacity + type, show lots within
function PackagingGroup({ lots }: { lots: Packaging[] }) {
  return (
    <div>
      <h3>{lots[0].holding_capacity}kg {lots[0].packet_type}</h3>
      {lots.map(lot => (
        <div key={lot.id}>
          <span>{lot.packaging_number}</span> {/* PACK-001, PACK-002, etc. */}
          <span>Ordered: {lot.ordered_weight}kg</span>
          <span>Stock: {getInventory(lot.id)} packets</span>
        </div>
      ))}
    </div>
  );
}
```

### 4. Search/Filter by Packaging Number

```typescript
// Allow searching by packaging number
function searchPackaging(packaging: Packaging[], query: string) {
  const searchLower = query.toLowerCase();
  return packaging.filter(pkg => 
    pkg.packaging_number?.toLowerCase().includes(searchLower) ||
    pkg.id.toLowerCase().includes(searchLower) ||
    pkg.packet_type.toLowerCase().includes(searchLower)
  );
}

// Usage: Search for "PACK-001" or "001"
```

### 5. Display Format

**Recommended Display:**
```
Packaging Number: PACK-001
Product: Premium Basmati Rice
Capacity: 25kg
Type: PP Bag
Vendor: ABC Packaging
Ordered: 2000kg
Available: 80 packets
```

**In Lists:**
```
PACK-001 | 25kg PP Bag | 80 packets | Vendor A
PACK-002 | 25kg PP Bag | 60 packets | Vendor A
PACK-003 | 10kg Jute Bag | 50 packets | Vendor B
```

### 6. Using in Inventory Displays

**All inventory endpoints now include `packaging_number`:**

```typescript
// Hierarchical Inventory
function InventoryDisplay({ inventory }: { inventory: HierarchicalInventory }) {
  return inventory.data.map(brand => (
    <div key={brand.brand}>
      {brand.products.map(product => (
        <div key={product.product_id}>
          {product.packaging.map(pkg => (
            <div key={pkg.packaging_id}>
              <h4>{pkg.packaging_number || pkg.packaging_id}</h4>
              <p>{pkg.holding_capacity}kg {pkg.packet_type}</p>
              <p>Available: {getPacketsCount(pkg.packaging_id)} packets</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  ));
}

// Packets Inventory
function PacketsInventoryDisplay({ packets }: { packets: PacketsInventory[] }) {
  return packets.map(item => (
    <div key={item.packaging_id}>
      <h4>{item.packaging?.packaging_number || item.packaging_id}</h4>
      <p>Available: {item.available_quantity} packets</p>
      <p>{item.packaging?.holding_capacity}kg {item.packaging?.packet_type}</p>
    </div>
  ));
}
```

**Key Points for Inventory:**
- Always display `packaging_number` when showing packaging in inventory
- Use `packaging_number` to distinguish between multiple lots with same details
- Sort inventory by `packaging_number` for sequential order
- Search inventory by `packaging_number` for better UX

---

## Key Points

1. **Dual Identifiers:**
   - `id`: UUID (for API calls, database operations)
   - `packaging_number`: Sequential number (for display, user reference)

2. **Display Priority:**
   - Use `packaging_number` for user-facing display
   - Use `id` (UUID) for API calls and internal operations
   - Fallback to `id` if `packaging_number` is null (for old data)

3. **Sorting:**
   - Sort by `packaging_number` for sequential order
   - Extract number from "PACK-XXX" format for numeric sorting

4. **Multiple Lots:**
   - Each lot has unique `packaging_number` (PACK-001, PACK-002, etc.)
   - Even with same product/capacity/type, numbers are sequential
   - Use `packaging_number` to distinguish between lots

5. **Search:**
   - Allow searching by `packaging_number` (e.g., "PACK-001" or "001")
   - More user-friendly than searching by UUID

---

## Migration Notes

**Backward Compatibility:**
- Existing packaging entries may have `null` `packaging_number`
- Always check for null and fallback to `id` for display
- New packaging entries will always have `packaging_number` auto-generated

**Example:**
```typescript
const displayId = packaging.packaging_number || packaging.id;
// Shows PACK-001 if available, otherwise shows UUID
```

---

## Summary

- ✅ Packaging now has `packaging_number` field (PACK-001, PACK-002, etc.)
- ✅ Auto-generated if not provided
- ✅ Use for display and user reference
- ✅ Keep using `id` (UUID) for API operations
- ✅ Sort and search by `packaging_number` for better UX
- ✅ Each lot gets sequential number, even with same details

