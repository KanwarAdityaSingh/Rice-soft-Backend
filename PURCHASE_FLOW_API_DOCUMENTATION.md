# Purchase Flow API Integration Guide

## Table of Contents
1. [Overview](#overview)
2. [Flow Diagram](#flow-diagram)
3. [Prerequisites](#prerequisites)
4. [Step-by-Step Integration](#step-by-step-integration)
5. [API Reference](#api-reference)
6. [Status Transitions](#status-transitions)
7. [Calculations](#calculations)
8. [Error Handling](#error-handling)

---

## Overview

The Purchase Flow is a comprehensive system for managing rice purchases from agreement (Sauda) to payment. The flow consists of the following entities:

1. **Transporter** - Transportation service provider
2. **Sauda** - Purchase agreement/contract
3. **Purchase** - Actual purchase transaction
4. **Inward Slip Pass** - Entry slip for received goods with lots
5. **Payment Advice** - Payment instructions with charges

### Flow Sequence

```
Transporter → Sauda → Purchase → Inward Slip Pass (with Lots) → Payment Advice (with Charges)
```

---

## Flow Diagram

```
┌─────────────┐
│ Transporter │ (Optional: Create if not exists)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    Sauda    │ (Agreement: xgodown or for)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Purchase   │ (Actual purchase transaction)
│             │ (Can be created first or after ISP)
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Inward Slip Pass    │ (Entry slip with multiple lots)
│   └─ Lots (1..n)    │ (Updates purchase amounts)
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Payment Advice     │ (Payment with charges)
│   └─ Charges (1..n) │
└─────────────────────┘
```

---

## Prerequisites

### Authentication
All API endpoints require authentication. First, obtain a JWT token:

```bash
POST /api/v1/auth/loginUser
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": "24h"
  }
}
```

Use this token in all subsequent requests:
```
Authorization: Bearer <token>
```

### Required Data
Before starting the purchase flow, ensure you have:
- **Vendor ID** (from vendors table)
- **Broker ID** (optional, from brokers table)
- **Rice Code ID** (optional, from rice_codes table)
- **User ID** (for payer in payment advice)

---

## Step-by-Step Integration

### Step 1: Create Transporter (Optional)

If the transporter doesn't exist, create it first.

**Endpoint:** `POST /api/v1/transporters`

**Request:**
```json
{
  "business_name": "HPR HODAL PALWAL ROADWAYS",
  "contact_person": "Shyam Malik",
  "phone": "9893397272",
  "email": "hpr@example.com",
  "address": {
    "street": "Kalyanpur Jodh, New By Pass Road",
    "city": "Bhopal",
    "state": "Madhya Pradesh",
    "pincode": "462001",
    "country": "India"
  },
  "gst_number": "23ALGPM7417A1ZJ",
  "pan_number": "ALGPM7417A",
  "vehicle_numbers": ["RJ114C6226", "DL1LAJ8567"],
  "bank_details": {
    "bank_name": "AXIS BANK",
    "ifsc_code": "UTIB0001687",
    "account_number": "916020061697669",
    "branch": "Indrapuri"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "3e180c09-6d3f-4ed2-b99d-6a1fa4f643d8",
    "business_name": "HPR HODAL PALWAL ROADWAYS",
    ...
  }
}
```

**Save the `transporter_id` for Step 2.**

---

### Step 2: Create Sauda (Agreement)

A Sauda is a purchase agreement that defines the terms of the purchase.

**Endpoint:** `POST /api/v1/saudas`

**Request:**
```json
{
  "sauda_type": "xgodown",  // "xgodown" or "for"
  "rice_quality": "CHAPI WAND RAW PARMAL",
  "rice_code_id": "adfcd002-ae3a-48f3-8ebd-05f1681902ae",  // Optional
  "rate": 45.50,  // Rate per kg in INR
  "broker_id": "f4eb4f83-21cc-4d9f-b8b1-6b59b579c51a",  // Optional
  "broker_commission": 2.5,  // Percentage or amount
  "quantity": 50000,  // Expected quantity in kg
  "transporter_id": "3e180c09-6d3f-4ed2-b99d-6a1fa4f643d8",  // Required for xgodown
  "transportation_cost": 5000,  // Required for xgodown (amount in INR)
  "cash_discount": 25000,  // Amount in INR (not percentage)
  "estimated_delivery_time": 30,  // Number of days
  "purchaser_id": "f6d38f0f-22e6-4b91-85e9-5ffbd36def05",  // Vendor ID
  "cooked_rice_image_url": "https://...",  // Optional
  "uncooked_rice_image_url": "https://...",  // Optional
  "status": "active"  // "draft", "active", "completed", "cancelled"
}
```

**Important Notes:**
- `sauda_type`: 
  - `"xgodown"`: Ex-godown/from warehouse (requires `transporter_id` and `transportation_cost`)
  - `"for"`: Free on Rail/Road (no transportation)
- `estimated_delivery_time`: Must be a **number** (days), not a date string
- `status`: Defaults to `"draft"` if not provided

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "bfe04d8f-394a-4c20-b161-48ad6d0e8bd0",
    "sauda_type": "xgodown",
    "rate": 45.5,
    "status": "active",
    ...
  }
}
```

**Save the `sauda_id` for Steps 3 and 4.**

---

### Step 3: Create Purchase (Recommended: Before Inward Slip Pass)

A Purchase represents the actual purchase transaction linked to a Sauda. **It can be created before or after Inward Slip Pass.**

**Endpoint:** `POST /api/v1/purchases`

**Request:**
```json
{
  "vendor_id": "f6d38f0f-22e6-4b91-85e9-5ffbd36def05",  // Required
  "sauda_id": "bfe04d8f-394a-4c20-b161-48ad6d0e8bd0",  // Required
  "broker_id": "f4eb4f83-21cc-4d9f-b8b1-6b59b579c51a",  // Optional
  "broker_commission": 2.5,  // Optional
  "invoice_number": "INV-2024-001",  // Optional
  "invoice_date": "2024-11-12",  // Optional, ISO date
  "rate": 45.50,  // Optional (auto-filled from Sauda if not provided)
  "total_weight": 7430,  // Optional (auto-calculated from inward slip lots)
  "total_amount": 338065,  // Optional (auto-calculated with all factors)
  "igst_amount": 6085.17,  // Optional (auto-calculated)
  "igst_percentage": 1.8,  // Optional
  "freight_status": "PAID",  // Optional
  "truck_number": "RJ114C6226",  // Optional (auto-filled from sauda's transporter)
  "transport_name": "HPR HODAL PALWAL ROADWAYS",  // Optional (auto-filled from sauda's transporter)
  "goods_dispatched_from": "Bhopal",  // Optional
  "goods_dispatched_to": "Delhi",  // Optional
  "purchase_date": "2024-11-12",  // Required, ISO date
  "expected_quantity": 50000,  // Optional
  "notes": "Additional notes"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "7eef2ed8-2198-485a-8c16-ed8a0b46ef06",
    "invoice_number": "INV-2024-001",
    "status": "pending",  // Auto-set
    "total_amount": null,  // Will be calculated when Inward Slip Pass is created
    ...
  }
}
```

**Save the `purchase_id` for Step 4.**

---

### Step 4: Create Inward Slip Pass with Lots

An Inward Slip Pass records the entry of goods with multiple lots. Each lot has its own weight and amount calculations.

**Note:** This can be created before or after Purchase. If created after Purchase, purchase amounts will be calculated based on these lots.

**Endpoint:** `POST /api/v1/inward-slip-passes`

**Request:**
```json
{
  "sauda_id": "bfe04d8f-394a-4c20-b161-48ad6d0e8bd0",
  "slip_number": "ISP-001",
  "date": "2024-11-12",  // ISO date string
  "vehicle_number": "RJ114C6226",
  "party_name": "XYZ VENDOR",
  "party_address": "Bhopal, MP",
  "party_gst_number": "23ABCDE1234F1Z5",  // Optional (must be 15 characters)
  "status": "pending",  // "pending" or "completed"
  "inward_slip_bill_image_url": "https://...",  // Optional (can be uploaded separately)
  "notes": "Additional notes",  // Optional
  "lots": [
    {
      "lot_number": "P3236",
      "item_name": "CHAPI WAND RAW PARMAL",
      "no_of_bags": 100,
      "bag_weight": 50,  // Weight per bag in kg
      "bill_weight": 5000,  // Weight on bill
      "received_weight": 4950,  // Actual received weight
      "bardana": "BOPP",  // Packaging type
      "rate": 45.50  // Rate per kg
    },
    {
      "lot_number": "P3237",
      "item_name": "CHAPI WAND RAW PARMAL",
      "no_of_bags": 50,
      "bag_weight": 50,
      "bill_weight": 2500,
      "received_weight": 2480,
      "bardana": "BOPP",
      "rate": 45.50
    }
  ]
}
```

**Automatic Calculations:**
- `total_weight` = `no_of_bags × bag_weight` (calculated by database trigger)
- `amount` = `received_weight × rate` (calculated by database trigger)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "65dc848e-f183-443a-b475-708c04e39174",
    "slip_number": "ISP-001",
    "lots": [
      {
        "id": "...",
        "lot_number": "P3236",
        "total_weight": 5000,  // Auto-calculated
        "amount": 225225,  // Auto-calculated: 4950 × 45.50
        ...
      },
      {
        "id": "...",
        "lot_number": "P3237",
        "total_weight": 2500,  // Auto-calculated
        "amount": 112840,  // Auto-calculated: 2480 × 45.50
        ...
      }
    ],
    ...
  }
}
```

**Save the `inward_slip_pass_id` if needed for reference.**

#### Upload Inward Slip Bill Image (Optional)

**Endpoint:** `POST /api/v1/inward-slip-passes/:id/upload-bill-image`

**Request:** `multipart/form-data`
- `file`: Image or PDF file (max 10MB)

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://s3.amazonaws.com/.../inward-slip-bills/..."
  }
}
```

**Note:** If Purchase was created before this Inward Slip Pass, the purchase amounts (`total_weight`, `total_amount`, `igst_amount`) should be manually updated using `PUT /api/v1/purchases/:id` to reflect the calculated values from inward slip lots. The backend will calculate amounts when an Inward Slip Pass is deleted (for recalculation), but not automatically when created.

---

### Step 3.1: Upload Purchase Documents (Optional)

You can upload various documents for the purchase:

#### Upload Transportation Bill
**Endpoint:** `POST /api/v1/purchases/:id/upload-transportation-bill`

**Request:** `multipart/form-data`
- `file`: Image or PDF file

**Auto-Status Update:** When transportation bill is uploaded, purchase status automatically changes to `"received"`.

**Response:**
```json
{
  "success": true,
  "data": {
    "transportation_bill_image_url": "https://s3.amazonaws.com/...",
    "status": "received"  // Auto-updated
  }
}
```

#### Upload Purchase Bill
**Endpoint:** `POST /api/v1/purchases/:id/upload-purchase-bill`

#### Upload Bilti
**Endpoint:** `POST /api/v1/purchases/:id/upload-bilti`

#### Upload E-way Bill
**Endpoint:** `POST /api/v1/purchases/:id/upload-eway-bill`

All follow the same pattern as transportation bill upload.

---

### Step 5: Create Payment Advice with Charges (After Purchase and Inward Slip Pass)

A Payment Advice contains payment instructions with flexible charges that are deducted from the amount to calculate net payable.

**Endpoint:** `POST /api/v1/payment-advices`

**Request:**
```json
{
  "purchase_id": "7eef2ed8-2198-485a-8c16-ed8a0b46ef06",  // Optional
  "payer_id": "14b4a292-ea4a-4a0b-92ff-1aca07907bde",  // Required (User ID)
  "recipient_id": "f6d38f0f-22e6-4b91-85e9-5ffbd36def05",  // Required (Vendor ID)
  "sr_number": "SR-001",  // Optional
  "party_name": "XYZ VENDOR",  // Optional
  "party_address": "Bhopal, MP",  // Optional
  "broker_name": "Broker ABC",  // Optional
  "invoice_number": "INV-2024-001",  // Optional
  "invoice_date": "2024-11-12",  // Optional, ISO date
  "truck_number": "RJ114C6226",  // Optional
  "item": "CHAPI WAND RAW PARMAL",  // Optional
  "total_bags": 150,  // Optional
  "due_date": "2024-11-20",  // Optional, ISO date
  "bill_weight": 7430,  // Optional
  "kanta_weight": 7400,  // Optional
  "final_weight": 7400,  // Optional
  "rate": 45.50,  // Optional
  "amount": 1574200,  // Required
  "date_of_payment": "2024-11-12",  // Required, ISO date
  "status": "pending",  // Optional: "pending", "completed", "failed"
  "payment_slip_image_url": "https://...",  // Optional
  "notes": "Additional notes",  // Optional
  "charges": [  // Optional array of charges
    {
      "charge_name": "CD 2.0%",
      "charge_value": 31481.00,
      "charge_type": "fixed"  // "percentage" or "fixed"
    },
    {
      "charge_name": "GADI DALA PAID",
      "charge_value": 0.00,
      "charge_type": "fixed"
    },
    {
      "charge_name": "RTGS Charges",
      "charge_value": 117.70,
      "charge_type": "fixed"
    },
    {
      "charge_name": "KANTA CHARGES",
      "charge_value": 350.00,
      "charge_type": "fixed"
    }
  ]
}
```

**Automatic Calculations:**
- `net_payable` = `amount - SUM(charges.charge_value)`
- Example: 1,574,200 - (31,481 + 0 + 117.70 + 350) = 1,542,251.3

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "a957e93f-7a5e-443d-a12f-b1f7f85df70e",
    "amount": 1574200,
    "net_payable": 1542251.3,  // Auto-calculated
    "status": "pending",
    "charges": [
      {
        "id": "...",
        "charge_name": "CD 2.0%",
        "charge_value": 31481,
        "charge_type": "fixed"
      },
      ...
    ],
    ...
  }
}
```

**Save the `payment_advice_id` for Step 5.1.**

---

### Step 5.1: Complete Payment Advice

To mark the payment as completed, update the payment advice with transaction ID and payment slip.

**Endpoint:** `PUT /api/v1/payment-advices/:id`

**Request:**
```json
{
  "transaction_id": "TXN123456789",
  "payment_slip_image_url": "https://example.com/payment-slip.jpg"
}
```

**Auto-Status Update:** When both `transaction_id` and `payment_slip_image_url` are provided, status automatically changes to `"completed"`.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "a957e93f-7a5e-443d-a12f-b1f7f85df70e",
    "status": "completed",  // Auto-updated
    "transaction_id": "TXN123456789",
    ...
  }
}
```

#### Alternative: Upload Payment Slip

**Endpoint:** `POST /api/v1/payment-advices/:id/upload-slip`

**Request:** `multipart/form-data`
- `file`: Image or PDF file

Then update with transaction ID separately.

---

### Step 5.2: Manage Payment Advice Charges (Optional)

#### Add Charge
**Endpoint:** `POST /api/v1/payment-advices/:id/charges`

**Request:**
```json
{
  "charge_name": "Additional Charge",
  "charge_value": 500.00,
  "charge_type": "fixed"
}
```

#### Remove Charge
**Endpoint:** `DELETE /api/v1/payment-advices/:id/charges/:chargeId`

#### Get Net Payable
**Endpoint:** `GET /api/v1/payment-advices/:id/net-payable`

**Response:**
```json
{
  "net_payable": 1542251.3
}
```

---

## API Reference

### Transporters

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/transporters` | Get all transporters |
| GET | `/api/v1/transporters/:id` | Get transporter by ID |
| POST | `/api/v1/transporters` | Create transporter |
| PUT | `/api/v1/transporters/:id` | Update transporter |
| DELETE | `/api/v1/transporters/:id` | Delete transporter |

### Saudas

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/saudas` | Get all saudas (with filters) |
| GET | `/api/v1/saudas/:id` | Get sauda by ID |
| POST | `/api/v1/saudas` | Create sauda |
| PUT | `/api/v1/saudas/:id` | Update sauda |
| PATCH | `/api/v1/saudas/:id/status` | Update sauda status |
| DELETE | `/api/v1/saudas/:id` | Delete sauda |

**Query Parameters for GET:**
- `include_inactive`: boolean
- `status`: "draft" | "active" | "completed" | "cancelled"
- `sauda_type`: "xgodown" | "for"
- `purchaser_id`: UUID

### Inward Slip Passes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/inward-slip-passes` | Get all inward slip passes |
| GET | `/api/v1/inward-slip-passes/:id` | Get inward slip pass by ID (with lots) |
| POST | `/api/v1/inward-slip-passes` | Create inward slip pass with lots |
| PUT | `/api/v1/inward-slip-passes/:id` | Update inward slip pass |
| PATCH | `/api/v1/inward-slip-passes/:id/status` | Update status |
| POST | `/api/v1/inward-slip-passes/:id/upload-bill-image` | Upload inward slip bill image |
| DELETE | `/api/v1/inward-slip-passes/:id` | Delete inward slip pass |

**Query Parameters for GET:**
- `sauda_id`: UUID

**File Upload:**
- `POST /api/v1/inward-slip-passes/:id/upload-bill-image` - Upload inward slip bill image (image or PDF, max 10MB)

### Purchases

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/purchases` | Get all purchases |
| GET | `/api/v1/purchases/:id` | Get purchase by ID |
| POST | `/api/v1/purchases` | Create purchase |
| PUT | `/api/v1/purchases/:id` | Update purchase |
| PATCH | `/api/v1/purchases/:id/status` | Update status |
| POST | `/api/v1/purchases/:id/upload-transportation-bill` | Upload transportation bill |
| POST | `/api/v1/purchases/:id/upload-purchase-bill` | Upload purchase bill |
| POST | `/api/v1/purchases/:id/upload-bilti` | Upload bilti |
| POST | `/api/v1/purchases/:id/upload-eway-bill` | Upload e-way bill |
| DELETE | `/api/v1/purchases/:id` | Delete purchase |

**Query Parameters for GET:**
- `status`: "pending" | "in_transit" | "received" | "completed"
- `vendor_id`: UUID
- `sauda_id`: UUID

**Important Notes:**
- `total_bags` field has been **removed** from Purchase (bags are tracked in `inward_slip_lots`)
- Purchase amounts are **automatically calculated** from inward slip lots
- Transport details (`truck_number`, `transport_name`) are **auto-populated** from sauda's transporter

### Payment Advices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/payment-advices` | Get all payment advices |
| GET | `/api/v1/payment-advices/:id` | Get payment advice by ID (with charges) |
| POST | `/api/v1/payment-advices` | Create payment advice with charges |
| PUT | `/api/v1/payment-advices/:id` | Update payment advice |
| POST | `/api/v1/payment-advices/:id/upload-slip` | Upload payment slip |
| POST | `/api/v1/payment-advices/:id/charges` | Add charge |
| DELETE | `/api/v1/payment-advices/:id/charges/:chargeId` | Remove charge |
| GET | `/api/v1/payment-advices/:id/net-payable` | Get net payable amount |

**Query Parameters for GET:**
- `purchase_id`: UUID
- `status`: "pending" | "completed" | "failed"

**Important Notes:**
- `charges` field is **NOT allowed** in update request (use dedicated charge endpoints)
- Charges are managed via separate endpoints: `POST /api/v1/payment-advices/:id/charges` and `DELETE /api/v1/payment-advices/:id/charges/:chargeId`
- `net_payable` is automatically calculated and returned in all responses

---

## Status Transitions

### Sauda Status
- `draft` → `active` → `completed` / `cancelled`
- Use `PATCH /api/v1/saudas/:id/status` to update

### Inward Slip Pass Status
- `pending` → `completed`
- Use `PATCH /api/v1/inward-slip-passes/:id/status` to update

### Purchase Status
- `pending` → `in_transit` → `received` → `completed`
- **Auto-update:** When transportation bill is uploaded, status automatically changes to `"received"`
- Use `PATCH /api/v1/purchases/:id/status` to manually update

### Payment Advice Status
- `pending` → `completed` / `failed`
- **Auto-update:** When both `transaction_id` and `payment_slip_image_url` are provided, status automatically changes to `"completed"`
- Use `PUT /api/v1/payment-advices/:id` to update

---

## Calculations

### Inward Slip Lot Calculations

**Total Weight:**
```
total_weight = no_of_bags × bag_weight
```

**Amount:**
```
amount = received_weight × rate
```

These are automatically calculated by database triggers when creating or updating lots.

### Purchase Amount Calculation (Automatic)

The purchase `total_amount` is automatically calculated from inward slip lots with all factors:

**Step-by-Step Calculation:**
```
Step 1: Base Amount = Sum of all inward slip lot amounts
        (received_weight × rate for each lot)

Step 2: Amount After Discount = Base Amount - Cash Discount
        (cash_discount is a fixed amount in INR, not percentage)

Step 3: Amount With Commission = Amount After Discount + Broker Commission
        (broker_commission is a percentage applied to amount after discount)
        Broker Commission Amount = Amount After Discount × (broker_commission / 100)

Step 4: Amount With Transportation = Amount With Commission + Transportation Cost
        (only for 'xgodown' sauda type, 'for' type has no transportation cost)

Step 5: Final Amount = Amount With Transportation + IGST
        (IGST is a percentage applied to amount with transportation)
        IGST Amount = Amount With Transportation × (igst_percentage / 100)
```

**Example Calculation:**
- Base Amount (from inward slip lots): ₹3,38,975
- Cash Discount (fixed amount): -₹25,000
- Amount After Discount: ₹3,13,975
- Broker Commission (2.5%): +₹7,849.37
- Amount With Commission: ₹3,21,824.37
- Transportation Cost (xgodown): +₹15,000
- Amount With Transportation: ₹3,36,824.37
- IGST (1.8%): +₹6,062.83
- **Final Total Amount: ₹3,42,887.20**

**Important Notes:**
- Cash discount is a **fixed amount** (not percentage) and is **subtracted** from base amount
- Broker commission is a **percentage** and is **added** to amount after discount
- Transportation cost is **only added** for 'xgodown' type saudas
- IGST is calculated on the final amount (after all other adjustments)
- All calculations are done automatically by the backend

### Payment Advice Net Payable

**Net Payable:**
```
net_payable = amount - SUM(charges.charge_value)
```

**Example:**
- Amount: 1,574,200
- Charges:
  - CD 2.0%: 31,481
  - GADI DALA PAID: 0
  - RTGS Charges: 117.70
  - KANTA CHARGES: 350
- Total Charges: 31,948.70
- Net Payable: 1,574,200 - 31,948.70 = **1,542,251.3**

**Note:** Charges are flexible and can be added/removed dynamically. Net payable is automatically recalculated.

---

## Error Handling

All API endpoints return standardized error responses:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-11-12T23:18:21.835Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error description",
  "timestamp": "2024-11-12T23:18:21.835Z"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `404` - Not Found
- `500` - Internal Server Error

**Validation Errors:**
When validation fails, the error message will indicate which field failed:
```json
{
  "success": false,
  "error": "\"estimated_delivery_time\" must be a number"
}
```

---

## Complete Flow Example

Here's a complete example of the entire flow:

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/loginUser \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.data.token')

# 2. Create Transporter
TRANSPORTER_ID=$(curl -s -X POST http://localhost:3000/api/v1/transporters \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"business_name":"HPR Transport",...}' \
  | jq -r '.data.id')

# 3. Create Sauda
SAUDA_ID=$(curl -s -X POST http://localhost:3000/api/v1/saudas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sauda_type\":\"xgodown\",\"transporter_id\":\"$TRANSPORTER_ID\",...}" \
  | jq -r '.data.id')

# 4. Create Purchase (before Inward Slip Pass)
PURCHASE_ID=$(curl -s -X POST http://localhost:3000/api/v1/purchases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"vendor_id\":\"...\",\"sauda_id\":\"$SAUDA_ID\",\"purchase_date\":\"2024-11-12\",\"igst_percentage\":1.8}" \
  | jq -r '.data.id')

# 5. Create Inward Slip Pass (after Purchase)
INWARD_SLIP_ID=$(curl -s -X POST http://localhost:3000/api/v1/inward-slip-passes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sauda_id\":\"$SAUDA_ID\",\"slip_number\":\"ISP-001\",\"date\":\"2024-11-12\",\"vehicle_number\":\"RJ114C6226\",\"party_name\":\"XYZ VENDOR\",\"lots\":[...]}" \
  | jq -r '.data.id')

# 5.1. Update Purchase with calculated amounts (optional - can be done manually or via frontend)

# 6. Upload Transportation Bill (auto-updates status to 'received')
curl -X POST "http://localhost:3000/api/v1/purchases/$PURCHASE_ID/upload-transportation-bill" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@transport_bill.jpg"

# 7. Create Payment Advice
PAYMENT_ADVICE_ID=$(curl -s -X POST http://localhost:3000/api/v1/payment-advices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"purchase_id\":\"$PURCHASE_ID\",\"amount\":1574200,\"charges\":[...]}" \
  | jq -r '.data.id')

# 8. Complete Payment Advice (auto-updates status to 'completed')
curl -X PUT "http://localhost:3000/api/v1/payment-advices/$PAYMENT_ADVICE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"transaction_id":"TXN123456789","payment_slip_image_url":"https://..."}'
```

---

## Notes

1. **File Uploads:** All file uploads are stored in S3 with organized folders:
   - Transportation bills: `transportation-bills/`
   - Purchase bills: `purchase-bills/`
   - Bilti: `bilti/`
   - E-way bills: `eway-bills/`
   - Payment slips: `payment-slips/`
   - Rice images: `rice-images/`
   - Inward slip bills: `inward-slip-bills/`

2. **Audit Logging:** All create, update, and delete operations are automatically logged for audit purposes.

3. **Soft Deletes:** Currently, deletes are hard deletes. Consider implementing soft deletes if needed.

4. **Relationships:**
   - Sauda → Transporter (optional, for xgodown type)
   - Sauda → Broker (optional)
   - Sauda → Rice Code (optional)
   - Inward Slip Pass → Sauda (required)
   - Inward Slip Lot → Inward Slip Pass (required, CASCADE delete)
   - Purchase → Vendor (required)
   - Purchase → Sauda (required)
   - Purchase → Broker (optional)
   - Purchase → Payment Advice (optional, bidirectional link)
   - Payment Advice → Purchase (optional, bidirectional link)
   - Payment Advice → Payer (User, required)
   - Payment Advice → Recipient (Vendor, required)
   - Payment Advice Charge → Payment Advice (required, CASCADE delete)

5. **Automatic Behaviors:**
   - Purchase `total_amount` is automatically calculated from inward slip lots
   - Purchase `truck_number` and `transport_name` are auto-populated from sauda's transporter
   - Purchase status auto-updates to `"received"` when transportation bill is uploaded
   - Payment advice status auto-updates to `"completed"` when both `transaction_id` and `payment_slip_image_url` are provided
   - Payment advice `amount` is automatically updated when purchase `total_amount` changes
   - Purchase `payment_advice_id` is automatically updated when payment advice is created with `purchase_id`
   - When an inward slip pass is deleted, all associated purchases are automatically recalculated

6. **Data Deletion:**
   - Deleting a Sauda will cascade delete all related inward slip passes, purchases, payment advices, and charges
   - Deleting an Inward Slip Pass will automatically recalculate associated purchase totals
   - Deleting a Payment Advice will unlink it from the purchase (sets `purchase.payment_advice_id` to NULL)

---

## Support

For issues or questions, refer to the API documentation or contact the development team.

