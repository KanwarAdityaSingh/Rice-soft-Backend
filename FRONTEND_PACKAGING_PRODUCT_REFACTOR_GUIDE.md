# Frontend Integration Guide: Packaging Product Relationship Refactor

## Overview

The packaging system has been refactored to be product-specific with fixed weight enum values (10kg, 25kg, 50kg). When a product is created, packaging entries are automatically created. Batches can now produce multiple package sizes in a single batch.

## Key Changes

1. **Packaging is now product-specific**: Each packaging entry belongs to a specific product
2. **Fixed weight enum**: Packaging weights are now restricted to 10kg, 25kg, or 50kg
3. **Auto-creation**: Creating a product automatically creates 3 packaging entries (10kg, 25kg, 50kg)
4. **Multiple packaging per batch**: A single batch can produce multiple package sizes

---

## API Changes

### 1. Product Creation API

**Endpoint**: `POST /api/v1/products`

**Changes**:
- `packet_type` is now **required** (was optional)
- Response remains the same, but packaging entries are automatically created

**Request Body**:
```json
{
  "name": "Premium Basmati Rice",
  "description": "High quality basmati rice",
  "brand": "Tamara",
  "packet_type": "PP Bag"  // REQUIRED - used for all auto-created packaging entries
}
```

**Response**: Same as before
```json
{
  "success": true,
  "message": "Product created successfully with packaging entries (10kg, 25kg, 50kg)",
  "data": {
    "id": "uuid",
    "name": "Premium Basmati Rice",
    "description": "High quality basmati rice",
    "brand": "Tamara",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Frontend Logic**:
- When creating a product, ensure `packet_type` field is included and required in the form
- After product creation, you can fetch packaging entries using the product ID
- No need to manually create packaging entries anymore

---

### 2. Packaging API

**Endpoint**: `GET /api/v1/packaging`

**Changes**:
- Now supports optional `product_id` query parameter for filtering
- Response includes `product_id` field

**Request**:
```
GET /api/v1/packaging
GET /api/v1/packaging?product_id={productId}  // Filter by product
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "product_id": "uuid",  // NEW FIELD
      "holding_capacity": 10,  // Now always 10, 25, or 50
      "packet_type": "PP Bag",
      "source": null,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Frontend Logic**:
- When displaying packaging for a product, filter by `product_id`
- Use `GET /api/v1/packaging?product_id={productId}` to get all packaging for a specific product
- `holding_capacity` will always be 10, 25, or 50 (enum values)

---

**Endpoint**: `POST /api/v1/packaging`

**Changes**:
- `product_id` is now **required**
- `holding_capacity` must be exactly 10, 25, or 50 (enum validation)

**Request Body**:
```json
{
  "product_id": "uuid",  // REQUIRED
  "holding_capacity": 25,  // Must be 10, 25, or 50
  "packet_type": "PP Bag",
  "source": "optional source"
}
```

**Frontend Logic**:
- If you need to manually create packaging (rare case), ensure `product_id` is included
- Validate `holding_capacity` is one of: 10, 25, 50
- Note: Usually packaging is auto-created when product is created, so manual creation may not be needed

---

### 3. Batch Creation API

**Endpoint**: `POST /api/v1/batches`

**Changes**:
- New structure: Accepts `packaging_quantities` array
- Backward compatible: Still accepts old `packaging_id` + `quantity` format

**New Request Body (Recommended)**:
```json
{
  "product_id": "uuid",
  "recipe_id": "uuid",
  "packaging_quantities": [  // NEW: Array of packaging quantities
    {
      "weight": 10,  // Must be 10, 25, or 50
      "quantity": 100  // Quantity in kg for this packaging size
    },
    {
      "weight": 25,
      "quantity": 200
    },
    {
      "weight": 50,
      "quantity": 150
    }
  ],
  "status": "planned"  // Optional
}
```

**Old Request Body (Still Supported)**:
```json
{
  "product_id": "uuid",
  "recipe_id": "uuid",
  "packaging_id": "uuid",  // Single packaging
  "quantity": 1000,  // Total quantity in kg
  "status": "planned"
}
```

