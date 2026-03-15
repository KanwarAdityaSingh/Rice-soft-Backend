# Sales Module – Frontend Implementation Spec

This document describes the Sales Module backend so the frontend can implement screens and flows. Each entity (Sales Sauda, Invoice Dispatch, E-Invoice, E-Way Bill, Inventory Ledger, Credit Note) exists independently; the backend enforces relationships and order of operations where required.

---

## 1. API Base and Authentication

- **Base URL:** `{host}/api/v1` (e.g. `http://localhost:3000/api/v1`).
- **Auth:** All sales endpoints require authentication. Send `Authorization: Bearer <token>`.
- **Login:** `POST /auth/loginUser` with body `{ "username": "...", "password": "..." }`. Response: `{ success: true, data: { token, user, ... }, ... }`. Use `data.token` for subsequent requests.
- **Response shape:** All endpoints return `{ success: true, data: <payload>, message?: string, timestamp: string }` on success. Errors use standard HTTP status and an error payload.

---

## 2. Routes Reference

All routes are under the base. `:id` denotes UUID path parameter.

| Method | Path | Description |
|--------|------|-------------|
| **Sales Sauda** | | |
| GET | `/sales-saudas` | List sales saudas (optional query: `customer_id`, `status`) |
| GET | `/sales-saudas/:id` | Get one sales sauda with lines |
| POST | `/sales-saudas` | Create sales sauda |
| PUT | `/sales-saudas/:id` | Update sales sauda (draft only) |
| POST | `/sales-saudas/:id/finalize` | Finalize sauda → order |
| DELETE | `/sales-saudas/:id` | Delete sales sauda (draft only) |
| **Invoice Dispatch** | | |
| GET | `/invoice-dispatches` | List invoice dispatches (optional query: `sales_sauda_id`, `status`) |
| GET | `/invoice-dispatches/:id` | Get one invoice dispatch with lines |
| POST | `/invoice-dispatches` | Create invoice dispatch |
| POST | `/invoice-dispatches/:id/confirm` | Confirm dispatch (deducts inventory) |
| GET | `/invoice-dispatches/:id/e-invoice` | Get e-invoice for dispatch (null if not yet generated) |
| POST | `/invoice-dispatches/:id/e-invoice` | Generate e-invoice for dispatch (no body) |
| GET | `/invoice-dispatches/:id/e-way-bill` | Get e-way bill(s) for dispatch (array; empty if none) |
| POST | `/invoice-dispatches/:id/e-way-bill` | Generate e-way bill for dispatch (body optional) |
| **Inventory Ledger** | | |
| GET | `/inventory-ledger` | List ledger entries (query: `product_id`, `source_type`, `from_date`, `to_date`, `limit`, `offset`) |
| **Credit Note** | | |
| GET | `/credit-notes` | List credit notes (optional query: `invoice_dispatch_id`, `status`) |
| GET | `/credit-notes/:id` | Get one credit note with lines |
| POST | `/credit-notes` | Create credit note |
| POST | `/credit-notes/:id/confirm` | Confirm credit note (restores inventory) |

---

## 3. Entities and Request/Response Shapes

### 3.1 Sales Sauda

**Purpose:** A sales order (sauda) with a customer and line items (product, quantity, rate). Created as draft; can be updated until finalized; after finalize it becomes an order and gets an `order_number`.

**Status:** `draft` | `order` | `cancelled`.

**List:** `GET /sales-saudas?customer_id=<uuid>&status=draft|order|cancelled`  
Response `data`: array of sales saudas (without `lines` in list).

**Get by id:** `GET /sales-saudas/:id`  
Response `data`: single object with `lines` array.

