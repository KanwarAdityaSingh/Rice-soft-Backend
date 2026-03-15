# Sales Module – Backend Implementation Summary

This document walks through the complete sales backend implementation: flow, when inventory is added/deducted/restored, how the ledger is written, and how it aligns with the frontend spec.

---

## 1. Flow Overview

The sales backend has six main areas:

1. **Sales Sauda** – Draft sales order (customer + lines). No inventory impact.
2. **Invoice Dispatch** – Outbound invoice from a finalized sauda. Inventory is **deducted only on confirm**.
3. **E-Invoice / E-Way Bill** – Placeholder document generation for confirmed dispatches.
4. **Inventory Ledger** – Read-only log of movements; written by dispatch confirm and credit-note confirm.
5. **Credit Note** – Return against a confirmed dispatch. Inventory is **restored only on confirm**.

**Inventory rule:** Finished goods inventory (FGI) is **deducted** only when an invoice dispatch is **confirmed**, and **restored** only when a credit note is **confirmed**. Sales sauda and invoice dispatch **create** do not touch inventory.

---

## 2. Where Finished Goods Inventory Comes From (Not Sales)

Finished goods inventory is **added** outside the sales module:

- **Table:** `finished_goods_inventory` (product_id, batch_id, packaging_id, no_of_packets, total_weight).
- **When added:** When batch production completes (e.g. in `batch.service.ts`), new rows are inserted into `finished_goods_inventory`. Seeds and other production flows can also insert.
- Sales only **consumes** (dispatch confirm) and **returns** (credit-note confirm) this stock; it never creates FGI rows.

---

## 3. Sales Sauda (No Inventory)

**Location:** `src/services/sales-sauda.service.ts`, `src/dao/sales-sauda.dao.ts`, `src/dao/sales-sauda-line.dao.ts`.

**Create:** Validates customer (vendor) and products, inserts `sales_saudas` and `sales_sauda_lines`. Status is `draft`. No FGI or ledger interaction.

**Bag (packaging) + quantity flow:** Each line can optionally include `packaging_id`. When set, the backend validates that the packaging exists and belongs to the line’s `product_id` (via `packagingDAO.findById`); otherwise a validation error is thrown. This supports the flow: Brand → Product → Bags (packaging options) → user selects one or more bags with quantities per line.

**Update:** Allowed only when status is `draft`. Can replace lines. Same packaging validation applies when lines have `packaging_id`. No inventory.

**Finalize:** Allowed only when status is `draft` and there is at least one line. Sets status to `order` and assigns `order_number` (e.g. SO-001). No inventory.

**Delete:** Allowed only when status is `draft`. No inventory.

---

## 4. Invoice Dispatch – When Inventory Is Deducted

**Location:** `src/services/invoice-dispatch.service.ts`.

### 4.1 Create (No Inventory Change)

- Loads sales sauda (must be status `order`), loads customer vendor, copies party name/address/GST/PAN onto the dispatch.
- Inserts `invoice_dispatches` and `invoice_dispatch_lines` from sales sauda lines.
- **No** reads or writes to `finished_goods_inventory` or `inventory_ledger`.

### 4.2 Confirm – The Only Place Sales Deducts Inventory

**Trigger:** `POST /invoice-dispatches/:id/confirm` → `invoiceDispatchService.confirm(id, userId)`.

**What happens (inside a single DB transaction):**

1. **Per dispatch line** (quantity in kg):
   - Select FGI rows to deduct from:
     - If the line has **`packaging_id`** (from the sales sauda): only rows where `product_id` and `packaging_id` match that line (i.e. the **selected bag**). FIFO by batch within that set: `ORDER BY created_at ASC`, with `FOR UPDATE` to lock.
     - If `packaging_id` is null: same as before – all FGI for that `product_id`, FIFO by `created_at ASC` (backward compatible).
   - For each FGI row, deduct up to the remaining required kg:
     - Decrease `total_weight` (and optionally `no_of_packets` using packaging capacity).
     - Insert into **`invoice_dispatch_allocations`**: links dispatch line to FGI row and `quantity_deducted`.
     - Insert into **`inventory_ledger`**:
       - `quantity_change`: **negative** (e.g. -10)
       - `source_type`: **`sales_dispatch`**
       - `source_id`: invoice_dispatch id
       - `reference_type`: **`invoice_dispatch`**, `reference_id`: dispatch id
       - `stock_before` / `stock_after`: that FGI row’s weight before/after
       - `batch_id`, `packaging_id` from the FGI row
   - If required kg cannot be fully satisfied, the transaction throws (e.g. insufficient stock).

2. After all lines are processed, update `invoice_dispatches` set `status = 'confirmed'`.

**Summary:** Inventory is **removed** from `finished_goods_inventory` (and optionally packet count adjusted) only in **dispatch confirm**. Each deduction is recorded in **`inventory_ledger`** with `source_type = sales_dispatch` and in **`invoice_dispatch_allocations`** for traceability and for credit-note restore.

---

## 5. How the Inventory Ledger Is Written

**Location:** `src/dao/inventory-ledger.dao.ts`, `src/models/inventory-ledger.model.ts`.

**Table:** `inventory_ledger`  
Columns: `id`, `product_id`, `quantity_change`, `source_type`, `source_id`, `stock_before`, `stock_after`, `reference_type`, `reference_id`, `batch_id`, `packaging_id`, `created_at`, `created_by`.

**Source types:** `purchase_inward` | `sales_dispatch` | `sale_return` | `adjustment`.

**When ledger rows are created in the sales module:**

| Event | source_type | quantity_change | reference_type | reference_id |
|-------|-------------|-----------------|----------------|--------------|
| Invoice dispatch confirm | `sales_dispatch` | Negative (e.g. -10) | `invoice_dispatch` | dispatch id |
| Credit note confirm | `sale_return` | Positive (e.g. +5) | `credit_note` | credit note id |

