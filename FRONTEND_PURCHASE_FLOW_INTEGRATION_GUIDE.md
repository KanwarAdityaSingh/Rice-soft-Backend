# Frontend Integration Guide: New Purchase Flow

## Table of Contents
1. [Overview](#overview)
2. [New Flow Architecture](#new-flow-architecture)
3. [Key Changes from Old Flow](#key-changes-from-old-flow)
4. [API Endpoints Reference](#api-endpoints-reference)
5. [Implementation Guide](#implementation-guide)
6. [Code Examples](#code-examples)
7. [Best Practices](#best-practices)

---

## Overview

The new purchase flow allows **independent creation** of entities and **flexible aggregation** at the Purchase level. This enables:

- ✅ Create Saudas independently (no purchase required)
- ✅ Create Inward Slip Passes independently (linked to Sauda)
- ✅ Create Lots independently (linked directly to Sauda, NOT to ISP)
- ✅ Create Purchase that aggregates from multiple Saudas, ISPs, and Lots
- ✅ Link/unlink entities to purchases dynamically
- ✅ Automatic calculation of totals from linked lots

---

## New Flow Architecture

### Entity Relationships

```
┌─────────┐
│  Sauda  │ (Independent - can exist without Purchase)
└────┬────┘
     │
     ├───→ ┌──────────────────┐
     │     │ Inward Slip Pass │ (Independent - linked to Sauda)
     │     └──────────────────┘
     │
     └───→ ┌─────┐
           │ Lot │ (Independent - linked directly to Sauda)
           └──┬──┘
              │
              │
              ▼
        ┌──────────┐
        │ Purchase │ (Aggregates from multiple entities via junction tables)
        └────┬─────┘
             │
             ▼
     ┌───────────────┐
     │ Payment Advice│ (Linked to Purchase)
     └───────────────┘
```

### Junction Tables (Many-to-Many)

Purchases link to entities through junction tables:

- `purchase_saudas` - Links Purchase ↔ Saudas
- `purchase_inward_slip_passes` - Links Purchase ↔ ISPs
- `purchase_lots` - Links Purchase ↔ Lots

**Example:**
- Purchase-1 can link to: [Sauda-1, Sauda-2] + [ISP-1, ISP-2] + [Lot-1, Lot-2, Lot-3]
- All calculations aggregate from linked lots

---

## Key Changes from Old Flow

| Aspect | Old Flow | New Flow |
|--------|----------|----------|
| **Sauda** | Required for Purchase | Independent, optional for Purchase |
| **ISP** | Required for Purchase | Independent, optional for Purchase |
| **Lot** | Linked to ISP | Linked directly to Sauda |
| **Purchase** | Links to ONE Sauda | Links to MULTIPLE Saudas/ISPs/Lots |
| **Calculations** | From single Sauda | From all linked Lots |
| **Accounting** | From Sauda | Purchase-level overrides (cash_discount, transportation_cost) |

---

## API Endpoints Reference

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication
All endpoints require JWT token in header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 1. SAUDA APIs

### 1.1 Get All Saudas
```http
GET /api/v1/saudas
Query Parameters:
  - include_inactive: boolean (optional)
  - status: 'draft' | 'active' | 'completed' | 'cancelled' (optional)
  - sauda_type: 'exgodown' | 'for' (optional)
  - purchaser_id: UUID (optional)
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "sauda_type": "exgodown",
      "rice_quality": "Premium Basmati",
      "rate": 85.50,
      "broker_id": "uuid",
      "broker_commission": 2.5,
      "transporter_id": "uuid",
      "transportation_cost": 5000.00,
      "cash_discount": 1000.00,
      "purchaser_id": "uuid",
      "status": "active",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### 1.2 Get Sauda by ID
```http
GET /api/v1/saudas/:id
```

### 1.3 Create Sauda
```http
POST /api/v1/saudas
Content-Type: application/json

{
  "sauda_type": "exgodown",              // Required: "exgodown" | "for"
  "rice_quality": "Premium Basmati",    // Required
  "rate": 85.50,                        // Required
  "purchaser_id": "vendor-uuid",        // Required (vendor ID)
  "broker_id": "uuid",                  // Optional
  "broker_commission": 2.5,             // Optional (percentage)
  "transporter_id": "uuid",             // Optional
  "transportation_cost": 5000.00,       // Optional (only for exgodown)
  "cash_discount": 1000.00,             // Optional (fixed amount)
  "quantity": 1000,                     // Optional
  "status": "active"                    // Optional: "draft" | "active" | "completed" | "cancelled"
}
```

### 1.4 Update Sauda
```http
PUT /api/v1/saudas/:id
Content-Type: application/json

{
  "rate": 90.00,
  "broker_commission": 3.0,
  "status": "completed"
  // All fields optional
}
```

### 1.5 Update Sauda Status
```http
PATCH /api/v1/saudas/:id/status
Content-Type: application/json

{
  "status": "completed"
}
```

### 1.6 Delete Sauda
```http
DELETE /api/v1/saudas/:id
```

---

## 2. INWARD SLIP PASS APIs

### 2.1 Get All Inward Slip Passes
```http
GET /api/v1/inward-slip-passes
Query Parameters:
  - sauda_id: UUID (optional filter)
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "sauda_id": "uuid",
      "slip_number": "ISP-001",
      "date": "2024-01-15",
      "vehicle_number": "MH01AB1234",
      "party_name": "Test Party",
      "party_address": "Address",
      "party_gst_number": "27ABCDE1234F1Z5",
      "status": "pending",
      "inward_slip_bill_image_url": "https://...",
      "transportation_bill_image_url": "https://...",
      "bill_pdf_url": "https://...",
      "bilti_image_url": "https://...",
      "bilti_pdf_url": "https://...",
      "eway_bill_number": "EW123456",
      "eway_bill_url": "https://...",
      "notes": "Notes",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### 2.2 Get Inward Slip Pass by ID
```http
GET /api/v1/inward-slip-passes/:id
```

### 2.3 Create Inward Slip Pass
```http
POST /api/v1/inward-slip-passes
Content-Type: application/json

{
  "sauda_id": "uuid",                   // Required
  "slip_number": "ISP-001",             // Required
  "date": "2024-01-15",                 // Required (ISO date)
  "vehicle_number": "MH01AB1234",       // Required
  "party_name": "Test Party",           // Required
  "party_address": "Address",           // Optional
  "party_gst_number": "27ABCDE1234F1Z5", // Optional
  "status": "pending"                   // Optional: "pending" | "completed"
}
```

**Note:** Lots are NO LONGER created with ISP. Create them separately using Lot APIs.

### 2.4 Update Inward Slip Pass
```http
PUT /api/v1/inward-slip-passes/:id
Content-Type: application/json

{
  "slip_number": "ISP-001-UPDATED",
  "status": "completed"
  // All fields optional (except sauda_id cannot be changed)
}
```

### 2.5 Update Inward Slip Pass Status
```http
PATCH /api/v1/inward-slip-passes/:id/status
Content-Type: application/json

{
  "status": "completed"
}
```

### 2.6 Upload Documents
```http
POST /api/v1/inward-slip-passes/:id/upload-bill-image
POST /api/v1/inward-slip-passes/:id/upload-transportation-bill
POST /api/v1/inward-slip-passes/:id/upload-purchase-bill
POST /api/v1/inward-slip-passes/:id/upload-bilti
POST /api/v1/inward-slip-passes/:id/upload-eway-bill

Content-Type: multipart/form-data
Body: file (image or PDF, max 10MB)
```

### 2.7 Delete Inward Slip Pass
```http
DELETE /api/v1/inward-slip-passes/:id
```

---

## 3. LOT APIs (NEW - Standalone)

### 3.1 Get All Lots
```http
GET /api/v1/lots
Query Parameters:
  - sauda_id: UUID (optional filter)
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "sauda_id": "uuid",              // Linked to Sauda (NOT ISP)
      "lot_number": "LOT-001",
      "item_name": "Premium Basmati Rice",
      "no_of_bags": 50,
      "bag_weight": 50.00,
      "total_weight": 2500.00,
      "bill_weight": 2500.00,
      "received_weight": 2480.00,
      "bardana": "Standard",
      "rate": 85.50,
      "amount": 212040.00,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### 3.2 Get Lot by ID
```http
GET /api/v1/lots/:id
```

### 3.3 Create Lot
```http
POST /api/v1/lots
Content-Type: application/json

{
  "sauda_id": "uuid",                   // Required (NOT inward_slip_pass_id)
  "lot_number": "LOT-001",              // Required
  "item_name": "Premium Basmati Rice",  // Required
  "no_of_bags": 50,                     // Required
  "bill_weight": 2500.00,               // Required
  "received_weight": 2480.00,            // Required
  "rate": 85.50,                        // Required
  "bag_weight": 50.00,                  // Optional
  "bardana": "Standard"                 // Optional
}
```

**Important:** 
- `sauda_id` is required (NOT `inward_slip_pass_id`)
- Lots are independent of ISPs
- Amount is calculated automatically: `received_weight × rate`

### 3.4 Update Lot
```http
PUT /api/v1/lots/:id
Content-Type: application/json

{
  "received_weight": 2490.00,
  "rate": 86.00
  // All fields optional
}
```

### 3.5 Delete Lot
```http
DELETE /api/v1/lots/:id
```

---

## 4. PURCHASE APIs

### 4.1 Get All Purchases
```http
GET /api/v1/purchases
Query Parameters:
  - vendor_id: UUID (optional filter)
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "vendor_id": "uuid",
      "broker_id": "uuid",
      "broker_commission": 2.0,
      "payment_advice_id": "uuid",
      "cash_discount": 1500.00,         // Purchase-level override
      "transportation_cost": 5000.00,    // Purchase-level override
      "invoice_number": "INV-001",
      "invoice_date": "2024-01-20",
      "rate": 80.00,
      "total_weight": 5950.00,           // Calculated from linked lots
      "total_amount": 526221.89,         // Calculated from linked lots
      "igst_amount": 25058.19,
      "igst_percentage": 5.0,
      "purchase_date": "2024-01-20",
      "created_at": "2024-01-20T10:00:00Z"
    }
  ]
}
```

### 4.2 Get Purchase by ID
```http
GET /api/v1/purchases/:id
```

### 4.3 Create Purchase
```http
POST /api/v1/purchases
Content-Type: application/json

{
  "vendor_id": "uuid",                  // Required
  "purchase_date": "2024-01-20",        // Required (ISO date)
  
  // Entity Linking (all optional, can link later)
  "sauda_ids": ["uuid1", "uuid2"],     // Optional: Array of sauda IDs
  "inward_slip_pass_ids": ["uuid1"],   // Optional: Array of ISP IDs
  "lot_ids": ["uuid1", "uuid2"],       // Optional: Array of lot IDs
  
  // Accounting Fields (Purchase-level overrides)
  "broker_id": "uuid",                  // Optional
  "broker_commission": 2.0,             // Optional (percentage)
  "cash_discount": 1500.00,             // Optional (fixed amount)
  "transportation_cost": 5000.00,       // Optional (fixed amount)
  
  // Other Fields
  "rate": 80.00,                        // Optional (auto-filled from first sauda if not provided)
  "igst_percentage": 5.0,               // Optional
  "invoice_number": "INV-001",          // Optional
  "invoice_date": "2024-01-20",        // Optional
  "truck_number": "MH01AB1234",        // Optional
  "transport_name": "Transport Co",     // Optional
  "notes": "Notes"                      // Optional
}
```

**Important Notes:**
- You can create a purchase with NO linked entities initially
- If `lot_ids` are provided, totals are automatically calculated
- `cash_discount` and `transportation_cost` are Purchase-level overrides (not from Sauda)
- If `rate` not provided, it uses the first sauda's rate (if saudas linked)

**Response:**
```json
{
  "success": true,
  "message": "Purchase created successfully",
  "data": {
    "id": "uuid",
    "vendor_id": "uuid",
    "total_weight": 5950.00,      // Calculated if lots linked
    "total_amount": 526221.89,     // Calculated if lots linked
    "igst_amount": 25058.19,       // Calculated if lots linked
    // ... other fields
  }
}
```

### 4.4 Update Purchase
```http
PUT /api/v1/purchases/:id
Content-Type: application/json

{
  "cash_discount": 2000.00,
  "transportation_cost": 6000.00,
  "igst_percentage": 6.0,
  "invoice_number": "INV-002"
  // All fields optional
}
```

**Note:** To recalculate totals after updating accounting fields, call `/recalculate-totals` endpoint.

### 4.5 Delete Purchase
```http
DELETE /api/v1/purchases/:id
```

### 4.6 Link Entities to Purchase

#### Link Saudas
```http
POST /api/v1/purchases/:id/link-saudas
Content-Type: application/json

{
  "sauda_ids": ["uuid1", "uuid2"]
}
```

#### Link Inward Slip Passes
```http
POST /api/v1/purchases/:id/link-inward-slip-passes
Content-Type: application/json

{
  "inward_slip_pass_ids": ["uuid1", "uuid2"]
}
```

#### Link Lots
```http
POST /api/v1/purchases/:id/link-lots
Content-Type: application/json

{
  "lot_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Lots linked successfully and totals recalculated",
  "data": {
    "linked_count": 3
  }
}
```

**Note:** When linking lots, totals are automatically recalculated.

### 4.7 Unlink Entities from Purchase

#### Unlink Sauda
```http
DELETE /api/v1/purchases/:id/unlink-sauda/:saudaId
```

#### Unlink Inward Slip Pass
```http
DELETE /api/v1/purchases/:id/unlink-inward-slip-pass/:ispId
```

#### Unlink Lot
```http
DELETE /api/v1/purchases/:id/unlink-lot/:lotId
```

**Note:** When unlinking lots, totals are automatically recalculated.

### 4.8 Get Linked Entities
```http
GET /api/v1/purchases/:id/linked-entities
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sauda_ids": ["uuid1", "uuid2"],
    "inward_slip_pass_ids": ["uuid1"],
    "lot_ids": ["uuid1", "uuid2", "uuid3"]
  }
}
```

### 4.9 Recalculate Totals
```http
POST /api/v1/purchases/:id/recalculate-totals
```

**Use Cases:**
- After updating `cash_discount`, `transportation_cost`, or `igst_percentage`
- After linking/unlinking lots
- After updating lot amounts

**Response:**
```json
{
  "success": true,
  "message": "Purchase totals recalculated successfully",
  "data": {
    "id": "uuid",
    "total_weight": 5950.00,
    "total_amount": 526221.89,
    "igst_amount": 25058.19,
    // ... other fields
  }
}
```

---

## 5. PAYMENT ADVICE APIs

### 5.1 Get All Payment Advices
```http
GET /api/v1/payment-advices
Query Parameters:
  - purchase_id: UUID (optional filter)
  - status: 'pending' | 'completed' | 'failed' (optional)
```

### 5.2 Get Payment Advice by ID
```http
GET /api/v1/payment-advices/:id
```

**Response includes charges:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "purchase_id": "uuid",
    "payer_id": "uuid",
    "recipient_id": "uuid",
    "amount": 526221.89,
    "net_payable": 523721.89,      // amount - charges
    "date_of_payment": "2024-01-25",
    "status": "pending",
    "charges": [
      {
        "id": "uuid",
        "charge_name": "Bank Charges",
        "charge_value": 500.00,
        "charge_type": "fixed"
      },
      {
        "id": "uuid",
        "charge_name": "Processing Fee",
        "charge_value": 2.5,
        "charge_type": "percentage"
      }
    ]
  }
}
```

### 5.3 Create Payment Advice
```http
POST /api/v1/payment-advices
Content-Type: application/json

{
  "purchase_id": "uuid",            // Optional (links to purchase)
  "payer_id": "user-uuid",          // Required (user ID)
  "recipient_id": "vendor-uuid",    // Required (vendor ID)
  "amount": 526221.89,              // Required
  "date_of_payment": "2024-01-25",  // Required (ISO date)
  "status": "pending",              // Optional: "pending" | "completed" | "failed"
  
  // Charges (optional)
  "charges": [
    {
      "charge_name": "Bank Charges",
      "charge_value": 500.00,
      "charge_type": "fixed"        // "fixed" | "percentage"
    },
    {
      "charge_name": "Processing Fee",
      "charge_value": 2.5,
      "charge_type": "percentage"
    }
  ]
}
```

**Important:**
- If `purchase_id` is provided, the purchase's `payment_advice_id` is automatically set
- `net_payable` is calculated automatically: `amount - sum of charges`
- For percentage charges: `charge_value` is the percentage (e.g., 2.5 = 2.5%)

### 5.4 Update Payment Advice
```http
PUT /api/v1/payment-advices/:id
Content-Type: application/json

{
  "transaction_id": "TXN123456",
  "status": "completed"
  // All fields optional
}
```

### 5.5 Upload Payment Slip
```http
POST /api/v1/payment-advices/:id/upload-slip
Content-Type: multipart/form-data
Body: file (image or PDF, max 10MB)
```

### 5.6 Add Charge
```http
POST /api/v1/payment-advices/:id/charges
Content-Type: application/json

{
  "charge_name": "Bank Charges",
  "charge_value": 500.00,
  "charge_type": "fixed"
}
```

### 5.7 Remove Charge
```http
DELETE /api/v1/payment-advices/:id/charges/:chargeId
```

### 5.8 Get Net Payable
```http
GET /api/v1/payment-advices/:id/net-payable
```

**Response:**
```json
{
  "success": true,
  "data": {
    "net_payable": 523721.89
  }
}
```

### 5.9 Delete Payment Advice
```http
DELETE /api/v1/payment-advices/:id
```

---

## Implementation Guide

### Step 1: Create Independent Entities

Entities can be created in any order, independently:

#### Create Sauda
```javascript
const saudaResponse = await fetch('/api/v1/saudas', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sauda_type: 'exgodown',
    rice_quality: 'Premium Basmati',
    rate: 85.50,
    purchaser_id: vendorId,
    broker_id: brokerId,
    broker_commission: 2.5,
    transportation_cost: 5000.00,
    cash_discount: 1000.00,
    status: 'active'
  })
});

const sauda = await saudaResponse.json();
const saudaId = sauda.data.id;
```

#### Create Inward Slip Pass (Optional)
```javascript
const ispResponse = await fetch('/api/v1/inward-slip-passes', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sauda_id: saudaId,
    slip_number: 'ISP-001',
    date: '2024-01-15',
    vehicle_number: 'MH01AB1234',
    party_name: 'Test Party',
    status: 'pending'
  })
});

const isp = await ispResponse.json();
const ispId = isp.data.id;
```

#### Create Lot (Optional)
```javascript
const lotResponse = await fetch('/api/v1/lots', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sauda_id: saudaId,        // Note: sauda_id, NOT isp_id
    lot_number: 'LOT-001',
    item_name: 'Premium Basmati Rice',
    no_of_bags: 50,
    bill_weight: 2500.00,
    received_weight: 2480.00,
    rate: 85.50
  })
});

const lot = await lotResponse.json();
const lotId = lot.data.id;
```

### Step 2: Create Purchase with Linked Entities

You can create a purchase and link entities in one request:

```javascript
const purchaseResponse = await fetch('/api/v1/purchases', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    vendor_id: vendorId,
    purchase_date: '2024-01-20',
    
    // Link entities (all optional)
    sauda_ids: [saudaId1, saudaId2],
    inward_slip_pass_ids: [ispId1, ispId2],
    lot_ids: [lotId1, lotId2, lotId3],
    
    // Purchase-level accounting overrides
    cash_discount: 1500.00,
    transportation_cost: 5000.00,
    broker_commission: 2.0,
    igst_percentage: 5.0
  })
});

const purchase = await purchaseResponse.json();
const purchaseId = purchase.data.id;

// If lots were linked, totals are automatically calculated
console.log('Total Amount:', purchase.data.total_amount);
console.log('Total Weight:', purchase.data.total_weight);
```

### Step 3: Link Entities Later (Alternative)

You can also create a purchase first, then link entities:

```javascript
// Create purchase without entities
const purchaseResponse = await fetch('/api/v1/purchases', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    vendor_id: vendorId,
    purchase_date: '2024-01-20'
  })
});

const purchase = await purchaseResponse.json();
const purchaseId = purchase.data.id;

// Link lots later
await fetch(`/api/v1/purchases/${purchaseId}/link-lots`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    lot_ids: [lotId1, lotId2, lotId3]
  })
});

// Totals are automatically recalculated after linking lots
```

### Step 4: Get Linked Entities

To see what's linked to a purchase:

```javascript
const linkedResponse = await fetch(`/api/v1/purchases/${purchaseId}/linked-entities`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const linked = await linkedResponse.json();
console.log('Linked Saudas:', linked.data.sauda_ids);
console.log('Linked ISPs:', linked.data.inward_slip_pass_ids);
console.log('Linked Lots:', linked.data.lot_ids);
```

### Step 5: Update Accounting and Recalculate

```javascript
// Update accounting fields
await fetch(`/api/v1/purchases/${purchaseId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    cash_discount: 2000.00,
    transportation_cost: 6000.00,
    igst_percentage: 6.0
  })
});

