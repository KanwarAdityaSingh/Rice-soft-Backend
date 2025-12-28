# Frontend Guide: Packaging Creation API

## Overview

This guide explains how to create packaging entries in the system. Each packaging entry represents a specific lot of packaging material for a product, and can optionally include initial stock of empty packets.

---

## API Endpoint

```
POST /api/v1/packaging
```

**Authentication:** Required (Bearer token)

---

## Request Structure

### Request Body

```typescript
interface CreatePackagingRequest {
  product_id: string;              // REQUIRED - UUID of the product
  holding_capacity: 10 | 25 | 50;  // REQUIRED - Weight capacity per packet (kg)
  packet_type: string;             // REQUIRED - Type of packet (e.g., "PP Bag", "Jute Bag")
  packaging_vendor_id?: string;    // OPTIONAL - UUID of packaging vendor
  ordered_weight?: number;         // OPTIONAL - Initial ordered quantity from vendor (kg)
  initial_packets?: number;        // OPTIONAL - Initial number of empty packets to set
  created_by?: string;             // OPTIONAL - Auto-set from authenticated user
}
```

### Field Descriptions

#### Required Fields

1. **`product_id`** (string, UUID)
   - The product this packaging belongs to
   - Must be a valid product ID that exists in the system
   - Each packaging entry is product-specific

2. **`holding_capacity`** (number: 10, 25, or 50)
   - Weight capacity per packet in kilograms
   - Only three values allowed: `10`, `25`, or `50`
   - Determines how much product each packet can hold

3. **`packet_type`** (string)
   - Type/material of the packet
   - Examples: "PP Bag", "Jute Bag", "Woven Bag", "Polypropylene Bag"
   - Can be any string value
   - Used for categorization and filtering

#### Optional Fields

4. **`packaging_vendor_id`** (string, UUID, nullable)
   - ID of the vendor who supplies this packaging
   - Links to `packaging_vendors` table
   - Can be `null` if vendor is not assigned
   - Used for vendor tracking and procurement

5. **`ordered_weight`** (number, nullable)
   - Initial ordered quantity from vendor in kilograms
   - Static value - represents the original order quantity
   - Does NOT get incremented/decremented with inventory changes
   - Used for procurement tracking and historical reference
   - Example: If you ordered 2000 kg of 25kg packets, `ordered_weight` = 2000

6. **`initial_packets`** (number, integer, min: 0, nullable)
   - **NEW FIELD** - Initial number of empty packets to set
   - Sets the initial stock (does NOT add to existing)
   - If packaging already has inventory, this will REPLACE the existing quantity
   - If not provided or 0, no packets inventory is created
   - Must be a non-negative integer
   - Used to set initial stock when creating new packaging lot

---

## Request Examples

### Example 1: Basic Packaging Creation (No Initial Stock)

```json
POST /api/v1/packaging
{
  "product_id": "550e8400-e29b-41d4-a716-446655440000",
  "holding_capacity": 25,
  "packet_type": "PP Bag"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Packaging created successfully",
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "product_id": "550e8400-e29b-41d4-a716-446655440000",
    "holding_capacity": 25,
    "packet_type": "PP Bag",
    "packaging_vendor_id": null,
    "ordered_weight": null,
    "created_at": "2025-12-28T17:30:00.000Z",
    "updated_at": "2025-12-28T17:30:00.000Z"
  }
}
```

---

### Example 2: Complete Packaging Creation with All Fields

```json
POST /api/v1/packaging
{
  "product_id": "550e8400-e29b-41d4-a716-446655440000",
  "holding_capacity": 25,
  "packet_type": "PP Bag",
  "packaging_vendor_id": "770e8400-e29b-41d4-a716-446655440002",
  "ordered_weight": 2000,
  "initial_packets": 80
}
```

**What Happens:**
1. Packaging entry is created
2. Packets inventory is set to 80 packets (initial stock)
3. Audit log entry is created for the initial stock

**Response:**
```json
{
  "success": true,
  "message": "Packaging created successfully",
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "product_id": "550e8400-e29b-41d4-a716-446655440000",
    "holding_capacity": 25,
    "packet_type": "PP Bag",
    "packaging_vendor_id": "770e8400-e29b-41d4-a716-446655440002",
    "ordered_weight": 2000,
    "created_at": "2025-12-28T17:30:00.000Z",
    "updated_at": "2025-12-28T17:30:00.000Z"
  }
}
```

---

### Example 3: Creating Multiple Packaging Lots (Same Details, Different Lots)

**Scenario:** You have multiple lots of the same packaging type arriving at different times.