**Create:** `POST /sales-saudas`  
Body:
```json
{
  "customer_id": "uuid",
  "status": "draft",
  "sauda_date": "YYYY-MM-DD",
  "notes": "string",
  "amount": number,
  "lines": [
    {
      "product_id": "uuid",
      "packaging_id": "uuid or omit",
      "quantity": number,
      "quantity_unit": "kg",
      "rate": number,
      "sort_order": number
    }
  ]
}
```
- `customer_id` required (must be existing vendor id; use vendors with type `seller` or `both` as customers).
- `amount` optional; total amount of the sauda (sent by frontend on create/update). Stored on the header; if omitted, defaults to 0.
- `lines` optional; if provided, each line requires `product_id`, `quantity`, `rate`. `quantity_unit` defaults to `kg`. Backend computes `amount` per line.
- **Bag (packaging) flow:** Optionally send `packaging_id` per line. Backend validates that the packaging belongs to the line’s product; invalid or missing packaging returns a validation error. Flow: Brand → Product → Bags (packaging options for that product) → user selects one or more bags with quantities per line.

**Update:** `PUT /sales-saudas/:id`  
Body: same as create (all fields optional). Only allowed when status is `draft`. If `lines` is sent, existing lines are replaced.

**Finalize:** `POST /sales-saudas/:id/finalize`  
No body. Only allowed when status is `draft` and sauda has at least one line. Sets status to `order` and assigns `order_number` (e.g. SO-001).

**Delete:** `DELETE /sales-saudas/:id`  
Only allowed when status is `draft`.

**Response shape (single/list item):**
- `id`, `customer_id`, `status`, `order_number` (null until finalized), `sauda_date`, `notes`, `amount` (total amount), `created_at`, `updated_at`
- When `lines` present: array of `{ id, sales_sauda_id, product_id, packaging_id, quantity, quantity_unit, rate, amount, sort_order, created_at, updated_at }`

---

### 3.2 Invoice Dispatch

**Purpose:** An outbound invoice/dispatch against a finalized sales sauda. Holds party details (name, address, GST, PAN) copied from the customer vendor, and optional transport (transporter, vehicle, distance, route). Lines are copied from the sales sauda at create time (including `packaging_id` when present). Inventory is deducted only when the dispatch is confirmed; when a line has `packaging_id`, deduction is from that product+packaging only (FIFO by batch within that bag).

**Status:** `draft` | `confirmed`.

**List:** `GET /invoice-dispatches?sales_sauda_id=<uuid>&status=draft|confirmed`  
Response `data`: array of invoice dispatches (without `lines` in list).

**Get by id:** `GET /invoice-dispatches/:id`  
Response `data`: single object with `lines` array.

**Create:** `POST /invoice-dispatches`  
Body:
```json
{
  "sales_sauda_id": "uuid",
  "internal_invoice_number": "string",
  "dispatch_date": "YYYY-MM-DD",
  "transporter_id": "uuid or null",
  "vehicle_id": "uuid or null",
  "distance_km": number,
  "route_description": "string"
}
```
- `sales_sauda_id` and `internal_invoice_number` required.
- Sales sauda must be finalized (status `order`). Backend resolves customer from sauda and sets `party_name`, `party_address`, `party_gst_number`, `party_pan_number` on the dispatch. Lines are created from the sales sauda lines; frontend does not send lines.

**Confirm:** `POST /invoice-dispatches/:id/confirm`  
No body. Allocates finished goods inventory (FIFO), deducts stock, and writes inventory ledger entries. Only allowed when dispatch is `draft` and has sufficient FGI.

**Response shape (single/list item):**
- `id`, `sales_sauda_id`, `internal_invoice_number`, `dispatch_date`, `party_name`, `party_address`, `party_gst_number`, `party_pan_number`, `transporter_id`, `vehicle_id`, `distance_km`, `route_description`, `status`, `created_at`, `updated_at`
- When `lines` present: array of `{ id, invoice_dispatch_id, sales_sauda_line_id, product_id, packaging_id, quantity, quantity_unit, rate, amount, created_at, updated_at }`

---

### 3.3 E-Invoice

**Purpose:** E-Invoice (IRN) for a confirmed invoice dispatch. Backend currently uses a placeholder implementation; IRN and related fields are stored for later replacement with a real e-invoice API.

**Get:** `GET /invoice-dispatches/:id/e-invoice`  
No body. Returns the e-invoice for this dispatch if one exists; otherwise `data` is `null` (200 OK).