// Recalculate totals
const recalcResponse = await fetch(`/api/v1/purchases/${purchaseId}/recalculate-totals`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const updated = await recalcResponse.json();
console.log('New Total:', updated.data.total_amount);
```

### Step 6: Create Payment Advice

```javascript
const paymentAdviceResponse = await fetch('/api/v1/payment-advices', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    purchase_id: purchaseId,
    payer_id: userId,
    recipient_id: vendorId,
    amount: purchase.data.total_amount,  // Use purchase total
    date_of_payment: '2024-01-25',
    status: 'pending',
    charges: [
      {
        charge_name: 'Bank Charges',
        charge_value: 500.00,
        charge_type: 'fixed'
      },
      {
        charge_name: 'Processing Fee',
        charge_value: 2.5,
        charge_type: 'percentage'
      }
    ]
  })
});

const paymentAdvice = await paymentAdviceResponse.json();
console.log('Net Payable:', paymentAdvice.data.net_payable);
```

---

## Code Examples

### Example 1: Complete Flow Implementation

```javascript
// Complete purchase flow implementation
async function createCompletePurchaseFlow(vendorId, userId) {
  const token = getAuthToken();
  
  // Step 1: Create Sauda
  const sauda = await createSauda({
    sauda_type: 'exgodown',
    rice_quality: 'Premium Basmati',
    rate: 85.50,
    purchaser_id: vendorId,
    status: 'active'
  });
  
  // Step 2: Create ISP (optional)
  const isp = await createISP({
    sauda_id: sauda.id,
    slip_number: 'ISP-001',
    date: new Date().toISOString().split('T')[0],
    vehicle_number: 'MH01AB1234',
    party_name: 'Test Party'
  });
  
  // Step 3: Create Lots (optional, can create multiple)
  const lot1 = await createLot({
    sauda_id: sauda.id,
    lot_number: 'LOT-001',
    item_name: 'Premium Basmati Rice',
    no_of_bags: 50,
    bill_weight: 2500.00,
    received_weight: 2480.00,
    rate: 85.50
  });
  
  const lot2 = await createLot({
    sauda_id: sauda.id,
    lot_number: 'LOT-002',
    item_name: 'Premium Basmati Rice',
    no_of_bags: 30,
    bill_weight: 1500.00,
    received_weight: 1490.00,
    rate: 85.50
  });
  
  // Step 4: Create Purchase (aggregating all entities)
  const purchase = await createPurchase({
    vendor_id: vendorId,
    purchase_date: new Date().toISOString().split('T')[0],
    sauda_ids: [sauda.id],
    inward_slip_pass_ids: [isp.id],
    lot_ids: [lot1.id, lot2.id],
    cash_discount: 1500.00,
    transportation_cost: 5000.00,
    broker_commission: 2.0,
    igst_percentage: 5.0
  });
  
  // Step 5: Create Payment Advice
  const paymentAdvice = await createPaymentAdvice({
    purchase_id: purchase.id,
    payer_id: userId,
    recipient_id: vendorId,
    amount: purchase.total_amount,
    date_of_payment: new Date().toISOString().split('T')[0],
    charges: [
      { charge_name: 'Bank Charges', charge_value: 500.00, charge_type: 'fixed' }
    ]
  });
  
  return {
    sauda,
    isp,
    lots: [lot1, lot2],
    purchase,
    paymentAdvice
  };
}
```

### Example 2: React Component for Purchase Creation

```jsx
import React, { useState } from 'react';