**Lot 1:**
```json
POST /api/v1/packaging
{
  "product_id": "550e8400-e29b-41d4-a716-446655440000",
  "holding_capacity": 25,
  "packet_type": "PP Bag",
  "packaging_vendor_id": "770e8400-e29b-41d4-a716-446655440002",
  "ordered_weight": 2000,
  "initial_packets": 80
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "lot-1-uuid-here",
    "product_id": "550e8400-e29b-41d4-a716-446655440000",
    "holding_capacity": 25,
    "packet_type": "PP Bag",
    "packaging_vendor_id": "770e8400-e29b-41d4-a716-446655440002",
    "ordered_weight": 2000,
    "created_at": "2025-12-28T17:30:00.000Z"
  }
}
```

**Lot 2 (Same Details, Different Lot):**
```json
POST /api/v1/packaging
{
  "product_id": "550e8400-e29b-41d4-a716-446655440000",  // Same product
  "holding_capacity": 25,                                // Same capacity
  "packet_type": "PP Bag",                                // Same type
  "packaging_vendor_id": "770e8400-e29b-41d4-a716-446655440002", // Same vendor
  "ordered_weight": 1500,                                 // Different order
  "initial_packets": 60                                   // Different initial stock
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "lot-2-uuid-here",  // DIFFERENT ID - separate entity
    "product_id": "550e8400-e29b-41d4-a716-446655440000",
    "holding_capacity": 25,
    "packet_type": "PP Bag",
    "packaging_vendor_id": "770e8400-e29b-41d4-a716-446655440002",
    "ordered_weight": 1500,
    "created_at": "2025-12-28T18:00:00.000Z"
  }
}
```

**Important:** 
- Both lots are created as **separate entities** with different UUIDs
- Each lot has its own packets inventory (Lot 1: 80 packets, Lot 2: 60 packets)
- Both lots exist in parallel and are shown separately in inventory
- When Lot 1 is used up, Lot 2 remains available
- You can create unlimited lots with identical specifications

---

## Validation Rules

### Client-Side Validation

1. **Product ID Validation:**
   ```typescript
   - Must be a valid UUID format
   - Product must exist in the system
   ```

2. **Holding Capacity Validation:**
   ```typescript
   - Must be exactly 10, 25, or 50
   - No other values allowed
   ```

3. **Packet Type Validation:**
   ```typescript
   - Must be a non-empty string
   - Maximum length: 255 characters
   - Cannot be null or empty
   ```

4. **Packaging Vendor ID Validation:**
   ```typescript
   - If provided, must be a valid UUID
   - Vendor must exist in the system (if provided)
   - Can be null or omitted
   ```

5. **Ordered Weight Validation:**
   ```typescript
   - If provided, must be >= 0
   - Can have up to 2 decimal places
   - Can be null or omitted
   ```

6. **Initial Packets Validation:**
   ```typescript
   - If provided, must be an integer >= 0
   - Cannot be negative
   - Can be null or omitted
   - If 0, no inventory is created
   ```

### Server-Side Validation

1. **Product Existence:**
   - Product must exist in the database
   - Error: `"Product not found"` (404)

2. **Packaging Multiple Lots:**
   - **IMPORTANT:** The system allows unlimited packaging entries with the same `product_id`, `holding_capacity`, and `packet_type`
   - This is intentional - each entry represents a separate lot
   - Each packaging entry gets a unique UUID ID (auto-generated)
   - No duplicate check is performed - you can create as many lots as needed
   - Each lot has its own separate inventory

3. **Vendor Existence (if provided):**
   - If `packaging_vendor_id` is provided, vendor must exist
   - Error: Foreign key constraint violation

---

## Business Logic

### Initial Packets Behavior

**When `initial_packets` is provided:**

1. **Each Packaging Entry is a Separate Lot:**
   - Each packaging entry gets a unique UUID ID (auto-generated)
   - Each packaging entry has its own separate packets inventory
   - Even if you create multiple packaging entries with identical `product_id`, `holding_capacity`, and `packet_type`, they are separate entities
   - Each lot's inventory is tracked independently

2. **Initial Stock Setting:**
   - Creates new packets inventory entry for THIS specific packaging lot
   - Sets `available_quantity` to the specified `initial_packets` value
   - Creates audit log entry
   - **Important:** This sets stock for THIS lot only - other lots are unaffected

**When `initial_packets` is NOT provided or is 0:**

- Packaging is created normally with unique ID
- No packets inventory entry is created
- Packets can be added later via `POST /api/v1/packaging/:id/inventory`

### Multiple Lots with Same Details

**Scenario:** Creating multiple packaging entries with identical specifications

