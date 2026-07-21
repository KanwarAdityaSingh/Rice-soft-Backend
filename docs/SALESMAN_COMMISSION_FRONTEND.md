# Salesman Commission, Areas & Reports — Frontend Implementation Guide

Backend is ready (migrations `185` + `186`). This doc is the UI contract: screens, payloads, validation, and report wiring.

---

## 1. Product summary (what to build)

| Area | What the UI does |
|------|------------------|
| **Salesperson master** | Multi-select which commission types this person *can* use; assign geography; allocate customers. No rupee rates on master. |
| **Sales sauda** | When attaching a salesman (sale only), pick **one** enabled type and enter rates. Snapshot saved on the sauda. |
| **Automatic ledger** | No UI action on dispatch/credit-note confirm — backend creates pending commission / reversal. |
| **Commission desk** | List ledger rows; approve; mark paid. |
| **Reports** | Monthly performance, returns, commission (tx / monthly), outstanding ageing. |

### Locked business rules (do not reinvent)

- Option 4 rates keyed by `products.rice_type` (not product name / PR11).
- Commission **earned** on invoice dispatch **confirm** (not sauda finalize).
- Credit note **confirm** reverses qty-based commission (not `fixed_per_transaction`).
- **No commission** on `movement_type = godown_transfer`.
- Outstanding v1 = full invoice; due date = `dispatch_date + payment_terms`.

---

## 2. API base

All routes under `/api/v1`, authenticated.

---

## 3. Screen A — Salesperson master

### 3.1 Load type options

```
GET /api/v1/salesmen/commission-types
```

Response:

```json
[
  { "value": "per_kg", "label": "Fixed amount per kg" },
  { "value": "percent_of_sale", "label": "Percentage on sale value" },
  { "value": "fixed_per_transaction", "label": "Fixed amount per transaction" },
  { "value": "by_rice_quality", "label": "Commission by rice quality" },
  { "value": "by_customer", "label": "Commission by customer" }
]
```

Use for multi-select checkboxes / chips on create & edit.

### 3.2 Create

```
POST /api/v1/salesmen/createSalesman
```

New fields (in addition to existing master fields):

```json
{
  "name": "Ravi Kumar",
  "phone": "9876543210",
  "commission_types": ["per_kg", "by_rice_quality", "percent_of_sale"],
  "assigned_areas": [
    {
      "state": "Madhya Pradesh",
      "district": "Indore",
      "city": "Indore",
      "territory": "West MP"
    }
  ],
  "allocated_sales_party_ids": [
    "uuid-of-sales-party-1",
    "uuid-of-sales-party-2"
  ]
}
```

| Field | UI | Notes |
|-------|----|-------|
| `commission_types` | Multi-select | Empty = no commission allowed on saudas |
| `assigned_areas` | Repeatable rows | At least one of state / district / city / territory per row |
| `allocated_sales_party_ids` | Multi party picker | Replace-set on update — send full list |

### 3.3 Update

```
POST /api/v1/salesmen/updateSalesman/:id
```

Same new fields. **Replace-set semantics**:

- Sending `assigned_areas: []` clears all areas.
- Sending `allocated_sales_party_ids: []` clears all allocations.
- Omitting a field leaves it unchanged.

### 3.4 Get detail (edit form)

```
GET /api/v1/salesmen/getSalesmanById/:id
```

Response extras:

```json
{
  "commission_types": ["per_kg", "by_rice_quality"],
  "assigned_areas": [
    {
      "id": "...",
      "state": "Madhya Pradesh",
      "district": "Indore",
      "city": "Indore",
      "territory": "West MP"
    }
  ],
  "customer_allocations": [
    {
      "id": "...",
      "sales_party_id": "...",
      "sales_party_name": "ABC Traders"
    }
  ]
}
```

On edit submit, map `customer_allocations` → `allocated_sales_party_ids`.

### 3.5 List

```
GET /api/v1/salesmen/getAllSalesmen
```

Includes `commission_types`; does **not** embed areas/allocations (keep list light). Load detail for edit.

### 3.6 Suggested master UI layout

1. Existing personal / KYC / salary blocks  
2. **Commission eligibility** — multi-select of 5 types  
3. **Assigned area** — table: State | District | City | Territory | Add/Remove  
4. **Customer allocation** — multi-select sales parties (searchable)

---

## 4. Screen B — Sales sauda (attach salesman + commission)

### 4.1 When to show commission UI

| Condition | Show commission? |
|-----------|------------------|
| `movement_type === "sale"` and `salesman_id` set | Yes |
| `movement_type === "godown_transfer"` | No — hide / disable; do not send commission fields |
| No salesman | No — clear type + config |

Editable only while sauda is **`draft`**.

### 4.2 UX flow