**Generate:** `POST /invoice-dispatches/:id/e-invoice`  
No body. Invoice dispatch must be `confirmed`. If e-invoice already exists for this dispatch, the same record is returned (idempotent).

Response `data`:
- `id`, `invoice_dispatch_id`, `irn`, `acknowledgement_number`, `ack_date`, `qr_code_content`, `government_response_payload`, `status`, `created_at`, `updated_at`

---

### 3.4 E-Way Bill

**Purpose:** E-Way Bill for a confirmed invoice dispatch. Backend currently uses a placeholder implementation; e-way bill number and transport details are stored.

**Get:** `GET /invoice-dispatches/:id/e-way-bill`  
No body. Returns an **array** of e-way bill records for this dispatch (newest first); empty array if none.

**Generate:** `POST /invoice-dispatches/:id/e-way-bill`  
Body (all optional):
```json
{
  "vehicle_number": "string",
  "distance_km": number,
  "route": "string",
  "transporter_id": "uuid"
}
```
Invoice dispatch must be `confirmed`. If e-way bill already exists for this dispatch, the same record is returned (idempotent).

Response `data`:
- `id`, `invoice_dispatch_id`, `credit_note_id`, `eway_bill_number`, `vehicle_number`, `distance_km`, `route`, `transporter_id`, `payload`, `created_at`, `updated_at`

---

### 3.5 Inventory Ledger

**Purpose:** Read-only log of inventory movements. Each entry is a quantity change (positive or negative) for a product, with source type and reference to the document that caused it.

**List:** `GET /inventory-ledger?product_id=<uuid>&source_type=<type>&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&limit=100&offset=0`  
- `source_type`: `purchase_inward` | `sales_dispatch` | `sale_return` | `adjustment`  
- `limit` max 500; default 100.

Response `data`: array of:
- `id`, `product_id`, `quantity_change` (signed number), `source_type`, `source_id`, `stock_before`, `stock_after`, `reference_type`, `reference_id`, `batch_id`, `packaging_id`, `created_at`, `created_by`

---

### 3.6 Credit Note

**Purpose:** A return/credit against an invoice dispatch. Lines specify which dispatch lines are being returned and how much. Inventory is restored only when the credit note is confirmed.

**Status:** `draft` | `confirmed`.

**List:** `GET /credit-notes?invoice_dispatch_id=<uuid>&status=draft|confirmed`  
Response `data`: array of credit notes (without `lines` in list).

**Get by id:** `GET /credit-notes/:id`  
Response `data`: single object with `lines` array.

**Create:** `POST /credit-notes`  
Body:
```json
{
  "invoice_dispatch_id": "uuid",
  "sales_sauda_id": "uuid",
  "credit_note_number": "string",
  "credit_note_date": "YYYY-MM-DD",
  "reason": "string",
  "lines": [
    {
      "invoice_dispatch_line_id": "uuid",
      "product_id": "uuid",
      "quantity_returned": number
    }
  ]
}
```
- All of `invoice_dispatch_id`, `sales_sauda_id`, `credit_note_number`, and `lines` (at least one line) required.
- Each line must reference an existing invoice dispatch line; `quantity_returned` cannot exceed the dispatched quantity for that line.

**Confirm:** `POST /credit-notes/:id/confirm`  
No body. Restores finished goods inventory (using allocation when possible) and writes inventory ledger entries. Only allowed when credit note is `draft`.

**Response shape (single/list item):**
- `id`, `invoice_dispatch_id`, `sales_sauda_id`, `credit_note_number`, `credit_note_date`, `status`, `reason`, `created_at`, `updated_at`
- When `lines` present: array of `{ id, credit_note_id, invoice_dispatch_line_id, product_id, quantity_returned, created_at, updated_at }`

---

## 4. Business Flow

The following describes the order of operations and constraints so the frontend can implement flows correctly. Entities remain independent; the backend enforces these rules.

### 4.1 Sales Sauda

1. **Create** a sales sauda with `customer_id` (vendor used as customer) and optional `lines` (product, quantity, rate). Status is `draft`.
2. **Update** (and **delete**) are allowed only while status is `draft`.
3. **Finalize** is allowed only when status is `draft` and there is at least one line. After finalize, status becomes `order` and `order_number` is set. No further update or delete.

