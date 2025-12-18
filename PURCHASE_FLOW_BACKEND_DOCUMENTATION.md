# Purchase Flow - Complete Backend Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture & Entity Relationships](#architecture--entity-relationships)
3. [Database Schema](#database-schema)
4. [Entity Details](#entity-details)
5. [Junction Tables](#junction-tables)
6. [API Endpoints](#api-endpoints)
7. [Calculation Logic](#calculation-logic)
8. [Complete Flow Examples](#complete-flow-examples)
9. [Best Practices](#best-practices)

---

## Overview

The Purchase Flow is a flexible, independent entity-based system that allows for dynamic aggregation of purchase-related entities. Unlike traditional sequential flows, entities can be created independently and linked together through many-to-many relationships.

### Key Features

- ✅ **Independent Entity Creation**: Saudas, Inward Slip Passes, and Lots can be created independently
- ✅ **Flexible Aggregation**: A single Purchase can aggregate from multiple Saudas, ISPs, and Lots
- ✅ **Many-to-Many Relationships**: Multiple Saudas can link to multiple Inward Slip Passes
- ✅ **Purchase-Level Accounting**: Cash discount, transportation cost, and broker commission are managed at Purchase level
- ✅ **Automatic Calculations**: Totals are automatically calculated from linked lots
- ✅ **Transportation at ISP Level**: Transportation details are tracked per Inward Slip Pass

---

## Architecture & Entity Relationships

### Entity Relationship Diagram

```
┌─────────────┐
│   Vendor    │
└──────┬──────┘
       │
       │ (purchaser_id)
       │
       ▼
┌─────────────┐
│    Sauda    │ ◄───┐
│ (Agreement) │     │
└──────┬──────┘     │
       │            │ (many-to-many)
       │            │
       ├────────────┼──────────────┐
       │            │              │
       │            │              │
       ▼            ▼              ▼
┌──────────────────┐      ┌──────────────┐
│ Inward Slip Pass │      │     Lot     │
│   (ISP)          │      │ (Independent)│
│                  │      └──────────────┘
│ - transporter_id │
│ - transport_cost │
└──────────────────┘
       │
       │ (many-to-many via junction tables)
       │
       ▼
┌──────────────────┐
│    Purchase      │
│ (Aggregation)    │
│                  │
│ - cash_discount  │
│ - transport_cost │
│ - broker_comm    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Payment Advice   │
│                  │
│ - charges[]      │
│ - net_payable    │
└──────────────────┘
```

### Relationship Summary

| Relationship | Type | Junction Table | Notes |
|-------------|------|----------------|-------|
| Sauda ↔ Inward Slip Pass | Many-to-Many | `inward_slip_pass_saudas` | Multiple saudas per ISP, multiple ISPs per sauda |
| Sauda → Lot | One-to-Many | Direct FK | Lots link directly to Sauda (not to ISP) |
| Purchase ↔ Sauda | Many-to-Many | `purchase_saudas` | Purchase can aggregate multiple saudas |
| Purchase ↔ ISP | Many-to-Many | `purchase_inward_slip_passes` | Purchase can aggregate multiple ISPs |
| Purchase ↔ Lot | Many-to-Many | `purchase_lots` | Purchase aggregates from linked lots |
| Purchase → Payment Advice | One-to-One | Direct FK | One payment advice per purchase |

---

## Database Schema

### Core Tables

#### 1. `saudas` - Purchase Agreements
```sql
CREATE TABLE saudas (
    id UUID PRIMARY KEY,
    sauda_type VARCHAR(20) CHECK (sauda_type IN ('exgodown', 'for')),
    rice_quality VARCHAR(255) NOT NULL,
    rice_code_id UUID REFERENCES rice_codes(rice_code_id),
    rate DECIMAL(10,2) NOT NULL,
    broker_id UUID REFERENCES brokers(id),
    broker_commission DECIMAL(5,2),
    quantity DECIMAL(10,2),
    cash_discount DECIMAL(10,2),
    estimated_delivery_time INTEGER,
    purchaser_id UUID NOT NULL REFERENCES vendors(id),
    status VARCHAR(20) CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    -- ... other fields
);
```

**Key Points:**
- `purchaser_id` references `vendors` table
- No `transporter_id` or `transportation_cost` (moved to ISPs)
- `cash_discount` is a fixed amount (not percentage)

#### 2. `inward_slip_passes` - Inward Slip Documentation
```sql
CREATE TABLE inward_slip_passes (
    id UUID PRIMARY KEY,
    slip_number VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    vehicle_number VARCHAR(50) NOT NULL,
    party_name VARCHAR(255) NOT NULL,
    transporter_id UUID REFERENCES transporters(id),
    transportation_cost DECIMAL(10,2),
    status VARCHAR(20) CHECK (status IN ('pending', 'completed')),
    -- ... bill/document fields
);
```

**Key Points:**
- **NO `sauda_id` column** (uses junction table `inward_slip_pass_saudas`)
- `transporter_id` and `transportation_cost` are stored here (not in saudas)
- Multiple saudas can be linked via junction table

#### 3. `inward_slip_lots` - Individual Lots
```sql
CREATE TABLE inward_slip_lots (
    id UUID PRIMARY KEY,
    sauda_id UUID NOT NULL REFERENCES saudas(id) ON DELETE RESTRICT,
    lot_number VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    no_of_bags INTEGER NOT NULL,
    bill_weight DECIMAL(10,2) NOT NULL,
    received_weight DECIMAL(10,2) NOT NULL,
    rate DECIMAL(10,2) NOT NULL,
    amount DECIMAL(15,2), -- Calculated: received_weight * rate
    -- ... other fields
);
```

**Key Points:**
- **Direct link to `sauda_id`** (NOT to ISP)
- `amount` is calculated as `received_weight * rate`
- Multiple lots can exist for one sauda

#### 4. `purchases` - Purchase Execution Records
```sql
CREATE TABLE purchases (
    id UUID PRIMARY KEY,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    broker_id UUID REFERENCES brokers(id),
    broker_commission DECIMAL(5,2),
    payment_advice_id UUID REFERENCES payment_advices(id),
    cash_discount DECIMAL(10,2), -- Purchase-level override
    transportation_cost DECIMAL(10,2), -- Purchase-level override
    rate DECIMAL(10,2) NOT NULL,
    total_weight DECIMAL(10,2),
    total_amount DECIMAL(15,2), -- Calculated from linked lots
    igst_percentage DECIMAL(5,2),
    igst_amount DECIMAL(15,2),
    purchase_date DATE NOT NULL,
    -- ... other fields
);
```

**Key Points:**
- **NO `sauda_id` column** (uses junction tables)
- `cash_discount`, `transportation_cost`, `broker_commission` are Purchase-level
- `total_amount` is calculated from linked lots via `purchase_lots` junction table

#### 5. `payment_advices` - Payment Documentation
```sql
CREATE TABLE payment_advices (
    id UUID PRIMARY KEY,
    purchase_id UUID REFERENCES purchases(id),
    payer_id UUID NOT NULL REFERENCES users(id),
    recipient_id UUID NOT NULL REFERENCES vendors(id),
    amount DECIMAL(15,2) NOT NULL,
    date_of_payment DATE NOT NULL,
    status VARCHAR(20) CHECK (status IN ('pending', 'completed', 'failed')),
    -- ... other fields
);
```

#### 6. `payment_advice_charges` - Additional Charges
```sql
CREATE TABLE payment_advice_charges (
    id UUID PRIMARY KEY,
    payment_advice_id UUID NOT NULL REFERENCES payment_advices(id) ON DELETE CASCADE,
    charge_name VARCHAR(255) NOT NULL,
    charge_type VARCHAR(20) CHECK (charge_type IN ('fixed', 'percentage')),
    charge_value DECIMAL(15,2) NOT NULL,
    -- ... other fields
);
```

---

## Junction Tables

### Purpose
Junction tables enable many-to-many relationships between entities, allowing flexible aggregation.

### 1. `inward_slip_pass_saudas`
**Purpose**: Links Inward Slip Passes to Saudas (many-to-many)

```sql
CREATE TABLE inward_slip_pass_saudas (
    id UUID PRIMARY KEY,
    inward_slip_pass_id UUID NOT NULL REFERENCES inward_slip_passes(id) ON DELETE CASCADE,
    sauda_id UUID NOT NULL REFERENCES saudas(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(inward_slip_pass_id, sauda_id)
);
```

**Usage:**
- One ISP can be linked to multiple Saudas
- One Sauda can be linked to multiple ISPs
- Transportation details (transporter_id, transportation_cost) are stored on ISP

### 2. `purchase_saudas`
**Purpose**: Links Purchases to Saudas (many-to-many)

```sql
CREATE TABLE purchase_saudas (
    id UUID PRIMARY KEY,
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    sauda_id UUID NOT NULL REFERENCES saudas(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(purchase_id, sauda_id)
);
```

**Usage:**
- One Purchase can aggregate multiple Saudas
- One Sauda can be part of multiple Purchases

### 3. `purchase_inward_slip_passes`
**Purpose**: Links Purchases to Inward Slip Passes (many-to-many)

```sql
CREATE TABLE purchase_inward_slip_passes (
    id UUID PRIMARY KEY,
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    inward_slip_pass_id UUID NOT NULL REFERENCES inward_slip_passes(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(purchase_id, inward_slip_pass_id)
);
```

**Usage:**
- One Purchase can aggregate multiple ISPs
- One ISP can be part of multiple Purchases

### 4. `purchase_lots`
**Purpose**: Links Purchases to Lots (many-to-many) - **Primary source for calculations**

```sql
CREATE TABLE purchase_lots (
    id UUID PRIMARY KEY,
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    lot_id UUID NOT NULL REFERENCES inward_slip_lots(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(purchase_id, lot_id)
);
```

**Usage:**
- **This is the primary junction table for calculations**
- Purchase totals are calculated by aggregating data from linked lots
- One Purchase can aggregate multiple Lots
- One Lot can be part of multiple Purchases

### Foreign Key Constraints

| Junction Table | ON DELETE CASCADE | ON DELETE RESTRICT |
|---------------|-------------------|-------------------|
| `inward_slip_pass_saudas` | `inward_slip_pass_id` | `sauda_id` |
| `purchase_saudas` | `purchase_id` | `sauda_id` |
| `purchase_inward_slip_passes` | `purchase_id` | `inward_slip_pass_id` |
| `purchase_lots` | `purchase_id` | `lot_id` |

**Meaning:**
- When a Purchase is deleted, all junction table entries are automatically deleted (CASCADE)
- When a Sauda/ISP/Lot is deleted, it's prevented if linked to any Purchase (RESTRICT)

---

## Entity Details

### 1. Sauda (Purchase Agreement)

**Purpose**: Represents a purchase agreement/contract between vendor and purchaser.

**Key Fields:**
- `sauda_type`: `'exgodown'` (ex-godown/from warehouse) or `'for'` (Free on Rail/Road)
- `rate`: Base rate per unit
- `purchaser_id`: References vendor (the purchaser)
- `broker_commission`: Percentage (stored on sauda, can be overridden at purchase level)
- `cash_discount`: Fixed amount (stored on sauda, can be overridden at purchase level)

**Status Flow:**
```
draft → active → completed
         ↓
      cancelled
```

**API Endpoints:**
- `GET /api/v1/saudas` - List all saudas
- `GET /api/v1/saudas/:id` - Get sauda by ID
- `POST /api/v1/saudas` - Create sauda
- `PUT /api/v1/saudas/:id` - Update sauda
- `PATCH /api/v1/saudas/:id/status` - Update status
- `DELETE /api/v1/saudas/:id` - Delete sauda

### 2. Inward Slip Pass (ISP)

**Purpose**: Documents the inward slip for goods received, including transportation details.

**Key Fields:**
- `slip_number`: Unique slip identifier (e.g., "P3236")
- `transporter_id`: References transporter (moved from sauda)
- `transportation_cost`: Cost for this specific ISP (moved from sauda)
- `sauda_ids[]`: Array of linked sauda IDs (via junction table)

**Status:**
- `pending`: Slip created but not completed
- `completed`: Slip processing completed

**API Endpoints:**
- `GET /api/v1/inward-slip-passes` - List all ISPs (filter by `sauda_id` query param)
- `GET /api/v1/inward-slip-passes/:id` - Get ISP by ID
- `POST /api/v1/inward-slip-passes` - Create ISP (with optional `sauda_ids[]`)
- `PUT /api/v1/inward-slip-passes/:id` - Update ISP (can update `sauda_ids[]` to replace links)
- `DELETE /api/v1/inward-slip-passes/:id` - Delete ISP

**Note**: `sauda_ids` can be provided during creation or updated later via PUT.

### 3. Inward Slip Lot

**Purpose**: Represents individual lots of goods, with weight and amount calculations.

**Key Fields:**
- `sauda_id`: **Direct link to Sauda** (required)
- `received_weight`: Actual weight received
- `bill_weight`: Weight as per bill
- `rate`: Rate per unit (from sauda or override)
- `amount`: Calculated as `received_weight * rate`

**Calculation:**
```typescript
amount = received_weight * rate
```

**API Endpoints:**
- `GET /api/v1/lots` - List all lots (filter by `sauda_id` query param)
- `GET /api/v1/lots/:id` - Get lot by ID
- `POST /api/v1/lots` - Create lot (requires `sauda_id`)
- `PUT /api/v1/lots/:id` - Update lot
- `DELETE /api/v1/lots/:id` - Delete lot

### 4. Purchase

**Purpose**: Aggregates multiple entities and handles all accounting calculations.

**Key Fields:**
- `vendor_id`: The vendor (required)
- `cash_discount`: Purchase-level cash discount (fixed amount, overrides sauda-level)
- `transportation_cost`: Purchase-level transportation cost (fixed amount)
- `broker_commission`: Purchase-level broker commission (percentage, overrides sauda-level)
- `igst_percentage`: IGST percentage for this purchase
- `total_amount`: **Calculated from linked lots** (automatic)

**Linking:**
- `sauda_ids[]`: Optional array of sauda IDs to link
- `inward_slip_pass_ids[]`: Optional array of ISP IDs to link
- `lot_ids[]`: Optional array of lot IDs to link (required for calculations)

**API Endpoints:**
- `GET /api/v1/purchases` - List all purchases
- `GET /api/v1/purchases/:id` - Get purchase by ID
- `POST /api/v1/purchases` - Create purchase (with optional linking arrays)
- `PUT /api/v1/purchases/:id` - Update purchase
- `DELETE /api/v1/purchases/:id` - Delete purchase

**Linking Endpoints:**
- `POST /api/v1/purchases/:id/link-saudas` - Link saudas
- `POST /api/v1/purchases/:id/link-inward-slip-passes` - Link ISPs
- `POST /api/v1/purchases/:id/link-lots` - Link lots
- `DELETE /api/v1/purchases/:id/unlink-sauda/:saudaId` - Unlink sauda
- `DELETE /api/v1/purchases/:id/unlink-inward-slip-pass/:ispId` - Unlink ISP
- `DELETE /api/v1/purchases/:id/unlink-lot/:lotId` - Unlink lot
- `GET /api/v1/purchases/:id/linked-entities` - Get all linked entities
- `POST /api/v1/purchases/:id/recalculate-totals` - Recalculate totals

### 5. Payment Advice

**Purpose**: Final payment documentation with charges and net payable calculation.

**Key Fields:**
- `purchase_id`: Links to purchase (optional)
- `amount`: Base amount (usually from purchase.total_amount)
- `charges[]`: Array of additional charges
- `net_payable`: Calculated as `amount + sum(charges)`

**Charges:**
- `charge_type`: `'fixed'` (absolute amount) or `'percentage'` (of base amount)
- `charge_value`: The charge amount or percentage

**API Endpoints:**
- `GET /api/v1/payment-advices` - List all payment advices
- `GET /api/v1/payment-advices/:id` - Get payment advice by ID
- `POST /api/v1/payment-advices` - Create payment advice (with optional `charges[]`)
- `PUT /api/v1/payment-advices/:id` - Update payment advice
- `DELETE /api/v1/payment-advices/:id` - Delete payment advice

---

## API Endpoints

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication
All endpoints require JWT token:
```
Authorization: Bearer <your_jwt_token>
```

### 1. Sauda Endpoints

#### Create Sauda
```http
POST /api/v1/saudas
Content-Type: application/json

{
  "sauda_type": "exgodown",              // Required: "exgodown" | "for"
  "rice_quality": "Premium Basmati",    // Required
  "rate": 85.50,                        // Required
  "purchaser_id": "vendor-uuid",        // Required
  "broker_id": "broker-uuid",           // Optional
  "broker_commission": 2.5,             // Optional (percentage)
  "cash_discount": 1000.00,             // Optional (fixed amount)
  "quantity": 5000.00,                  // Optional
  "status": "active"                    // Optional: "draft" | "active" | "completed" | "cancelled"
}
```

#### Get All Saudas
```http
GET /api/v1/saudas?status=active&sauda_type=exgodown&purchaser_id=uuid
```

### 2. Inward Slip Pass Endpoints

#### Create ISP (with multiple saudas)
```http
POST /api/v1/inward-slip-passes
Content-Type: application/json

{
  "sauda_ids": ["sauda-uuid-1", "sauda-uuid-2"],  // Optional: Array of sauda IDs
  "slip_number": "P3236",                         // Required
  "date": "2024-01-15",                          // Required (ISO date)
  "vehicle_number": "MH01AB1234",                 // Required
  "party_name": "ABC Transport",                  // Required
  "transporter_id": "transporter-uuid",           // Optional
  "transportation_cost": 5000.00,                 // Optional
  "status": "pending"                             // Optional: "pending" | "completed"
}
```

#### Update ISP (update sauda links)
```http
PUT /api/v1/inward-slip-passes/:id
Content-Type: application/json

{
  "sauda_ids": ["sauda-uuid-3", "sauda-uuid-4"],  // Optional: Replaces all existing links
  "slip_number": "P3237",                         // Optional
  "transportation_cost": 6000.00                  // Optional
}
```

**Note**: Providing `sauda_ids` in update will **replace** all existing links. To keep existing links, omit this field.

### 3. Lot Endpoints

#### Create Lot
```http
POST /api/v1/lots
Content-Type: application/json

{
  "sauda_id": "sauda-uuid",              // Required: Specify which sauda
  "lot_number": "LOT-001",               // Required
  "item_name": "Premium Basmati Rice",   // Required
  "no_of_bags": 50,                      // Required
  "bill_weight": 2500.00,                // Required
  "received_weight": 2480.00,            // Required
  "rate": 85.50,                         // Required
  "bag_weight": 50.00                    // Optional
}
```

**Note**: Lot must specify `sauda_id` - it links directly to sauda, not to ISP.

### 4. Purchase Endpoints

#### Create Purchase (with linking)
```http
POST /api/v1/purchases
Content-Type: application/json

{
  "vendor_id": "vendor-uuid",                    // Required
  "purchase_date": "2024-01-15",                 // Required (ISO date)
  "sauda_ids": ["sauda-1", "sauda-2"],           // Optional: Link saudas
  "inward_slip_pass_ids": ["isp-1", "isp-2"],    // Optional: Link ISPs
  "lot_ids": ["lot-1", "lot-2", "lot-3"],        // Optional: Link lots (required for calculations)
  "cash_discount": 1500.00,                      // Optional: Purchase-level override
  "transportation_cost": 5000.00,                // Optional: Purchase-level override
  "broker_commission": 2.0,                      // Optional: Purchase-level override (percentage)
  "igst_percentage": 5.0,                        // Optional
  "rate": 85.50                                   // Optional: Will use from first linked sauda if not provided
}
```

**Important**: 
- `lot_ids` should be provided for automatic calculations
- If `rate` is not provided, system uses rate from first linked sauda
- Totals are automatically calculated from linked lots

#### Link Entities to Purchase
```http
POST /api/v1/purchases/:id/link-saudas
Content-Type: application/json

{
  "sauda_ids": ["sauda-uuid-1", "sauda-uuid-2"]
}

POST /api/v1/purchases/:id/link-inward-slip-passes
Content-Type: application/json

{
  "inward_slip_pass_ids": ["isp-uuid-1", "isp-uuid-2"]
}

POST /api/v1/purchases/:id/link-lots
Content-Type: application/json

{
  "lot_ids": ["lot-uuid-1", "lot-uuid-2", "lot-uuid-3"]
}
```

#### Get Linked Entities
```http
GET /api/v1/purchases/:id/linked-entities

Response:
{
  "success": true,
  "data": {
    "sauda_ids": ["uuid-1", "uuid-2"],
    "inward_slip_pass_ids": ["uuid-1"],
    "lot_ids": ["uuid-1", "uuid-2", "uuid-3"]
  }
}
```

#### Recalculate Totals
```http
POST /api/v1/purchases/:id/recalculate-totals

Response:
{
  "success": true,
  "data": {
    "total_weight": 5000.00,
    "total_amount": 425000.00,
    "igst_amount": 21250.00,
    "final_total_amount": 446250.00
  }
}
```

### 5. Payment Advice Endpoints

#### Create Payment Advice
```http
POST /api/v1/payment-advices
Content-Type: application/json

{
  "purchase_id": "purchase-uuid",         // Optional
  "payer_id": "user-uuid",                // Required
  "recipient_id": "vendor-uuid",          // Required
  "amount": 446250.00,                    // Required (usually from purchase.total_amount)
  "date_of_payment": "2024-01-20",        // Required (ISO date)
  "charges": [                            // Optional: Array of charges
    {
      "charge_name": "Bank Charges",
      "charge_type": "fixed",              // "fixed" | "percentage"
      "charge_value": 500.00
    },
    {
      "charge_name": "Processing Fee",
      "charge_type": "percentage",
      "charge_value": 1.5                  // 1.5% of base amount
    }
  ]
}
```

**Net Payable Calculation:**
```typescript
net_payable = amount + sum(charges)
// For fixed charges: add directly
// For percentage charges: add (amount * charge_value / 100)
```

---

## Calculation Logic

### Purchase Amount Calculation

The purchase total is calculated from **linked lots** using the following formula:

```typescript
// Step 1: Aggregate base amount from all linked lots
baseAmount = SUM(lot.amount) for all linked lots
// where lot.amount = lot.received_weight * lot.rate

// Step 2: Subtract cash discount (Purchase-level, fixed amount)
amountAfterDiscount = baseAmount - cashDiscount

// Step 3: Add broker commission (Purchase-level, percentage)
brokerCommissionAmount = amountAfterDiscount * (brokerCommission / 100)
amountWithCommission = amountAfterDiscount + brokerCommissionAmount

// Step 4: Add transportation cost (Purchase-level, fixed amount)
amountWithTransportation = amountWithCommission + transportationCost

// Step 5: Calculate IGST (Purchase-level, percentage)
igstAmount = amountWithTransportation * (igstPercentage / 100)
finalTotalAmount = amountWithTransportation + igstAmount
```

### Example Calculation

**Given:**
- Lot 1: received_weight = 1000kg, rate = 85.50 → amount = 85,500
- Lot 2: received_weight = 2000kg, rate = 85.50 → amount = 171,000
- Base Amount = 256,500
- Cash Discount = 1,500 (fixed)
- Broker Commission = 2.0% (percentage)
- Transportation Cost = 5,000 (fixed)
- IGST = 5.0% (percentage)

**Calculation:**
```
Step 1: baseAmount = 256,500
Step 2: amountAfterDiscount = 256,500 - 1,500 = 255,000
Step 3: brokerCommissionAmount = 255,000 * 0.02 = 5,100
        amountWithCommission = 255,000 + 5,100 = 260,100
Step 4: amountWithTransportation = 260,100 + 5,000 = 265,100
Step 5: igstAmount = 265,100 * 0.05 = 13,255
        finalTotalAmount = 265,100 + 13,255 = 278,355
```

### Payment Advice Net Payable Calculation

```typescript
// Base amount (from purchase or manual)
baseAmount = paymentAdvice.amount

// Calculate charges
totalCharges = 0
for each charge in charges:
  if charge.charge_type === 'fixed':
    totalCharges += charge.charge_value
  else if charge.charge_type === 'percentage':
    totalCharges += (baseAmount * charge.charge_value / 100)

// Net payable
netPayable = baseAmount + totalCharges
```

### Transportation Cost Aggregation

Transportation costs are stored at the **ISP level**, not at the Sauda level. When calculating totals for a sauda (legacy function), the system aggregates transportation costs from all ISPs linked to that sauda:

```sql
SELECT COALESCE(SUM(isp.transportation_cost), 0) as total_transportation_cost
FROM inward_slip_passes isp
INNER JOIN inward_slip_pass_saudas isps ON isp.id = isps.inward_slip_pass_id
WHERE isps.sauda_id = $1 AND isp.transportation_cost IS NOT NULL
```

However, in the new flow, **Purchase-level `transportation_cost`** is used directly (not aggregated from ISPs).

---

## Complete Flow Examples

### Example 1: Simple Flow (One Sauda, One ISP, Multiple Lots)

```bash
# Step 1: Create Sauda
POST /api/v1/saudas
{
  "sauda_type": "exgodown",
  "rice_quality": "Premium Basmati",
  "rate": 85.50,
  "purchaser_id": "vendor-uuid",
  "status": "active"
}
# Response: { "id": "sauda-1", ... }

# Step 2: Create ISP (link to sauda)
POST /api/v1/inward-slip-passes
{
  "sauda_ids": ["sauda-1"],
  "slip_number": "P3236",
  "date": "2024-01-15",
  "vehicle_number": "MH01AB1234",
  "party_name": "ABC Transport",
  "transporter_id": "transporter-uuid",
  "transportation_cost": 5000.00
}
# Response: { "id": "isp-1", ... }

# Step 3: Create Lots (link to sauda)
POST /api/v1/lots
{
  "sauda_id": "sauda-1",
  "lot_number": "LOT-001",
  "item_name": "Premium Basmati",
  "no_of_bags": 50,
  "bill_weight": 2500.00,
  "received_weight": 2480.00,
  "rate": 85.50
}
# Response: { "id": "lot-1", "amount": 211,680.00, ... }

POST /api/v1/lots
{
  "sauda_id": "sauda-1",
  "lot_number": "LOT-002",
  "item_name": "Premium Basmati",
  "no_of_bags": 30,
  "bill_weight": 1500.00,
  "received_weight": 1490.00,
  "rate": 85.50
}
# Response: { "id": "lot-2", "amount": 127,395.00, ... }

# Step 4: Create Purchase (aggregate all)
POST /api/v1/purchases
{
  "vendor_id": "vendor-uuid",
  "purchase_date": "2024-01-15",
  "sauda_ids": ["sauda-1"],
  "inward_slip_pass_ids": ["isp-1"],
  "lot_ids": ["lot-1", "lot-2"],
  "cash_discount": 1500.00,
  "transportation_cost": 5000.00,
  "broker_commission": 2.0,
  "igst_percentage": 5.0
}
# Response: {
#   "id": "purchase-1",
#   "total_weight": 3970.00,
#   "total_amount": 278,355.00,  // Calculated automatically
#   ...
# }

# Step 5: Create Payment Advice
POST /api/v1/payment-advices
{
  "purchase_id": "purchase-1",
  "payer_id": "user-uuid",
  "recipient_id": "vendor-uuid",
  "amount": 278,355.00,
  "date_of_payment": "2024-01-20",
  "charges": [
    {
      "charge_name": "Bank Charges",
      "charge_type": "fixed",
      "charge_value": 500.00
    }
  ]
}
# Response: {
#   "id": "payment-advice-1",
#   "net_payable": 278,855.00,  // 278,355 + 500
#   ...
# }
```

### Example 2: Complex Flow (Multiple Saudas, Multiple ISPs, Multiple Lots)

```bash
# Step 1: Create Multiple Saudas
POST /api/v1/saudas
{ "sauda_type": "exgodown", "rice_quality": "Basmati", "rate": 85.50, "purchaser_id": "vendor-uuid" }
# Response: { "id": "sauda-1" }

POST /api/v1/saudas
{ "sauda_type": "for", "rice_quality": "Non-Basmati", "rate": 60.00, "purchaser_id": "vendor-uuid" }
# Response: { "id": "sauda-2" }

# Step 2: Create ISP linked to multiple saudas
POST /api/v1/inward-slip-passes
{
  "sauda_ids": ["sauda-1", "sauda-2"],  // Multiple saudas!
  "slip_number": "P3236",
  "date": "2024-01-15",
  "vehicle_number": "MH01AB1234",
  "party_name": "ABC Transport",
  "transporter_id": "transporter-uuid",
  "transportation_cost": 8000.00  // Shared transportation cost
}
# Response: { "id": "isp-1" }

# Step 3: Create Lots for each sauda
POST /api/v1/lots
{ "sauda_id": "sauda-1", "lot_number": "LOT-001", "received_weight": 1000, "rate": 85.50, ... }
# Response: { "id": "lot-1" }

POST /api/v1/lots
{ "sauda_id": "sauda-1", "lot_number": "LOT-002", "received_weight": 2000, "rate": 85.50, ... }
# Response: { "id": "lot-2" }

POST /api/v1/lots
{ "sauda_id": "sauda-2", "lot_number": "LOT-003", "received_weight": 1500, "rate": 60.00, ... }
# Response: { "id": "lot-3" }

# Step 4: Create Purchase aggregating everything
POST /api/v1/purchases
{
  "vendor_id": "vendor-uuid",
  "purchase_date": "2024-01-15",
  "sauda_ids": ["sauda-1", "sauda-2"],      // Multiple saudas
  "inward_slip_pass_ids": ["isp-1"],        // One ISP (linked to both saudas)
  "lot_ids": ["lot-1", "lot-2", "lot-3"],  // All lots
  "cash_discount": 2000.00,
  "transportation_cost": 8000.00,
  "broker_commission": 2.5,
  "igst_percentage": 5.0
}
# Response: {
#   "total_weight": 4500.00,  // Sum of all linked lots
#   "total_amount": 345,250.00,  // Calculated from all lots
#   ...
# }
```

### Example 3: Dynamic Linking (Link/Unlink Entities)

```bash
# Create Purchase first
POST /api/v1/purchases
{
  "vendor_id": "vendor-uuid",
  "purchase_date": "2024-01-15"
}
# Response: { "id": "purchase-1" }

# Later, link saudas
POST /api/v1/purchases/purchase-1/link-saudas
{
  "sauda_ids": ["sauda-1", "sauda-2"]
}

# Link ISPs
POST /api/v1/purchases/purchase-1/link-inward-slip-passes
{
  "inward_slip_pass_ids": ["isp-1", "isp-2"]
}

# Link lots (required for calculations)
POST /api/v1/purchases/purchase-1/link-lots
{
  "lot_ids": ["lot-1", "lot-2", "lot-3"]
}

# Recalculate totals after linking
POST /api/v1/purchases/purchase-1/recalculate-totals

# Unlink a lot if needed
DELETE /api/v1/purchases/purchase-1/unlink-lot/lot-3

# Recalculate again
POST /api/v1/purchases/purchase-1/recalculate-totals
```

---

## Best Practices

### 1. Entity Creation Order

**Recommended Order:**
1. Create Saudas first (independent)
2. Create Inward Slip Passes (link to saudas via `sauda_ids[]`)
3. Create Lots (link to saudas via `sauda_id`)
4. Create Purchase (link all entities via arrays)
5. Create Payment Advice (link to purchase)

**Note**: Entities can be created in any order, but linking should follow this sequence for logical flow.

### 2. Linking Strategy

**Option A: Link During Creation**
```json
POST /api/v1/purchases
{
  "vendor_id": "uuid",
  "purchase_date": "2024-01-15",
  "sauda_ids": ["sauda-1", "sauda-2"],
  "lot_ids": ["lot-1", "lot-2"]
}
```

**Option B: Link After Creation**
```json
POST /api/v1/purchases
{
  "vendor_id": "uuid",
  "purchase_date": "2024-01-15"
}

POST /api/v1/purchases/:id/link-lots
{
  "lot_ids": ["lot-1", "lot-2"]
}
```

**Recommendation**: Link `lot_ids` during creation for automatic calculation. Other links can be added later.

### 3. Calculation Requirements

**For Automatic Calculations:**
- ✅ Must link at least one `lot_id` to purchase
- ✅ Purchase should have `rate` (or will use from first linked sauda)
- ✅ Optional: `cash_discount`, `transportation_cost`, `broker_commission`, `igst_percentage`

**Calculation Trigger:**
- Automatic on purchase creation (if `lot_ids` provided)
- Manual via `POST /api/v1/purchases/:id/recalculate-totals`

### 4. Transportation Cost Handling

**Important**: Transportation costs are stored at **ISP level**, not Sauda level.

- Each ISP can have its own `transporter_id` and `transportation_cost`
- Multiple ISPs for the same sauda can have different transportation costs
- Purchase-level `transportation_cost` is a separate override (not aggregated from ISPs)

**Example:**
```
Sauda-1
  ├── ISP-1 (transporter: T1, cost: 5000)
  └── ISP-2 (transporter: T2, cost: 6000)

Purchase can use:
- Purchase-level transportation_cost: 8000 (override)
- OR aggregate from ISPs (legacy calculation)
```

### 5. Rate Resolution

When creating a Purchase:
- If `rate` is provided → use it
- If `rate` is NOT provided → use `rate` from first linked sauda
- If no saudas linked → `rate` is required

### 6. Data Integrity

**Foreign Key Constraints:**
- Deleting a Purchase → Automatically unlinks all entities (CASCADE)
- Deleting a Sauda/ISP/Lot → Prevented if linked to any Purchase (RESTRICT)

**Best Practice**: Always check linked entities before deletion:
```http
GET /api/v1/purchases/:id/linked-entities
```

### 7. Error Handling

Common Errors:
- `Sauda not found`: Verify sauda exists before linking
- `Lot not found`: Verify lot exists and has correct `sauda_id`
- `No lots linked`: Provide `lot_ids` for calculations
- `Invalid rate`: Provide `rate` or link at least one sauda

### 8. Performance Considerations

**Indexes:**
- All junction tables have indexes on foreign keys
- GIN indexes on JSONB columns (contact_persons, etc.)

**Query Optimization:**
- Use `GET /api/v1/purchases/:id/linked-entities` instead of multiple queries
- Batch link operations when possible
- Recalculate totals only when needed

---

## Summary

The Purchase Flow backend provides:

1. **Flexible Entity Management**: Independent creation and dynamic linking
2. **Many-to-Many Relationships**: Via junction tables for maximum flexibility
3. **Automatic Calculations**: From linked lots with Purchase-level overrides
4. **Transportation at ISP Level**: Each ISP tracks its own transportation details
5. **Purchase-Level Accounting**: Cash discount, transportation cost, broker commission managed at Purchase
6. **Payment Advice with Charges**: Final net payable calculation with additional charges

This architecture enables complex purchase scenarios while maintaining data integrity and automatic calculation capabilities.