1. User selects `salesman_id`.  
2. `GET getSalesmanById` → use `commission_types` as the **only** options in a single-select.  
3. User picks one type → show the matching rate form (see below).  
4. On save, send type + config together.

### 4.3 Create / update payload

```
POST /api/v1/sales-saudas/...   (existing create/update)
```

```json
{
  "sales_party_id": "...",
  "salesman_id": "...",
  "salesman_commission_type": "by_rice_quality",
  "salesman_commission_config": {
    "rates": [
      { "rice_type": "basmati", "rate_per_kg": 0.6 },
      { "rice_type": "steam_basmati", "rate_per_kg": 0.3 }
    ]
  },
  "sauda_type": "ex",
  "movement_type": "sale",
  "payment_terms": 30,
  "lines": [ ... ]
}
```

**Rules**

- `salesman_commission_type` and `salesman_commission_config` are **paired** (both set or both omitted).  
- To clear commission but keep salesman: send both as `null`.  
- Type must be ∈ that salesman’s `commission_types`.

### 4.4 Config forms by type

#### `per_kg`

```json
{ "rate_per_kg": 0.2 }
```

UI: number input “₹ per kg”.

#### `percent_of_sale`

```json
{ "percent": 1 }
```

UI: number 0–100 “% of sale”.

#### `fixed_per_transaction`

```json
{ "amount": 500 }
```

UI: number “₹ per sale” (backend accrues once per sauda on first dispatch confirm).

#### `by_rice_quality`

```json
{
  "rates": [
    { "rice_type": "basmati", "rate_per_kg": 0.6 },
    { "rice_type": "steam_basmati", "rate_per_kg": 0.3 }
  ]
}
```

Allowed `rice_type` values:

`basmati` | `non_basmati` | `parboiled` | `raw` | `raw_basmati` | `steam_basmati` | `white_sella` | `golden_sella`

**UX tip:** Derive distinct `rice_type`s from selected line products and require a rate for each before save. Backend also validates on create/update/finalize.

#### `by_customer`

```json
{ "basis": "per_kg", "value": 0.4 }
```

or

```json
{ "basis": "percent_of_sale", "value": 1 }
```

UI: basis toggle + value. Party is already on the sauda header (this is “customer-negotiated terms for this deal”).

### 4.5 Response fields to display

```json
{
  "salesman_id": "...",
  "salesman_name": "Ravi Kumar",
  "salesman_commission_type": "per_kg",
  "salesman_commission_config": { "rate_per_kg": 0.2 },
  "salesman_commission_preview": 120.5
}
```

Show `salesman_commission_preview` as “Estimated commission (preview)” — not the final ledger amount (final is on dispatch confirm).

---

## 5. Screen C — Commission desk (ledger)

No create form. Rows appear after dispatch / return confirms.

### 5.1 List

```
GET /api/v1/salesmen/commission-entries?salesman_id=&status=&from=&to=
```

| Query | Required | Notes |
|-------|----------|-------|
| `salesman_id` | No | Filter |
| `status` | No | `pending` \| `approved` \| `paid` |
| `from` / `to` | No | ISO date on `created_at` |

Row fields useful for table:

- `entry_type`: `accrual` \| `reversal`  
- `commission_type`, `commission_amount` (reversals are **negative**)  
- `basis_quantity`, `basis_sale_amount`  
- `status`  
- `invoice_number`, `order_number`, `credit_note_number`, `party_name`, `salesman_name`

### 5.2 Detail

```
GET /api/v1/salesmen/commission-entries/:id
```

### 5.3 Approve

```
POST /api/v1/salesmen/commission-entries/:id/approve
```

Only from `pending`.

### 5.4 Mark paid

```
POST /api/v1/salesmen/commission-entries/:id/mark-paid
```

From `pending` or `approved`.

### 5.5 Suggested UI

- Filters: salesman, status tabs (All / Pending / Approved / Paid), date range  
- Columns: Date, Salesman, Party, Invoice / CN, Type, Entry, Amount, Status, Actions  
- Actions: Approve (if pending), Mark paid  
- Style reversals in red / with minus sign

---

## 6. Screen D — Reports

### 6.1 Monthly salesperson report

```
GET /api/v1/salesmen/reports/monthly?salesman_id={uuid}&from=2026-04-01&to=2026-04-30
```

`salesman_id` required. `from` / `to` optional ISO dates.

Response shape:

```json
{
  "salesman_id": "...",
  "salesman_name": "Ravi Kumar",
  "from": "2026-04-01",
  "to": "2026-04-30",
  "customer_count": 12,
  "order_count": 20,
  "total_bags": 500,
  "total_quantity": 25000,
  "total_sale_amount": 1250000,
  "new_customers_added": 3,
  "by_rice_quality": [
    {
      "rice_type": "basmati",
      "bags": 100,
      "quantity": 5000,
      "sale_amount": 400000
    }
  ]
}
```

