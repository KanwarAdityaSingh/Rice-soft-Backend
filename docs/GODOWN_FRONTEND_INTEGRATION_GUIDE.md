# Godown — Frontend Implementation Guide

This document describes how to integrate **godown** (warehouse) in the UI **without** a global app-wide godown. Godown is chosen **where the business action happens** (forms that create or query physical stock), not from a single header selector.

---

## 1) Principles (read this first)

| Idea | What to do |
|------|------------|
| **Commercial vs physical** | **Purchase sauda**, **sales sauda**, and **payment advice** have **no** `godown_id` in the API (body, query, or response). Do not show or send godown on those entities. |
| **Physical stock** | **Inward slip pass**, **kaanta/lots**, **batches**, **invoice dispatch**, **inventory**, **ledger** are godown-scoped. The user picks godown **on the form** that creates or views that stock (or it is implied by the parent, e.g. kaanta → ISP). |
| **No global godown** | There is **no** requirement for a single “current godown” in Redux/context for the whole app. Each screen owns its filters and form fields. |
| **List pages** | For screens that list **inventory / ISPs / lots / kaantas / batches / dispatches**, add a **godown filter** (dropdown) **on that list page** when you need to scope results—not a separate “global” concept. |

---

## 2) Where the user selects godown (forms)

Use a **godown dropdown** (loaded from `GET /godowns`) on these **create/edit** flows when the backend requires `godown_id`:

| Flow | User action |
|------|----------------|
| **Inward slip pass** | Select godown when creating/editing the pass (required in API). |
| **Manual lot** (`POST /lots`) | Select godown (required). *Most lots are auto-created from kaanta and do not use this screen.* |
| **Batch** | Select godown on batch create (required). |
| **Invoice dispatch** | Select **fulfillment godown** when creating dispatch (required). This is **not** on sales sauda—dispatch creation must send `godown_id` explicitly. |
| **Packaging** (`POST /packaging`) | If the form sets **initial empty-packet quantity** (`initial_packets` > 0), send **`godown_id`** so stock is created in `packets_inventory` for that godown. Omit both if you only define the packaging spec (no initial stock). |

**Do not** add a godown field to:

- Purchase sauda
- Sales sauda  
- Payment advice

**Kaanta create:** Do **not** ask for godown in the form—the backend sets it from the **inward slip pass** the user already chose (ensure the selected ISP belongs to the intended godown by how you build the ISP list).

---

## 3) List screens and filters

When a list API supports `?godown_id=`, add a **filter dropdown on that list page** (optional “All” vs a specific godown):

- Inward slip passes  
- Lots  
- Kaantas  
- Batches  
- Invoice dispatches  
- Inventory endpoints (`/inventory/*`, `/inventory-ledger`)

**Purchase sauda / sales sauda / payment advice lists** do not take `godown_id` from the backend as a first-class filter on the document itself—if you need to narrow related physical data, filter **child lists** (e.g. ISPs by godown) or use **purchase summary** with `?godown_id=` as documented below.

---

## 4) API reference (concise)

Base path assumed: `/api/v1` (adjust to your client).

### Master

| Method | Path | Notes |
|--------|------|--------|
| GET | `/godowns` | Populate dropdowns; prefer active godowns. Each row includes **`contact_persons`** (same shape as vendors: `name`, `phones[]`, optional `emails[]`). |
| GET | `/godowns/lookupGST?gst_number=` (aliases: `/lookupgst`, `/lookup-gst`) | Same as **`/vendors/lookupGST`** (`gst_data`, `mapped_data`). If you call **`/godowns/:id`** by mistake with a non-UUID segment, the API returns a clear error pointing to this lookup. |
| GET/POST/PATCH/DELETE | `/godowns/:id` | Admin / master screens. **Create** requires **`contact_persons`** with at least one entry. |

### No `godown_id`

| Area | Behavior |
|------|----------|
| `GET/POST/PATCH` **`/saudas`** | No godown in body or response. |
| `GET/POST/PATCH` **`/sales-saudas`** | No godown in body or response. |
| **`/payment-advices`** | No godown anywhere. |

### Requires or returns `godown_id`

| Area | Behavior |
|------|----------|
| **`/inward-slip-passes`** | Create/update: **`godown_id` required** (per backend). List: optional `?godown_id=`. |
| **`/kaantas`** POST | Godown set server-side from ISP; user picks **ISP** (which already has a godown). |
| **`/lots`** POST (manual) | **`godown_id` required** in JSON body. |
| **`/batches`** POST | **`godown_id` required**. |
| **`/invoice-dispatches`** POST | **`godown_id` required** — fulfillment warehouse for stock deduction. |
| **`/inventory/*`**, **`/inventory-ledger`** | Use `?godown_id=` to scope reads. |

### Purchase summary

- `GET /purchase-summary/sauda/:id?godown_id=<uuid>` — optional; scopes **lots and ISP-linked rows** to that godown (wrong godown may show empty/zero physical lines).

---

## 5) Validation (mirror backend)

- **UUID** for every `godown_id` you send.
- **Dispatch:** Block submit until godown is selected (required).
- **ISP / batch / manual lot:** Same for required godown fields.
- **Optional:** After loading `/godowns`, disable inactive godowns in dropdowns if the API exposes `is_active`.

---

## 6) Data fetching and cache (per screen)

- **No** app-wide `selectedGodownId` is required.
- For React Query / SWR / Redux: include in the query key anything that changes the result, for example:
  - `['inward-slip-passes', { godownId: filterFromThisPage }]`
  - `['inventory-fg', { godownId, productId }]`
  - `['invoice-dispatches', { godownId, status }]`
- When the user changes the **filter on that list page**, refetch (or invalidate keys that include that filter).

Commercial entities:

- `['saudas', filters]` — **do not** put godown in the key for sauda rows (not godown-scoped).
- Same for sales saudas and payment advices.

---

## 7) UX copy hints

- **Invoice dispatch:** Label the field clearly, e.g. **“Dispatch from godown”** or **“Stock from warehouse”**, so users know it is **not** inherited from the sales order.
- **Inward slip pass:** **“Receiving at godown”** or similar.
- **Sauda screens:** No warehouse field—avoid implying stock is reserved at order time.

---

## 8) QA checklist

- [ ] Create inward slip pass with godown → kaanta without godown field on form → lot gets correct godown (verify in lot detail or API).
- [ ] Create invoice dispatch **with** `godown_id` → confirm dispatch → FGI moves only in that godown.
- [ ] Sales sauda finalize → new dispatch form still requires explicit godown (nothing auto from sauda).
- [ ] Payment advice create/list/detail: **no** godown field or API errors.
- [ ] List pages: changing **page-level** godown filter changes results (or “all” shows unfiltered, per API).

---

## 9) Summary table

| Screen / API | Godown on form? |
|--------------|-----------------|
| Purchase sauda | No |
| Sales sauda | No |
| Payment advice | No |
| Inward slip pass | **Yes — required** |
| Kaanta | No (pick ISP) |
| Manual lot | **Yes — required** |
| Batch | **Yes — required** |
| Invoice dispatch | **Yes — required on create** |
| Inventory / ledger lists | **Filter on list page** (`?godown_id=`) |

---

*Backend & data model: [`docs/GODOWN_IMPLEMENTATION.md`](./GODOWN_IMPLEMENTATION.md).*
