# Godown replenishment — frontend integration guide

Base URL: `/api/v1/replenishment`  
Auth: Bearer token on **every** route (same as the rest of the app).

This module **does not own stock**. Live Delhi (or any destination) inventory is still `finished_goods_inventory`. Confirming a godown transfer **adds** FGI; confirming a sale dispatch **subtracts** FGI. Preview always reads live data. A **saved plan** is a frozen snapshot of a decision, not a second stock book.

There is **no AI**. Same inputs → same bags.

---

## 1) What this screen is for

1. See **current stock** at a destination godown (usually Delhi), by product **and pack size** (25 kg ≠ 50 kg).
2. See the **ledger** (transfer in, sale out, return) with before/after kg.
3. **Select sales saudas** yourself (from `GET /sales-saudas`). There is no warehouse on a sauda and no city auto-match.
4. See **ATP**: inventory, which **draft** invoices reserve bags, what is **free**, what selected orders still **need**, what is **missing**.
5. Get two load numbers:
   - **Line A (default):** exact bags/tonnes to cover **selected orders**.
   - **Line B:** A + ~**7 days** extra at the last-**30**-day Delhi sales pace.
6. **Truck:** type any tonne number **and** see snap to configured sizes (9 / 16 / 21 / 25 / 32 T by default). Get a **load sheet**: how much of what to put on that truck.
7. Optionally **save / commit** the preview as a snapshot.

**Out of this API (v1):** creating a godown-transfer sauda from the plan. User still creates the transfer in the existing sales pipeline.

---

## 2) Units (must match UI copy)

| Engine | Display |
|--------|---------|
| All math in **kg** | Show **bags/packets** and **tonnes** |
| `tonnes = kg / 1000` | e.g. 1,250 kg = **1.25 T** |
| Stock bags | `floor(kg / holding_capacity)` — you cannot sell a partial bag |
| Load / gap bags | `ceil(kg / holding_capacity)` — Line A never under-covers remaining kg |
| Truck leftover | Floors to whole bags so a typed truck is not overfilled |

Never mix 25 kg demand with 50 kg stock. Quintals are **not** used here.

Standard wrapper:

```json
{
  "success": true,
  "message": "optional",
  "data": {},
  "timestamp": "...",
  "isSessionValid": true
}
```

Lists that paginate (`ledger`, `plans`) use `{ items, total, page, limit }` inside `data`.

---

## 3) One-time / admin setup

### 3.1 Truck sizes

**GET** `/api/v1/replenishment/truck-sizes`  
Query: `include_inactive=true` (optional).

Seeded: 9, 16, 21, 25, 32 T.

**PUT** `/api/v1/replenishment/truck-sizes`  
Body: `{ "sizes": [ { "tonnes": 9, "label": "9 T", "sort_order": 1, "is_active": true } ] }`  
Replaces the full list. At least one size. Tonnes must be unique and > 0.

Show these sizes as chips next to the typed tonne field.

There is **no city / delivery-address setup**. Sales saudas are not tied to a warehouse; the user picks which orders this truck is meant to cover.

---

## 4) Screen layout (recommended)

```
[ Godown dropdown ]     ← required, from GET /godowns
[ Stock tab ]  [ Ledger tab ]  [ Plan tab ]
```

**Plan tab**

1. Load open **sale** saudas from `GET /sales-saudas?status=order` (exclude `movement_type=godown_transfer`).
2. User ticks the ones this truck should cover. Send those ids as `sales_sauda_ids`.
3. **Preview** button → POST `/preview` (does **not** save).
4. Header: ATP totals + Line A tonnes + Line B tonnes + snapped trucks.
5. Optional: type truck tonnes **or** click a size → preview again with `mode: fill_truck`.
6. SKU table with expanders for drafts and demand saudas.
7. **Save plan** → POST `/plans` (same body as last preview).

Do **not** cache preview across confirm-sale; always re-fetch. Stock is live.

---

## 5) Flow A — live stock

**GET** `/api/v1/replenishment/stock?godown_id=<uuid>`

`data.totals`: `fgi_kg`, `fgi_tonnes`, `sku_count`  
`data.items[]`: `product_id`, `product_name`, `packaging_id`, `holding_capacity`, `packet_type`, `fgi_kg`, `fgi_packets`, `fgi_tonnes`