**Response**: Same structure as before
```json
{
  "success": true,
  "message": "Batch created successfully",
  "data": {
    "id": "uuid",
    "batch_number": "BATCH-20240101-abc123",
    "product_id": "uuid",
    "recipe_id": "uuid",
    "packaging_id": "uuid",  // Primary packaging (first in array or single)
    "quantity": 450,  // Total quantity across all packaging sizes
    "status": "planned",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Frontend Logic**:
- **New Flow (Recommended)**:
  1. User selects a product
  2. Fetch packaging entries for that product: `GET /api/v1/packaging?product_id={productId}`
  3. Display available packaging weights (10kg, 25kg, 50kg) for the product
  4. User can input quantity for each packaging size they want to produce
  5. Build `packaging_quantities` array with selected weights and quantities
  6. Submit batch creation with the array

- **UI Structure**:
  ```
  Product: [Dropdown]
  Recipe: [Dropdown]
  
  Packaging Quantities:
  - [ ] 10kg: [Input] kg
  - [ ] 25kg: [Input] kg
  - [ ] 50kg: [Input] kg
  
  Total Quantity: [Calculated] kg
  ```

- **Validation**:
  - At least one packaging quantity must be provided
  - Each quantity must be > 0
  - Weight must be 10, 25, or 50
  - Total quantity is sum of all packaging quantities

- **Calculations**:
  - Total quantity = sum of all `packaging_quantities[].quantity`
  - Packets needed per size = `ceil(quantity / weight)`
  - Display total packets needed across all sizes

---

## Frontend Implementation Guide

### 1. Product Creation Form

**Required Fields**:
- `name` (string, required)
- `packet_type` (string, required) - NEW REQUIRED FIELD
- `description` (string, optional)
- `brand` (enum: "Tamara" | "Hariom", optional)

**Form Validation**:
```javascript
// Ensure packet_type is provided
if (!formData.packet_type) {
  errors.packet_type = "Packet type is required";
}
```

**After Creation**:
- Product is created
- 3 packaging entries (10kg, 25kg, 50kg) are automatically created
- You can fetch them: `GET /api/v1/packaging?product_id={productId}`

---

### 2. Packaging Display

**Fetching Packaging for a Product**:
```javascript
// Get all packaging for a product
const response = await fetch(`/api/v1/packaging?product_id=${productId}`);
const { data: packagingList } = await response.json();

// packagingList will contain 3 entries (10kg, 25kg, 50kg) for the product
```

**Display Logic**:
- Group packaging by product
- Show weight (10kg, 25kg, 50kg) and packet type
- Display available quantity from packets_inventory

---

### 3. Batch Creation Form

**New Form Structure**:

```javascript
// Form state
const [batchForm, setBatchForm] = useState({
  product_id: '',
  recipe_id: '',
  packaging_quantities: [
    { weight: 10, quantity: 0, enabled: false },
    { weight: 25, quantity: 0, enabled: false },
    { weight: 50, quantity: 0, enabled: false }
  ],
  status: 'planned'
});

// Calculate total quantity
const totalQuantity = batchForm.packaging_quantities
  .filter(pq => pq.enabled && pq.quantity > 0)
  .reduce((sum, pq) => sum + pq.quantity, 0);

// Submit handler
const handleSubmit = async () => {
  // Filter out disabled or zero quantities
  const packagingQuantities = batchForm.packaging_quantities
    .filter(pq => pq.enabled && pq.quantity > 0)
    .map(pq => ({ weight: pq.weight, quantity: pq.quantity }));

  if (packagingQuantities.length === 0) {
    // Show error: At least one packaging quantity required
    return;
  }

  const payload = {
    product_id: batchForm.product_id,
    recipe_id: batchForm.recipe_id,
    packaging_quantities: packagingQuantities,
    status: batchForm.status
  };

  // Submit to API
  await createBatch(payload);
};
```

**UI Components**:
- Product selector (dropdown)
- Recipe selector (dropdown, filtered by product)
- Packaging quantities section:
  - Checkbox + weight label (10kg, 25kg, 50kg)
  - Quantity input (kg)
  - Calculated packets display
- Total quantity display (calculated)
- Status selector

**Validation**:
```javascript
// Validate packaging quantities
const validateBatchForm = (form) => {
  const errors = {};

  if (!form.product_id) {
    errors.product_id = "Product is required";
  }

  if (!form.recipe_id) {
    errors.recipe_id = "Recipe is required";
  }

  const enabledQuantities = form.packaging_quantities.filter(
    pq => pq.enabled && pq.quantity > 0
  );

  if (enabledQuantities.length === 0) {
    errors.packaging_quantities = "At least one packaging quantity is required";
  }

  // Validate each enabled quantity
  enabledQuantities.forEach((pq, index) => {
    if (pq.quantity <= 0) {
      errors[`packaging_quantities.${index}.quantity`] = "Quantity must be greater than 0";
    }
    if (![10, 25, 50].includes(pq.weight)) {
      errors[`packaging_quantities.${index}.weight`] = "Weight must be 10, 25, or 50";
    }
  });

  return errors;
};
```

---

### 4. Fetching Product Packaging

**Helper Function**:
```javascript
// Fetch packaging for a product
const fetchProductPackaging = async (productId) => {
  const response = await fetch(`/api/v1/packaging?product_id=${productId}`);
  const { data } = await response.json();
  
  // Should return 3 entries: 10kg, 25kg, 50kg
  // Sort by weight for consistent display
  return data.sort((a, b) => a.holding_capacity - b.holding_capacity);
};