### 4.2 Invoice Dispatch

1. **Create** an invoice dispatch only for a sales sauda that is finalized (status `order`). Provide `sales_sauda_id`, `internal_invoice_number`, and optionally dispatch date, transporter, vehicle, distance, route. Backend fills party details from the customer vendor and creates lines from the sales sauda lines.
2. **Confirm** the dispatch when ready to commit the sale. Confirm allocates FGI (FIFO), deducts stock, and writes inventory ledger entries. Confirm is allowed only when status is `draft`. After confirm, status is `confirmed` and inventory is reduced.

### 4.3 E-Invoice and E-Way Bill

1. **E-Invoice** can be generated only for an invoice dispatch that is `confirmed`. Call `POST /invoice-dispatches/:id/e-invoice` (no body). Idempotent.
2. **E-Way Bill** can be generated only for an invoice dispatch that is `confirmed`. Call `POST /invoice-dispatches/:id/e-way-bill` with optional vehicle, distance, route, transporter. Idempotent.

### 4.4 Credit Note

1. **Create** a credit note with `invoice_dispatch_id`, `sales_sauda_id`, `credit_note_number`, and `lines` (each line: `invoice_dispatch_line_id`, `product_id`, `quantity_returned`). The dispatch and its lines must exist; quantity returned per line cannot exceed the dispatched quantity.
2. **Confirm** the credit note when the return is final. Confirm restores FGI and writes ledger entries. Allowed only when credit note is `draft`.

### 4.5 Inventory Ledger

- **Read-only.** Use `GET /inventory-ledger` with filters (`product_id`, `source_type`, `from_date`, `to_date`) to show sales-related movements: use `source_type=sales_dispatch` for dispatch deductions and `source_type=sale_return` for credit-note returns.

### 4.6 Summary of When Inventory Changes

- **Inventory is deducted** only when an invoice dispatch is **confirmed**.
- **Inventory is restored** only when a credit note is **confirmed**.
- Sales sauda create/update/finalize and invoice dispatch create do not change inventory.

---

## 5. Dependencies on Other APIs

The frontend will need these existing backend APIs to build sales screens:

- **Vendors (customers):** `GET /vendors/getAllVendors` (optionally filter by type `seller` or `both` for sales customers). Use for customer dropdown when creating sales sauda.
- **Products:** `GET /products` for product list and details when adding sales sauda lines.
- **Finished goods inventory:** `GET /inventory/finished-goods` (optional `product_id`, `batch_id`) to show available stock before confirming a dispatch.
- **Transporters:** `GET /transporters` for transporter list on invoice dispatch and e-way bill.
- **Vehicles:** `GET /vehicles` for vehicle list on invoice dispatch and e-way bill.
- **Packaging:** If the frontend allows selecting packaging per line, use the existing packaging API for options; `packaging_id` is optional on sales sauda lines.

---

## 6. Error Handling

- **404:** Resource not found (e.g. invalid id).
- **409 Conflict:** Business rule violation (e.g. finalize when not draft, confirm when already confirmed, delete non-draft sales sauda, e-invoice when dispatch not confirmed).
- **400 / 422:** Validation errors (e.g. missing required fields, invalid UUID, quantity exceeding available). Response body will describe the error.

The frontend should surface these appropriately and disable or hide actions that are not allowed for the current status (e.g. hide Update/Delete for sales sauda when status is `order`, or disable Confirm for invoice dispatch when already `confirmed`).

---

## 7. Backend Implementation Reference

The behaviour described above matches **`docs/SALES_MODULE_BACKEND_IMPLEMENTATION_SUMMARY.md`**, which documents when inventory is deducted (invoice dispatch **confirm** only) and restored (credit note **confirm** only), how the inventory ledger is written, and that FGI is added outside sales (e.g. batch production). This frontend spec is aligned with that implementation.

---

This spec is the single source of truth for the Sales Module backend behaviour and routes. Implement each entity’s list/detail/create/update/delete (and confirm/e-invoice/e-way-bill where applicable) so that the flow above is supported end-to-end.