```typescript
// Lot 1: Received 2000kg, 80 packets
POST /api/v1/packaging
{
  "product_id": "product-uuid",
  "holding_capacity": 25,
  "packet_type": "PP Bag",
  "packaging_vendor_id": "vendor-uuid",
  "ordered_weight": 2000,
  "initial_packets": 80
}

// Lot 2: Received 1500kg, 60 packets (same product, capacity, type, vendor)
POST /api/v1/packaging
{
  "product_id": "product-uuid",      // Same product
  "holding_capacity": 25,            // Same capacity
  "packet_type": "PP Bag",           // Same type
  "packaging_vendor_id": "vendor-uuid", // Same vendor
  "ordered_weight": 1500,            // Different order quantity
  "initial_packets": 60              // Different initial stock
}
```

**Result:**
- Two separate packaging entries are created
- Each has its own unique ID
- Each has its own packets inventory
- Each can be tracked independently
- When Lot 1 is used up, Lot 2 can be used

---

## Error Responses

### Error 1: Product Not Found

**Status:** 404 Not Found

```json
{
  "success": false,
  "message": "Product not found",
  "error": "NotFoundError"
}
```

**Cause:** The `product_id` does not exist in the system.

---

### Error 2: Invalid Holding Capacity

**Status:** 400 Bad Request

```json
{
  "success": false,
  "message": "\"holding_capacity\" must be one of [10, 25, 50]",
  "error": "ValidationError"
}
```

**Cause:** `holding_capacity` is not 10, 25, or 50.

---

### Error 3: Invalid Packet Type

**Status:** 400 Bad Request

```json
{
  "success": false,
  "message": "\"packet_type\" is not allowed to be empty",
  "error": "ValidationError"
}
```

**Cause:** `packet_type` is empty or missing.

---

### Error 4: Invalid Initial Packets

**Status:** 400 Bad Request

```json
{
  "success": false,
  "message": "\"initial_packets\" must be a number",
  "error": "ValidationError"
}
```

**Cause:** `initial_packets` is not a valid integer >= 0.

---

### Error 5: Vendor Not Found (if provided)

**Status:** 500 Internal Server Error (Database constraint)

**Cause:** `packaging_vendor_id` references a non-existent vendor.

---

## Frontend Implementation

### TypeScript Interface

```typescript
interface CreatePackagingFormData {
  product_id: string;
  holding_capacity: 10 | 25 | 50;
  packet_type: string;
  packaging_vendor_id?: string | null;
  ordered_weight?: number | null;
  initial_packets?: number | null;
}

interface PackagingResponse {
  id: string;
  product_id: string;
  holding_capacity: 10 | 25 | 50;
  packet_type: string;
  packaging_vendor_id: string | null;
  ordered_weight: number | null;
  created_at: string;
  updated_at: string;
}
```

### API Call Function

```typescript
async function createPackaging(
  data: CreatePackagingFormData,
  token: string
): Promise<PackagingResponse> {
  const response = await fetch('/api/v1/packaging', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      product_id: data.product_id,
      holding_capacity: data.holding_capacity,
      packet_type: data.packet_type,
      ...(data.packaging_vendor_id && { packaging_vendor_id: data.packaging_vendor_id }),
      ...(data.ordered_weight !== undefined && data.ordered_weight !== null && { ordered_weight: data.ordered_weight }),
      ...(data.initial_packets !== undefined && data.initial_packets !== null && data.initial_packets > 0 && { initial_packets: data.initial_packets })
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create packaging');
  }

  const result = await response.json();
  return result.data;
}
```

### Form Validation

```typescript
function validatePackagingForm(data: CreatePackagingFormData): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  // Product ID validation
  if (!data.product_id || !isValidUUID(data.product_id)) {
    errors.product_id = 'Valid product is required';
  }

  // Holding capacity validation
  if (![10, 25, 50].includes(data.holding_capacity)) {
    errors.holding_capacity = 'Holding capacity must be 10, 25, or 50 kg';
  }

  // Packet type validation
  if (!data.packet_type || data.packet_type.trim().length === 0) {
    errors.packet_type = 'Packet type is required';
  }
  if (data.packet_type && data.packet_type.length > 255) {
    errors.packet_type = 'Packet type cannot exceed 255 characters';
  }

  // Vendor ID validation (if provided)
  if (data.packaging_vendor_id && !isValidUUID(data.packaging_vendor_id)) {
    errors.packaging_vendor_id = 'Invalid vendor ID';
  }

  // Ordered weight validation (if provided)
  if (data.ordered_weight !== undefined && data.ordered_weight !== null) {
    if (data.ordered_weight < 0) {
      errors.ordered_weight = 'Ordered weight cannot be negative';
    }
    if (data.ordered_weight % 1 !== 0 && data.ordered_weight.toString().split('.')[1].length > 2) {
      errors.ordered_weight = 'Ordered weight can have maximum 2 decimal places';
    }
  }

  // Initial packets validation (if provided)
  if (data.initial_packets !== undefined && data.initial_packets !== null) {
    if (!Number.isInteger(data.initial_packets)) {
      errors.initial_packets = 'Initial packets must be an integer';
    }
    if (data.initial_packets < 0) {
      errors.initial_packets = 'Initial packets cannot be negative';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
```