// Usage in batch form
useEffect(() => {
  if (selectedProductId) {
    fetchProductPackaging(selectedProductId).then(packaging => {
      // Update form with available packaging weights
      setBatchForm(prev => ({
        ...prev,
        packaging_quantities: [10, 25, 50].map(weight => ({
          weight,
          quantity: 0,
          enabled: false,
          packaging: packaging.find(p => p.holding_capacity === weight)
        }))
      }));
    });
  }
}, [selectedProductId]);
```

---

### 5. Displaying Finished Goods Inventory

**Changes**:
- A single batch can now have multiple finished goods entries (one per packaging size)
- When fetching finished goods by batch, you'll get multiple entries

**Fetching Finished Goods**:
```javascript
// Get finished goods for a batch
const response = await fetch(`/api/v1/inventory/finished-goods?batch_id=${batchId}`);
const { data: finishedGoods } = await response.json();

// finishedGoods is an array - one entry per packaging size produced
// Example:
// [
//   { packaging_id: "uuid1", no_of_packets: 10, total_weight: 100, ... }, // 10kg
//   { packaging_id: "uuid2", no_of_packets: 8, total_weight: 200, ... },  // 25kg
//   { packaging_id: "uuid3", no_of_packets: 3, total_weight: 150, ... }   // 50kg
// ]
```

**Display Logic**:
- Group by batch
- Show breakdown by packaging size
- Display total packets and weight per size
- Calculate grand totals

---

## Migration Notes

### Existing Products
- Existing products will have their packaging assigned to a "Legacy Product"
- You may want to reassign packaging to correct products if needed

### Existing Batches
- Existing batches continue to work with single packaging
- New batches can use multiple packaging sizes

### Backward Compatibility
- Old batch creation format (`packaging_id` + `quantity`) still works
- New format (`packaging_quantities` array) is recommended

---

## Example Flows

### Flow 1: Create Product and View Packaging

```javascript
// 1. Create product
const product = await createProduct({
  name: "Premium Rice",
  packet_type: "PP Bag"
});

// 2. Fetch auto-created packaging
const packaging = await fetch(`/api/v1/packaging?product_id=${product.id}`);
// Returns: [10kg, 25kg, 50kg packaging entries]
```

### Flow 2: Create Batch with Multiple Packaging Sizes

```javascript
// 1. Select product and recipe
const productId = "uuid";
const recipeId = "uuid";

// 2. User selects packaging quantities
const packagingQuantities = [
  { weight: 10, quantity: 100 },  // 100 kg in 10kg bags
  { weight: 25, quantity: 200 }, // 200 kg in 25kg bags
  { weight: 50, quantity: 150 }  // 150 kg in 50kg bags
];

// 3. Create batch
const batch = await createBatch({
  product_id: productId,
  recipe_id: recipeId,
  packaging_quantities: packagingQuantities
});

// 4. Fetch finished goods (will have 3 entries)
const finishedGoods = await fetch(`/api/v1/inventory/finished-goods?batch_id=${batch.id}`);
// Returns 3 entries, one for each packaging size
```

---

## Summary of Frontend Changes Required

1. **Product Creation Form**:
   - Add required `packet_type` field
   - Update validation

2. **Packaging Display**:
   - Filter by `product_id` when displaying packaging
   - Handle `product_id` in response

3. **Batch Creation Form**:
   - Add `packaging_quantities` array input
   - Allow multiple packaging sizes per batch
   - Calculate total quantity
   - Update validation logic

4. **Finished Goods Display**:
   - Handle multiple entries per batch
   - Group and display by packaging size

5. **API Calls**:
   - Update product creation to include `packet_type`
   - Update batch creation to use `packaging_quantities` array
   - Add `product_id` filter to packaging queries

---

## Testing Checklist

- [ ] Create product with `packet_type` - verify 3 packaging entries are created
- [ ] Fetch packaging filtered by product_id
- [ ] Create batch with single packaging size (backward compatibility)
- [ ] Create batch with multiple packaging sizes (new flow)
- [ ] Verify finished goods inventory shows multiple entries per batch
- [ ] Validate weight enum (10, 25, 50) in forms
- [ ] Calculate total quantity correctly from packaging_quantities array
- [ ] Display packaging breakdown in batch details