This is physical stock **including** bags already on draft invoices (they have not left yet). ATP (free stock) is only on **preview**.

**Check:** transfer 10 bags into Delhi (confirm dispatch) → stock up. Confirm a sale of 10 from Delhi → stock **0**. If that fails, do not use this module until FGI confirm is fixed.

---

## 6) Flow B — ledger (movement history)

**GET** `/api/v1/replenishment/ledger?godown_id=<uuid>`

Query: `product_id`, `source_type` (`purchase_inward` | `sales_dispatch` | `sale_return` | `adjustment` | `godown_transfer`), `from_date`, `to_date` (ISO), `page`, `limit`.

Each item: `quantity_change` (kg, signed), `packets_change` (kg / capacity, may be fractional), `stock_before`, `stock_after`, `source_type`, `source_id`, product name, packaging.

| `source_type` | Meaning at this godown |
|---------------|------------------------|
| `godown_transfer` | Inbound transfer credit (or reverse) |
| `sales_dispatch` | Sale left the godown (confirmed) |
| `sale_return` | Return restored stock |
| `adjustment` | Manual |

**Draft invoices do not appear here.** They have not moved FGI. They appear under ATP drafts on preview.

---

## 7) Flow C — pick sales saudas

Sales saudas have **no godown**. Do not guess from delivery city.

Use the existing list:

**GET** `/api/v1/sales-saudas?status=order`

Filter client-side (or whatever query the list already supports) to `movement_type = sale`. Let the user tick rows. Send `sales_sauda_ids` on preview.

Godown-transfer saudas are rejected if you send them (`400`). Lot-only lines are skipped in demand. Preview with an empty `sales_sauda_ids` is allowed (Line A = 0, Line B = trend vs stock).

---

## 8) Flow D — preview (the main call)

**POST** `/api/v1/replenishment/preview`

```json
{
  "godown_id": "uuid",
  "sales_sauda_ids": ["uuid", "uuid"],
  "mode": "recommend_truck",
  "truck_tonnes": 16,
  "trend_window_days": 30,
  "safety_days": 7
}
```

| Field | Rules |
|-------|--------|
| `godown_id` | Required, must be an **active** godown |
| `sales_sauda_ids` | Optional. The orders you want this load to cover |
| `mode` | `recommend_truck` \| `fill_truck` |
| `truck_tonnes` | **Required** if `mode=fill_truck`. Optional on `recommend_truck` — if sent, you also get a fill sheet for that capacity |
| `trend_window_days` | Optional, default **30** (1–365) |
| `safety_days` | Optional, default **7** (0–90) |

Saudas are optional: with none selected, Line A is 0 and Line B is 7-day trend vs current ATP (useful for “what should I stock”).

### 8.1 Header / `data.totals` (ATP + trucks)

| Field | Show as |
|-------|---------|
| `fgi_kg` | In inventory (physical) |
| `draft_kg` | Reserved on **draft** dispatches from this godown |
| `available_kg` | **ATP** = FGI − all drafts |
| `demand_kg` | Remaining on **selected** saudas (not yet on any invoice) |
| `gap_kg` | max(0, demand − available) — exact kg still short |
| `surplus_kg` | Extra already in godown vs selected demand |
| `tonnes_for_orders` | **Line A** (gap **ceiled** to whole bags, then / 1000) |
| `tonnes_for_orders_plus_safety` | **Line B** (gap + 7-day buffer, **ceiled** to whole bags) |
| `truck_snap_orders` | Snap Line A to fleet |
| `truck_snap_with_safety` | Snap Line B to fleet |

Each snap block:

```json
{
  "exact_tonnes": 1.25,
  "snap_up_tonnes": 9,
  "snap_down_tonnes": null,
  "shortfall_if_down_kg": null
}
```

**Default recommendation on screen: Line A.**  
Second line: “If you also want ~a week of buffer: Line B / snapped truck.”

`data.truck_sizes`: active fleet tonnes, e.g. `[9, 16, 21, 25, 32]`.

`data.sauda_ids`: ids the engine actually used (after union/de-dupe).

`data.fill_truck`: null unless `mode=fill_truck` or `truck_tonnes` was sent. See §10.

### 8.2 SKU rows (`data.lines[]`) — grain is product + packaging

Never roll 25 kg and 50 kg into one row.

**Stock / ATP**