function CreatePurchaseForm() {
  const [formData, setFormData] = useState({
    vendor_id: '',
    purchase_date: '',
    sauda_ids: [],
    inward_slip_pass_ids: [],
    lot_ids: [],
    cash_discount: '',
    transportation_cost: '',
    igst_percentage: ''
  });
  
  const [selectedSaudas, setSelectedSaudas] = useState([]);
  const [selectedISPs, setSelectedISPs] = useState([]);
  const [selectedLots, setSelectedLots] = useState([]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const payload = {
      vendor_id: formData.vendor_id,
      purchase_date: formData.purchase_date,
      sauda_ids: selectedSaudas.map(s => s.id),
      inward_slip_pass_ids: selectedISPs.map(isp => isp.id),
      lot_ids: selectedLots.map(lot => lot.id),
      cash_discount: formData.cash_discount ? parseFloat(formData.cash_discount) : undefined,
      transportation_cost: formData.transportation_cost ? parseFloat(formData.transportation_cost) : undefined,
      igst_percentage: formData.igst_percentage ? parseFloat(formData.igst_percentage) : undefined
    };
    
    try {
      const response = await fetch('/api/v1/purchases', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      if (result.success) {
        alert('Purchase created successfully!');
        console.log('Total Amount:', result.data.total_amount);
      }
    } catch (error) {
      console.error('Error creating purchase:', error);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <input
        type="date"
        value={formData.purchase_date}
        onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
        required
      />
      
      {/* Multi-select for Saudas */}
      <SaudaMultiSelect
        selected={selectedSaudas}
        onChange={setSelectedSaudas}
      />
      
      {/* Multi-select for ISPs */}
      <ISPMultiSelect
        selected={selectedISPs}
        onChange={setSelectedISPs}
      />
      
      {/* Multi-select for Lots */}
      <LotMultiSelect
        selected={selectedLots}
        onChange={setSelectedLots}
      />
      
      <button type="submit">Create Purchase</button>
    </form>
  );
}
```

### Example 3: Fetching Lots by Sauda

```javascript
// Get all lots for a specific sauda
async function getLotsBySauda(saudaId) {
  const response = await fetch(`/api/v1/lots?sauda_id=${saudaId}`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });
  
  const result = await response.json();
  return result.data; // Array of lots
}

// Usage
const lots = await getLotsBySauda(saudaId);
console.log(`Found ${lots.length} lots for sauda ${saudaId}`);
```

### Example 4: Linking/Unlinking Entities

```javascript
// Link additional lots to existing purchase
async function linkLotsToPurchase(purchaseId, lotIds) {
  const response = await fetch(`/api/v1/purchases/${purchaseId}/link-lots`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lot_ids: lotIds })
  });
  
  const result = await response.json();
  if (result.success) {
    // Totals are automatically recalculated
    console.log('Lots linked, totals recalculated');
  }
}