### UI Form Example

```typescript
function PackagingCreationForm() {
  const [formData, setFormData] = useState<CreatePackagingFormData>({
    product_id: '',
    holding_capacity: 25,
    packet_type: '',
    packaging_vendor_id: null,
    ordered_weight: null,
    initial_packets: null
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<PackagingVendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load products and vendors on mount
  useEffect(() => {
    loadProducts();
    loadVendors();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const validation = validatePackagingForm(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setLoading(true);
    try {
      await createPackaging(formData, token);
      // Success - show message, reset form, or redirect
    } catch (error) {
      // Handle error
      setErrors({ submit: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Product Selection */}
      <select
        value={formData.product_id}
        onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
        required
      >
        <option value="">Select Product</option>
        {products.map(product => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </select>
      {errors.product_id && <span>{errors.product_id}</span>}

      {/* Holding Capacity */}
      <select
        value={formData.holding_capacity}
        onChange={(e) => setFormData({ ...formData, holding_capacity: Number(e.target.value) as 10 | 25 | 50 })}
        required
      >
        <option value="10">10 kg</option>
        <option value="25">25 kg</option>
        <option value="50">50 kg</option>
      </select>
      {errors.holding_capacity && <span>{errors.holding_capacity}</span>}

      {/* Packet Type */}
      <input
        type="text"
        value={formData.packet_type}
        onChange={(e) => setFormData({ ...formData, packet_type: e.target.value })}
        placeholder="e.g., PP Bag, Jute Bag"
        required
        maxLength={255}
      />
      {errors.packet_type && <span>{errors.packet_type}</span>}

      {/* Vendor Selection (Optional) */}
      <select
        value={formData.packaging_vendor_id || ''}
        onChange={(e) => setFormData({ ...formData, packaging_vendor_id: e.target.value || null })}
      >
        <option value="">Select Vendor (Optional)</option>
        {vendors.map(vendor => (
          <option key={vendor.id} value={vendor.id}>
            {vendor.name}
          </option>
        ))}
      </select>

      {/* Ordered Weight (Optional) */}
      <input
        type="number"
        value={formData.ordered_weight || ''}
        onChange={(e) => setFormData({ ...formData, ordered_weight: e.target.value ? Number(e.target.value) : null })}
        placeholder="Ordered weight in kg (Optional)"
        min="0"
        step="0.01"
      />
      {errors.ordered_weight && <span>{errors.ordered_weight}</span>}

      {/* Initial Packets (Optional) */}
      <input
        type="number"
        value={formData.initial_packets || ''}
        onChange={(e) => setFormData({ ...formData, initial_packets: e.target.value ? Number(e.target.value) : null })}
        placeholder="Initial number of packets (Optional)"
        min="0"
        step="1"
      />
      <small>Sets initial stock for this specific packaging lot. Each packaging entry is a separate lot with its own unique ID and inventory.</small>
      {errors.initial_packets && <span>{errors.initial_packets}</span>}

      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Packaging'}
      </button>
      {errors.submit && <span>{errors.submit}</span>}
    </form>
  );
}
```

---

## Key Points to Remember

1. **Each Packaging Entry = One Lot**
   - Create a new packaging entry for each new lot, even if details are identical
   - This maintains lot-level tracking

2. **Initial Packets = SET, Not ADD**
   - `initial_packets` sets the stock value
   - If inventory already exists, it replaces the existing quantity
   - Use `POST /packaging/:id/inventory` to add more packets later

3. **Ordered Weight is Static**
   - Represents the original order quantity
   - Does not change with inventory operations
   - Used for procurement tracking

4. **Vendor is Optional**
   - Can create packaging without assigning a vendor
   - Vendor can be assigned later via update

5. **Multiple Lots Allowed**
   - System allows multiple packaging entries with same `product_id`, `holding_capacity`, `packet_type`
   - Each lot tracked separately with unique ID

---

## Summary

The packaging creation API allows you to:
- Create packaging entries for products
- Optionally assign vendors
- Set initial ordered weight
- **Set initial packets stock** (new feature)
- Track multiple lots independently

Use this API to create new packaging lots as they arrive, maintaining proper inventory tracking and audit trails.