- `fgi_kg` / `fgi_packets` — in the room  
- `draft_kg` — sticky notes  
- `available_kg` / `available_packets` — free  
- `atp_drafts[]` — **which** draft invoices (see §9)

**Selected orders**

- `demand_kg` / `demand_packets` — remaining (`demand_packets` ceils leftover kg)  
- `demand_saudas[]` — ordered / allocated / returned / remaining per sauda  
- `gap_kg` / `gap_packets` — still to transfer; **packets = Line A bags** (ceiled)  
- `surplus_kg` — already covered

**Trend (last N days confirmed **sales** from this godown; transfers excluded)**

- `trend_sold_kg`, `daily_kg`, `safety_kg` / `safety_packets`, `trend_share` (0–1)

**Load suggestions**

- `load_orders_*` — Line A for this SKU  
- `load_with_safety_*` — Line B for this SKU  

**Fill truck (only when a tonne capacity was applied)**

- `for_orders_*` — bags loaded for selected-order gaps  
- `for_trend_*` — extra bags from leftover capacity × trend share  
- `fill_truck_*` — total on this truck  
- `still_short_*` — unfilled gap if the truck is too small  

---

## 9) Showing ATP properly (required UX)

For each SKU (and optionally a godown totals strip), show a reconciliation, not a single net number.

Example (25 kg):

```
In inventory                 100 bags
Reserved on drafts           −70 bags
  INV-… Party X   40 bags   [open draft]
  INV-… Party Y   30 bags   [open draft]
Available (ATP)               30 bags

Selected remaining            80 bags
  SO-… Party Y   ordered 110, allocated 30, remaining 80

Gap (Line A)                  50 bags
```

`atp_drafts[]`:

- `invoice_dispatch_id`, `internal_invoice_number`, `serial_number`
- `party_name`, `sales_sauda_id`, `order_number`
- `quantity_kg`, `packets`, `status: "draft"`

Link `invoice_dispatch_id` → existing invoice-dispatch screen.

`demand_saudas[]`:

- `sales_sauda_id`, `order_number`, `party_name`
- `ordered_kg`, `allocated_kg`, `returned_kg`, `remaining_kg`

Link to sales sauda detail.

**Confirmed** invoices are **not** in `atp_drafts`. Those bags already left FGI; they show on the ledger as `sales_dispatch`.

**Cancel a draft** → remaining returns on the sauda, bags become free on the next preview.

---

## 10) Flow E — fill the truck (complete breakdown)

Set `mode: "fill_truck"` and `truck_tonnes: 16` (or click “16 T”).

You can also keep `mode: "recommend_truck"` and pass `truck_tonnes` to get both snaps **and** a fill sheet.

### Algorithm (so you can label columns)

1. Capacity kg = tonnes × 1000.  
2. Put **Line A covering bags** on the truck first (gap ceiled to whole packets).  
3. Leftover kg is split by last-30-day **sales share** from this godown (including SKUs with gap 0).  
4. If the truck is **smaller than Line A bags**, scale **only those covering bags**. No trend extras. `still_short_*` > 0.  
5. Trend extras **floor** to whole packets so the truck is not overfilled. Leftover kg → `fill_truck.unallocated_kg`.

`data.fill_truck`:

```json
{
  "truck_tonnes": 16,
  "capacity_kg": 16000,
  "allocated_kg": 16000,
  "unallocated_kg": 0,
  "still_short_kg": 0
}
```

Per-line load sheet columns:

| Column | Field |
|--------|--------|
| For selected orders | `for_orders_packets` / `_kg` |
| Extra (trend) | `for_trend_packets` / `_kg` |
| Load on truck | `fill_truck_packets` / `_kg` / `_tonnes` |
| Still short | `still_short_packets` / `_kg` |

Worked example (16 T, gaps 7 T, leftover 9 T at 50/20/20/10 share) is encoded in the backend tests: 1121-25kg loads **380 bags** (200 orders + 180 trend), etc.

**Typed 14.5 T vs chip 16 T:** two previews (or two tabs). Do not silently replace the user’s number.

---

## 11) Line A vs Line B (trend “prediction”)

It is **not** a forecast model.

```
daily_kg = (confirmed sale kg from this godown in last 30 days) / 30
safety_kg = daily_kg × 7
Line A  = ceil to whole bags (gap)     — never under-cover remaining kg
Line B  = ceil to whole bags (gap + safety)
```