- **Dispatch confirm:** One or more ledger rows per dispatch line (one per FGI row consumed), each with negative `quantity_change`, `source_type = sales_dispatch`, `reference_type = invoice_dispatch`.
- **Credit note confirm:** One or more ledger rows per credit note line (one per allocation or FGI row restored), each with positive `quantity_change`, `source_type = sale_return`, `reference_type = credit_note`.

**Read:** `GET /inventory-ledger` uses `inventoryLedgerDAO.find()` with optional filters: `product_id`, `source_type`, `from_date`, `to_date`, `limit`, `offset`. No writes from the API.

---

## 6. Credit Note – When Inventory Is Restored

**Location:** `src/services/credit-note.service.ts`.

### 6.1 Create (No Inventory Change)

- Validates invoice dispatch (must be `confirmed`) and that each line’s `quantity_returned` ≤ dispatched quantity.
- Inserts `credit_notes` and `credit_note_lines`. **No** FGI or ledger writes.

### 6.2 Confirm – The Only Place Sales Restores Inventory

**Trigger:** `POST /credit-notes/:id/confirm` → `creditNoteService.confirm(id, userId)`.

**What happens (inside a single DB transaction):**

1. **Per credit note line** (quantity returned):
   - **If** there are **invoice_dispatch_allocations** for that dispatch line:
     - For each allocation, restore up to `quantity_deducted` back to the **same** FGI row: increase `total_weight` (and `no_of_packets` if packaging known).
     - Insert **inventory_ledger** row: `quantity_change` **positive**, `source_type = sale_return`, `reference_type = credit_note`, `reference_id = credit_note id`, same batch/packaging as that FGI row.
   - **If** there are no allocations (edge case), find any FGI row for that product and add the quantity there; still write a ledger row with `sale_return` and `credit_note`.
   - Any remainder (e.g. partial restore across allocations) is applied to another FGI row for that product and a ledger row written.

2. Update `credit_notes` set `status = 'confirmed'`.

**Summary:** Inventory is **added back** to `finished_goods_inventory` only in **credit note confirm**. Restore prefers the same FGI rows that were deducted (via allocations); ledger entries use `source_type = sale_return` and `reference_type = credit_note`.

---

## 7. E-Invoice and E-Way Bill (Placeholders)

- **E-Invoice:** `POST /invoice-dispatches/:id/e-invoice` – dispatch must be `confirmed`. Stub creates/returns a row in `e_invoices` (e.g. placeholder IRN). No inventory or ledger.
- **E-Way Bill:** `POST /invoice-dispatches/:id/e-way-bill` – same; stub creates/returns a row in `e_way_bills` (e.g. placeholder EWB number). No inventory or ledger.

---

## 8. Tables and Relationships (Sales + Inventory)

- **sales_saudas** → customer (vendor), status draft/order/cancelled.  
- **sales_sauda_lines** → product, packaging (optional), quantity, rate, amount.  
- **invoice_dispatches** → sales_sauda_id, party_* from vendor; status draft/confirmed.  
- **invoice_dispatch_lines** → from sales sauda lines; product, packaging (optional), quantity, rate.  
- **invoice_dispatch_allocations** → links dispatch line to FGI row + quantity_deducted (filled on **dispatch confirm**).  
- **finished_goods_inventory** → product, batch, packaging, no_of_packets, total_weight; **updated** on dispatch confirm (deduct) and credit note confirm (restore).  
- **inventory_ledger** → one row per movement; **inserted** on dispatch confirm (negative, sales_dispatch) and credit note confirm (positive, sale_return).  
- **credit_notes** → invoice_dispatch_id, sales_sauda_id; status draft/confirmed.  
- **credit_note_lines** → invoice_dispatch_line_id, product_id, quantity_returned.

---

## 9. One-Page Summary: What / When / Where

| What | When | Where (backend) |
|------|------|------------------|
| FGI **added** | Batch production (non-sales) | `batch.service` / FGI insert |
| Sauda create/update/finalize/delete | User actions | No FGI or ledger change |
| Dispatch create | User action | No FGI or ledger change |
| **FGI deducted** | **Invoice dispatch confirm** | `invoice-dispatch.service.ts` → update FGI, insert allocations, insert ledger (sales_dispatch) |
| **FGI restored** | **Credit note confirm** | `credit-note.service.ts` → update FGI, insert ledger (sale_return) |
| **Ledger written** | Dispatch confirm + Credit note confirm | `inventoryLedgerDAO.create()` inside same transaction as FGI update |

---

## 10. Frontend Spec Alignment

The **Frontend Implementation Spec** (`docs/SALES_MODULE_FRONTEND_SPEC.md`) was checked against this backend implementation:

- **Routes and methods:** Match (sales-saudas, invoice-dispatches, inventory-ledger, credit-notes, e-invoice, e-way-bill).
- **Request/response shapes:** Match (create/update bodies, response fields including lines, status values).
- **Business flow:** Correct – sauda draft → finalize → order; dispatch draft → confirm (inventory deducted); credit note draft → confirm (inventory restored).
- **Inventory rules:** Spec states “Inventory is deducted only when an invoice dispatch is confirmed” and “Inventory is restored only when a credit note is confirmed” – matches backend.
- **Ledger:** Spec describes read-only GET with filters and source_type values (sales_dispatch, sale_return, etc.) – matches.
- **Dependencies:** Vendors, products, transporters, vehicles, finished goods, packaging – all exist and are used as described.

The frontend spec is **aligned** with the backend implementation and can be used as the single reference for building the Sales UI. For implementation details (FIFO, allocations, exact ledger fields), this backend summary is the source of truth.