UI: KPI cards + rice-quality breakdown table. Based on **confirmed dispatches** only.

### 6.2 Sales return report

```
GET /api/v1/salesmen/reports/returns?salesman_id={uuid}&from=&to=
```

Row fields:

| Field | Display |
|-------|---------|
| `sale_invoice` | Sale invoice |
| `return_date` | Return date |
| `customer` | Customer |
| `rice_type` | Rice quality |
| `bags` | Bags (may be null) |
| `quantity` | Qty kg |
| `return_amount` | Return ₹ |
| `reason` | Reason |

### 6.3 Commission report

```
GET /api/v1/salesmen/reports/commission?salesman_id=&status=&from=&to=&view=transaction
```

`view=transaction` (default):

```json
{
  "view": "transaction",
  "rows": [ /* same as commission-entries */ ],
  "totals": {
    "pending": 1000,
    "approved": 500,
    "paid": 200,
    "net": 1700
  }
}
```

`view=monthly`:

```json
{
  "view": "monthly",
  "rows": [
    {
      "month": "2026-04",
      "salesman_id": "...",
      "salesman_name": "...",
      "total_commission": 1700,
      "pending": 1000,
      "approved": 500,
      "paid": 200
    }
  ]
}
```

UI: toggle Transaction | Monthly; status filter; link rows to commission desk actions if needed.

### 6.4 Outstanding report

```
GET /api/v1/salesmen/reports/outstanding?salesman_id={uuid}
```

```json
[
  {
    "salesman_id": "...",
    "salesman_name": "...",
    "party_name": "ABC Traders",
    "invoice_number": "...",
    "invoice_date": "2026-04-01",
    "due_date": "2026-05-01",
    "payment_terms": 30,
    "outstanding_amount": 125000,
    "ageing_days": 15,
    "ageing_bucket": "1-30"
  }
]
```

Ageing buckets: `current` | `1-30` | `31-60` | `61-90` | `90+`.

**UI copy:** “Outstanding = full invoice (payments not tracked yet).”

---

## 7. Frontend type helpers (suggested)

```ts
type SalesmanCommissionType =
  | 'per_kg'
  | 'percent_of_sale'
  | 'fixed_per_transaction'
  | 'by_rice_quality'
  | 'by_customer';

type CommissionRiceType =
  | 'basmati'
  | 'non_basmati'
  | 'parboiled'
  | 'raw'
  | 'raw_basmati'
  | 'steam_basmati'
  | 'white_sella'
  | 'golden_sella';

type SalesmanCommissionConfig =
  | { rate_per_kg: number }
  | { percent: number }
  | { amount: number }
  | { rates: Array<{ rice_type: CommissionRiceType; rate_per_kg: number }> }
  | { basis: 'per_kg' | 'percent_of_sale'; value: number };
```

Switch on `salesman_commission_type` to render the correct form and to serialize config.

---

## 8. Error handling (common backend messages)

| Situation | Expect |
|-----------|--------|
| Type not in salesman list | `Commission type '…' is not enabled for this salesman` |
| Godown transfer + commission | `Commission is not allowed for godown_transfer` |
| Missing rice rates | `Commission rates missing for rice qualities on lines: …` |
| Type/config unpaired | Validation: required together |
| Approve non-pending | Conflict |

Surface these under the commission block on the sauda form.

---

## 9. Implementation checklist (frontend)

**Master**

- [ ] Multi-select `commission_types`  
- [ ] Assigned areas editor (replace-set)  
- [ ] Customer allocation multi-select (replace-set)  
- [ ] Load options from `/commission-types`

**Sauda**

- [ ] Hide commission on godown transfer  
- [ ] Single-select type from salesman’s enabled list  
- [ ] Dynamic rate form per type  
- [ ] Auto-fill rice quality rows from line products  
- [ ] Show commission preview from response  
- [ ] Draft-only edit

**Commission desk**

- [ ] List + filters  
- [ ] Approve / Mark paid actions  
- [ ] Show accrual vs reversal

**Reports**

- [ ] Monthly KPIs + rice breakdown  
- [ ] Returns table  
- [ ] Commission transaction + monthly views  
- [ ] Outstanding + ageing buckets + disclaimer

---

## 10. Out of scope (backend not built yet)

- Master-level default rate cards (prefill) — rates only on sauda today  
- Partial payment / collections → outstanding stays full invoice until AR exists  
- PR11 / product-level commission keys — use `rice_type` only  

---

## 11. Migrations to run before QA

1. `185_salesman_commission_and_areas.sql`  
2. `186_salesman_commission_entries.sql`  
