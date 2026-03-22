# Godown — Implementation (Backend & Data Model)

**Single source of truth** for how godown (warehouse) works in this codebase.  
**Frontend-only guide:** [`GODOWN_FRONTEND_INTEGRATION_GUIDE.md`](./GODOWN_FRONTEND_INTEGRATION_GUIDE.md)

---

## 1) Business intent

- **Godown** = physical warehouse; master data lives in **`godowns`** (GST, address, lat/long, **`contact_persons`** like vendors, active flag).
- **Stock is always in a godown.** Inventory and fulfillment are segregated by **`godown_id`**.
- **Purchase sauda, sales sauda, and payment advice** are treated as **commercial / provisional** documents: they **do not** store **`godown_id`** and expose **no** godown fields in the API.

---

## 2) Where `godown_id` exists (columns)

| Layer | Tables / entities |
|-------|-------------------|
| Master | `godowns` |
| Inward | `inward_slip_passes`, `inward_slip_lots`, `kaantas` |
| Production | `batches` |
| Sales fulfillment | `invoice_dispatches` |
| Stock & audit | `finished_goods_inventory`, `packets_inventory`, `lot_inventory`, `bags_inventory`, `inventory_ledger` |

**Payment advice, `saudas`, `sales_saudas`:** **`godown_id` removed** (see migration `111`).

---

## 3) Migrations (reference)

| Migration | Role |
|-----------|------|
| `108_add_godowns_and_segment_inventory.sql` | Introduces `godowns`, adds `godown_id` to stock/operational tables, backfill `MAIN`, indexes/uniques for per-godown inventory. |
| `109_add_godown_id_to_payment_advices.sql` | Historical: added PA godown (superseded by `111`). |
| `110_fix_godown_aware_audit_triggers.sql` | Audit trigger functions godown-aware for lot/bags inventory. |
| `111_remove_godown_from_saudas_sales_saudas_payment_advices.sql` | Drops `godown_id` from `saudas`, `sales_saudas`, `payment_advices` and related indexes. |
| `112_remove_godown_code_from_godowns.sql` | Drops `godown_code` from `godowns`; default godown in triggers/app fallbacks is earliest row by `created_at`. |
| `113_add_contact_persons_to_godowns.sql` | Adds `contact_persons` JSONB (vendor-shaped); backfills from legacy `contact_number` where present. |
| `114_remove_contact_number_from_godowns.sql` | Drops `contact_number`; phones live only under `contact_persons`. |

Apply with your usual migration command (e.g. `npm run migrate`).

---

## 4) Behavioral rules (backend)

### Inward chain

- **`inward_slip_passes.godown_id`** is set on ISP create/update (validated active godown).
- **Kaanta:** `godown_id` is taken from the **inward slip pass** (must match ISP); not from purchase sauda.
- **Lots:** Usually **auto-created** from kaanta in `kaanta.dao.ts` with the same `godown_id` as the kaanta. **Manual** `POST /lots` requires **`godown_id`** + active godown check.

### Production

- **`batches.godown_id`** required; lot consumption and packet/bag movements stay within that godown.

### Packaging (`POST /packaging`)

- **`initial_packets` > 0:** body must include **`godown_id`** (active godown). Initial empty-packet stock is written to **`packets_inventory`** for `(godown_id, packaging_id)`. If `initial_packets` is omitted or 0, **`godown_id`** is not required (no inventory row on create).

### Packaging (GET responses)

- **`GET /packaging`**, **`GET /packaging/:id`**, and create/update success bodies include **`packets_inventory`**: an array of `{ godown_id, godown_name, available_quantity }` for each godown that has empty-packet stock for that packaging (from `packets_inventory` joined to `godowns`). Empty array if there is no stock anywhere.

### Sales & dispatch

- **`sales_saudas`:** no `godown_id`.
- **`invoice_dispatches`:** **`godown_id` required on POST create**; `godownService.assertActive`; stock deduction / ledger use **`invoice_dispatches.godown_id`** (FIFO / FGI scoped to that godown). Credit notes follow dispatch godown.

### Payment advice

- No `godown_id` column; no derivation; list/get/create/update do not use godown.

### Purchase summary

- Optional **`?godown_id=`** scopes **lots** and **ISP-linked rows** in aggregations—not the sauda row (sauda has no godown column).

---

## 5) API summary

| Endpoint area | Godown |
|---------------|--------|
| `/godowns` | CRUD master |
| `/saudas`, `/sales-saudas` | No `godown_id` |
| `/payment-advices` | No `godown_id` |
| `/inward-slip-passes` | Body: `godown_id` where applicable; list: optional `?godown_id=` |
| `/kaantas` | From ISP server-side |
| `/lots` (manual create) | Body: **`godown_id` required** |
| `/batches` | Body: **`godown_id` required** |
| `/invoice-dispatches` POST | Body: **`godown_id` required** |
| `/packaging` POST | If **`initial_packets` > 0:** body **`godown_id`** required |
| `/inventory/*`, `/inventory-ledger` | Query: optional `?godown_id=` |
| `/purchase-summary/...` | Query: optional `?godown_id=` (scopes physical lines) |

---

## 6) Testing

- **`npm run test:godown-flow`** (runs **`src/scripts/test-godown-full-flow.ts`**) — requires DB, migrations applied, API at `TEST_BASE_URL` (default `http://localhost:3000/api/v1`), and admin credentials (`TEST_ADMIN_USERNAME` / `TEST_ADMIN_PASSWORD`, or defaults `admin` / `admin123`). It clears purchase transactional data, seeds masters, then exercises:
  - **Godowns** — create + list
  - **Inward slip passes & kaantas** — `godown_id` on create; list filters `?godown_id=`
  - **Lots & lot inventory** — auto lots + `GET /lots` and `GET /inventory/lots`
  - **Bags inventory** — post-kaanta `GET /inventory/bags?godown_id=`
  - **Recipes & batches** — `godown_id` on batch; rejects cross-godown recipe
  - **Packaging** — `initial_packets` + `godown_id`; `GET /packaging/:id` `packets_inventory`; `GET /inventory/packets`
  - **Finished goods, summary, hierarchical** — `GET /inventory/*?godown_id=`
  - **Sales sauda → invoice dispatch → confirm** — stock and ledger scoped to dispatch godown; credit note restore
  - **Payment advices** — no `godown_id` column (commercial)
  - **Purchase summary** — sauda scoping + ISP summary 404 when `godown_id` ≠ ISP’s godown

Optional hardening (not required for core correctness):

- Role-based access: restrict users to allowed godowns.
- CI: wire the integration script.
- Ongoing audit: ensure new list endpoints that touch stock remain consistent with `godown_id` filtering where appropriate.

---

## 7) Related documentation

| Document | Audience |
|----------|----------|
| **[`GODOWN_FRONTEND_INTEGRATION_GUIDE.md`](./GODOWN_FRONTEND_INTEGRATION_GUIDE.md)** | Frontend: forms, list filters, no global godown selector. |
| This file | Backend, DB, migrations, API contract. |