// Unlink a lot
async function unlinkLotFromPurchase(purchaseId, lotId) {
  const response = await fetch(`/api/v1/purchases/${purchaseId}/unlink-lot/${lotId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });
  
  const result = await response.json();
  if (result.success) {
    // Totals are automatically recalculated
    console.log('Lot unlinked, totals recalculated');
  }
}
```

---

## Calculation Logic

### Purchase Total Calculation (from Linked Lots)

When lots are linked to a purchase, totals are calculated as follows:

```
1. Base Amount = Sum of (received_weight × rate) from all linked lots
2. After Cash Discount = Base Amount - cash_discount (Purchase-level)
3. After Broker Commission = After Discount + (After Discount × broker_commission%)
4. After Transportation = After Commission + transportation_cost (Purchase-level)
5. IGST Amount = After Transportation × (igst_percentage / 100)
6. Final Total = After Transportation + IGST Amount
```

**Example:**
```
Linked Lots:
- Lot 1: 2480 kg × ₹85.50 = ₹212,040
- Lot 2: 1490 kg × ₹85.50 = ₹127,395
- Lot 3: 1980 kg × ₹75.00 = ₹148,500

Base Amount: ₹487,935
Cash Discount: ₹1,500
After Discount: ₹486,435
Broker Commission (2%): ₹9,728.70
After Commission: ₹496,163.70
Transportation: ₹5,000
After Transportation: ₹501,163.70
IGST (5%): ₹25,058.19
Final Total: ₹526,221.89
```

### Payment Advice Net Payable Calculation

```
Net Payable = Amount - Sum of Charges

Where charges are:
- Fixed charges: charge_value (direct subtraction)
- Percentage charges: (Amount × charge_value / 100)
```

**Example:**
```
Amount: ₹526,221.89
Charges:
- Bank Charges (fixed): ₹500.00
- Processing Fee (2.5%): ₹13,158.05

Net Payable = ₹526,221.89 - ₹500.00 - ₹13,158.05 = ₹512,563.84
```

---

## Best Practices

### 1. Entity Creation Order

**Recommended Flow:**
1. Create Sauda first (foundation)
2. Create ISP (optional, linked to Sauda)
3. Create Lots (optional, linked to Sauda)
4. Create Purchase (aggregates all)
5. Create Payment Advice (final step)

**Flexible Flow:**
- Entities can be created in any order
- Purchase can be created with or without entities
- Entities can be linked to purchase later

### 2. When to Link Entities

**During Purchase Creation:**
- Use when you know all entities upfront
- Simpler, single API call
- Automatic calculation if lots are included

**After Purchase Creation:**
- Use when entities are created incrementally
- Allows progressive building of purchase
- Each link operation recalculates totals

### 3. Handling Calculations

**Automatic Calculation:**
- Happens when lots are linked (during creation or after)
- Happens when lots are unlinked
- Use `/recalculate-totals` after updating accounting fields

**Manual Recalculation:**
```javascript
// After updating cash_discount, transportation_cost, or igst_percentage
await fetch(`/api/v1/purchases/${purchaseId}/recalculate-totals`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### 4. Error Handling

```javascript
async function createPurchaseWithErrorHandling(data) {
  try {
    const response = await fetch('/api/v1/purchases', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (!result.success) {
      // Handle validation errors
      if (result.error) {
        console.error('Error:', result.error);
        // Display to user
      }
      return null;
    }
    
    return result.data;
  } catch (error) {
    console.error('Network error:', error);
    return null;
  }
}
```

### 5. Loading States

```javascript
const [loading, setLoading] = useState(false);
const [purchase, setPurchase] = useState(null);

const handleCreatePurchase = async (data) => {
  setLoading(true);
  try {
    const result = await createPurchase(data);
    setPurchase(result);
  } finally {
    setLoading(false);
  }
};
```

### 6. Data Fetching Patterns

**Fetch All Entities for Selection:**
```javascript
// Fetch all saudas for dropdown
const saudas = await fetch('/api/v1/saudas?status=active').then(r => r.json());

// Fetch all ISPs for a sauda
const isps = await fetch(`/api/v1/inward-slip-passes?sauda_id=${saudaId}`).then(r => r.json());

// Fetch all lots for a sauda
const lots = await fetch(`/api/v1/lots?sauda_id=${saudaId}`).then(r => r.json());
```

**Fetch Linked Entities:**
```javascript
// Get what's linked to a purchase
const linked = await fetch(`/api/v1/purchases/${purchaseId}/linked-entities`).then(r => r.json());

// Then fetch full details
const saudaDetails = await Promise.all(
  linked.data.sauda_ids.map(id => 
    fetch(`/api/v1/saudas/${id}`).then(r => r.json())
  )
);
```

---

## UI/UX Recommendations

### 1. Purchase Creation Form

**Recommended Layout:**
```
┌─────────────────────────────────────┐
│ Create Purchase                     │
├─────────────────────────────────────┤
│ Basic Info:                         │
│ - Vendor (required)                 │
│ - Purchase Date (required)          │
│                                     │
│ Link Entities:                      │
│ - [ ] Select Saudas (multi-select) │
│ - [ ] Select ISPs (multi-select)   │
│ - [ ] Select Lots (multi-select)   │
│                                     │
│ Accounting Overrides:               │
│ - Cash Discount                     │
│ - Transportation Cost               │
│ - Broker Commission                 │
│ - IGST Percentage                   │
│                                     │
│ [Create Purchase]                   │
└─────────────────────────────────────┘
```

### 2. Entity Selection

**Multi-Select Component:**
- Show entity details (number, date, amount)
- Allow search/filter
- Show selected count
- Display total from selected lots (if applicable)

### 3. Purchase Details View

**Show:**
- Basic purchase info
- Linked entities (with links to view details)
- Calculated totals (with breakdown)
- Payment Advice link (if exists)
- Actions: Link/Unlink entities, Recalculate, Update

### 4. Calculation Display

**Show Breakdown:**
```
Base Amount (from lots):     ₹487,935.00
Cash Discount:              -₹  1,500.00
─────────────────────────────────────────
After Discount:              ₹486,435.00
Broker Commission (2%):      +₹  9,728.70
─────────────────────────────────────────
After Commission:            ₹496,163.70
Transportation Cost:        +₹  5,000.00
─────────────────────────────────────────
After Transportation:        ₹501,163.70
IGST (5%):                  +₹ 25,058.19
─────────────────────────────────────────
Final Total:                  ₹526,221.89
```

---

## Important Notes

### ⚠️ Breaking Changes from Old Flow

1. **Lots are now independent of ISPs**
   - Old: Lot required `inward_slip_pass_id`
   - New: Lot requires `sauda_id` (NOT `inward_slip_pass_id`)

2. **Purchase no longer has `sauda_id`**
   - Old: Purchase had direct `sauda_id` field
   - New: Purchase links to multiple saudas via junction table

3. **Lots removed from ISP creation**
   - Old: Could create lots when creating ISP
   - New: Create lots separately using `/api/v1/lots` endpoint

4. **Purchase calculations**
   - Old: Calculated from single sauda
   - New: Calculated from all linked lots

### ✅ New Features

1. **Independent entity creation** - No purchase required
2. **Multiple entity linking** - One purchase can aggregate from many sources
3. **Purchase-level accounting overrides** - `cash_discount` and `transportation_cost` at purchase level
4. **Dynamic linking/unlinking** - Add/remove entities after purchase creation
5. **Automatic recalculation** - Totals update when lots are linked/unlinked

### 📝 Field Notes

- **Dates**: Use ISO format `YYYY-MM-DD` (e.g., `"2024-01-20"`)
- **Amounts**: Numbers (not strings), can have decimals
- **Percentages**: Numbers (e.g., `2.5` means 2.5%)
- **UUIDs**: All IDs are UUIDs (strings)
- **Null vs Undefined**: Use `null` for optional fields that should be cleared, omit field for no change

---

## Testing Checklist

Before deploying to production, test:

- [ ] Create Sauda independently
- [ ] Create ISP independently (linked to Sauda)
- [ ] Create Lot independently (linked to Sauda)
- [ ] Create Purchase with no entities
- [ ] Create Purchase with saudas only
- [ ] Create Purchase with saudas + ISPs
- [ ] Create Purchase with lots (verify calculations)
- [ ] Link entities to existing purchase
- [ ] Unlink entities from purchase
- [ ] Update purchase accounting fields
- [ ] Recalculate totals
- [ ] Get linked entities
- [ ] Create Payment Advice linked to Purchase
- [ ] Verify bidirectional linking (Purchase ↔ Payment Advice)
- [ ] Verify net payable calculation with charges

---

## Support

For API issues or questions:
- Check API response error messages
- Verify request format matches examples
- Ensure authentication token is valid
- Check that required fields are provided

---

## Quick Reference

### Entity Creation Endpoints
- `POST /api/v1/saudas` - Create Sauda
- `POST /api/v1/inward-slip-passes` - Create ISP
- `POST /api/v1/lots` - Create Lot
- `POST /api/v1/purchases` - Create Purchase
- `POST /api/v1/payment-advices` - Create Payment Advice

### Linking Endpoints
- `POST /api/v1/purchases/:id/link-saudas`
- `POST /api/v1/purchases/:id/link-inward-slip-passes`
- `POST /api/v1/purchases/:id/link-lots`

### Unlinking Endpoints
- `DELETE /api/v1/purchases/:id/unlink-sauda/:saudaId`
- `DELETE /api/v1/purchases/:id/unlink-inward-slip-pass/:ispId`
- `DELETE /api/v1/purchases/:id/unlink-lot/:lotId`

### Query Endpoints
- `GET /api/v1/purchases/:id/linked-entities` - Get all linked entities
- `GET /api/v1/lots?sauda_id=:id` - Get lots by sauda
- `GET /api/v1/inward-slip-passes?sauda_id=:id` - Get ISPs by sauda

### Calculation Endpoints
- `POST /api/v1/purchases/:id/recalculate-totals` - Recalculate purchase totals
- `GET /api/v1/payment-advices/:id/net-payable` - Get net payable amount

---

**Document Version:** 1.0  
**Last Updated:** 2024-11-30  
**API Base URL:** `http://localhost:3000/api/v1`