If a SKU did not sell in 30 days, buffer is 0.  
If it sold a lot, Line B adds ~a week at that pace, even if it is **not** on the ticked saudas (gap 0, safety > 0).

Defaults: 30 and 7. Expose as advanced settings if needed.

---

## 12) Flow F — save snapshot (plans)

Preview **never** writes. Save when the user wants a record of the decision.

**POST** `/api/v1/replenishment/plans`  
Same body as preview, plus optional `notes`.

Creates `status: "draft"`. Response: `{ plan, sauda_ids, lines, preview }`.  
`preview` is the full preview payload frozen at save time.

**GET** `/api/v1/replenishment/plans?godown_id=&status=&page=&limit=`  
`status`: `draft` | `committed` | `cancelled`

**GET** `/api/v1/replenishment/plans/:id`

**POST** `/api/v1/replenishment/plans/:id/commit`  
Only from `draft`. Sets `committed_at` / `committed_by`. Frozen numbers **do not** change when later sales happen.

**POST** `/api/v1/replenishment/plans/:id/cancel`  
From draft or committed. Cannot commit after cancel.

**UI:** list of past plans; opening one shows the frozen preview, not live stock. Show a banner: “Snapshot from \<created_at\>. Live stock may have changed — run a new preview.”

---

## 13) Error cases

| Status | When |
|--------|------|
| 400 | Inactive/missing godown, invalid uuid, `fill_truck` without `truck_tonnes`, transfer sauda in `sales_sauda_ids`, sauda id not found, empty truck size list on PUT, duplicate tonnes |
| 401 | Missing/invalid token |
| 404 | Plan id not found |

Do not retry preview on 400 without fixing the body.

---

## 14) Suggested API sequence (happy path)

```
GET  /godowns
GET  /replenishment/truck-sizes
GET  /replenishment/stock?godown_id=
GET  /sales-saudas?status=order
POST /replenishment/preview           mode=recommend_truck  → show A / B
POST /replenishment/preview           mode=fill_truck, truck_tonnes=16 → load sheet
POST /replenishment/plans             save
POST /replenishment/plans/:id/commit
GET  /replenishment/ledger?godown_id= (stock story)
```

After operations in **invoice dispatch** (confirm/cancel), invalidate stock + preview caches and refetch.

---

## 15) What you must not do in the UI

- Do not maintain a local “Delhi stock” counter. Always GET stock / preview.
- Do not decrement stock when a dispatch is still **draft**.
- Do not add 25 kg and 50 kg of the same product.
- Do not treat Line B as “required.” Default the primary CTA to **Line A**.
- Do not send `godown_transfer` saudas as demand.
- Do not expect this API to create the transfer invoice. User copies the load sheet into the existing godown-transfer flow.
- Do not use `/inventory/bags` — that is empty/filled packaging, not rice.

---

## 16) Mapping to existing modules

| User action | Existing API |
|-------------|--------------|
| Confirm transfer into Delhi | Invoice dispatch confirm (`godown_transfer`) → FGI credit |
| Confirm sale from Delhi | Invoice dispatch confirm (`sale`) → FGI debit |
| Open a draft from ATP | `GET /invoice-dispatches/:id` |
| Open a sauda from demand | `GET /sales-saudas/:id` (remaining already on the sauda) |

Replenishment only **reads** those systems.

---

## 17) QA checklist

- [ ] User picks a godown from `GET /godowns` (any name) and ticks sales saudas; no city config  
- [ ] Tick a subset; another party’s draft is not treated as free (ATP available drops)  
- [ ] 25 kg gap while 50 kg sits in stock → 25 kg still shows gap  
- [ ] Line A tonnes = ceil(gap to whole bags) / 1000 (may be slightly above gap_kg)  
- [ ] Line B > A only when that SKU sold from this godown in 30 days  
- [ ] Fill 16 T: orders first, then trend extras; totals ≈ 16 T  
- [ ] Fill 5 T when gap is 7 T: no trend extras, `still_short` > 0  
- [ ] Type 14.5 T: fill uses 14.5, snap-up still shows 16  
- [ ] Confirm sale → stock and next preview drop; committed plan does **not** change  
- [ ] Cancel draft → remaining and ATP recover on next preview  
