# Coupon Module — Admin UI Integration Guide

Frontend integration reference for the **internal admin CMS**: batch management, coupon inventory, redemptions, manual payouts, promotion rules, Razorpay ops, and analytics.

---

## Base configuration

| Item | Value |
|---|---|
| **Base URL** | `{API_HOST}/api/v1` |
| **Admin prefix** | `/coupons/admin` |
| **Analytics prefix** | `/coupons/analytics` |
| **Auth** | JWT Bearer token (same as rest of Rice Soft admin) |
| **Content-Type** | `application/json` (except CSV export) |

### Authentication

All admin and analytics routes require a valid JWT except the Razorpay webhook.

```http
Authorization: Bearer <token>
```

Obtain token via existing login:

```http
POST /api/v1/auth/loginUser
{ "username": "...", "password": "..." }
```

Response: `data.token`

### Standard response envelope

All JSON endpoints return:

```typescript
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;        // present on failure
  timestamp: string;
  isSessionValid?: boolean;
}
```

### Error HTTP status codes

| Code | Meaning |
|---|---|
| 400 | Validation error / bad request |
| 401 | Missing or invalid token |
| 404 | Resource not found |
| 409 | Conflict (rare) |
| 500 | Server error |

Error body: `{ success: false, error: "message", timestamp: "..." }`

### Field naming

**Admin API uses `snake_case`** in request bodies and responses (matches DB columns).

**Exception:** Mark-paid response and some nested objects use camelCase (`redemptionId`, `paidVia`). Prefer reading both patterns or normalize in your API client layer.

**Amounts:** Always in **paise** (integer). Display as rupees: `amount_paise / 100`.

---

## Recommended admin screens

Map backend APIs to these UI sections:

```
Dashboard (Analytics)
├── Overview cards
├── Batch performance table
├── Redemption trends chart
├── Payout summary
└── Fraud signals

Coupon Inventory
├── Batches list
├── Batch detail (stats + actions)
├── Print coupons (PDF — frontend; see §5a)
├── Coupons search/filter
└── Coupon detail (code lookup + history)

Redemptions & Payouts
├── Pending payouts queue        ← primary daily workflow
├── Bulk mark paid (multi-select)
├── All redemptions (filterable)
├── Redemption detail
├── Mark paid modal
└── Undo paid (correction flow)

Redeemers
├── Redeemer search by phone
└── Redemption history per person

Promotion Rules
├── Rules list (with performance columns)
├── Create / edit rule form + stack preview panel
├── Rule detail / stats drill-down
├── Toggle active
└── Delete unused rules

Fraud Investigation
└── Redemption attempts log (drill-down from fraud signals)

Settings (Phase 3)
└── Razorpay payout retry (failed redemptions)
```

---

## Domain concepts for UI

### Coupon batch lifecycle (admin actions)

```
[Create batch] → draft
[Generate codes] → ready (generated_count = total_count)
[Mark printed] → all created coupons → printed
[Mark allotted] → all printed coupons → allotted  ← redeemable in market
[Archive batch] → batch archived (no new ops)
[Void batch] → voids all non-terminal coupons
```

### Coupon status (read-only badges)

| Status | UI colour suggestion | Meaning |
|---|---|---|
| `created` | grey | Generated, not printed |
| `printed` | blue | Printed, not in market yet |
| `allotted` | green | Live — customer can redeem |
| `redeemed` | purple | Used |
| `expired` | orange | Past expiry |
| `void` | red | Cancelled |

### Redemption payout status

| Status | Meaning | Admin action |
|---|---|---|
| `pending` | Customer redeemed, not paid yet | Show in pending queue; Mark Paid |
| `paid` | Settled | Read-only; show `paid_via` + reference |

### Paid via (when `paid`)

| Value | Meaning |
|---|---|
| `manual` | You paid via UPI/bank and marked paid |
| `razorpay` | Auto-paid via Razorpay webhook |

---

## Phase 1 — Batch management

### 1. Create coupon batch

```http
POST /coupons/admin/createCouponBatch
Authorization: Bearer <token>
```

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | max 255, e.g. `"March-2026-1509"` |
| `description` | string | no | |
| `face_value_paise` | integer | yes | e.g. `5000` = ₹50 |
| `total_count` | integer | yes | 1–500,000 |
| `expires_at` | ISO date string | no | e.g. `"2027-03-31T00:00:00.000Z"` (null = never expires) |
| `redeem_base_url` | URL string | no | Public redeem page base URL — **required for QR on printed coupons** (see §5a). Used in CSV export and frontend PDF QR generation. |

**Example:**
```json
{
  "name": "March-2026-1509",
  "face_value_paise": 5000,
  "total_count": 10000,
  "expires_at": "2027-03-31T00:00:00.000Z",
  "redeem_base_url": "https://redeem.yoursite.com"
}
```

**Example (never expires):**
```json
{
  "name": "Lifetime Rewards",
  "face_value_paise": 5000,
  "total_count": 1000,
  "expires_at": null,
  "redeem_base_url": "https://redeem.yoursite.com"
}
```

**Response:** `201` — `data` = batch row (`coupon_batch_id`, `status: "draft"`, …)

**UI:** Batch create form → on success navigate to batch detail.

---

### 2. Generate batch codes

```http
POST /coupons/admin/generateBatchCodes/:batchId
```

No body. Can take several seconds for large batches — show loading spinner.

**Response:** `200`
```json
{
  "data": {
    "generated": 10000,
    "batch": { "coupon_batch_id": "...", "status": "ready", "generated_count": 10000, ... }
  },
  "message": "Codes generated"
}
```

**UI:** Enable "Export" and "Mark printed" only when `status === "ready"` and `generated_count === total_count`.

#### Generation failure handling (backend + UI)

The generate endpoint is **idempotent and resumable**. Progress is tracked from the actual coupon row count, not an in-memory counter.

| Batch `status` | Meaning | UI action |
|---|---|---|
| `draft` | Never started, or failed partway | Show **Generate codes** (or **Resume generation** if `generated_count > 0`) |
| `generating` | In progress or server interrupted mid-run | Show **Resume generation** — same `POST generateBatchCodes` call |
| `ready` | All `total_count` codes exist | Disable generate; enable export / print |

**On API error (500 / network timeout):**
1. Refresh batch detail (`getCouponBatchById`).
2. Show `generated_count / total_count` progress.
3. If `status` is `draft` or `generating` and `generated_count < total_count`, show **Retry / Resume** — call generate again; remaining codes are inserted automatically.
4. Do not create a new batch unless the partial batch was deleted.

**On success (partial or full):** Response includes `{ generated, batch }` where `generated` equals final `generated_count`.

**Pre-flight errors (no codes added):**

| HTTP | When |
|---|---|
| `404` | Batch not found |
| `400` | Batch archived, or already fully generated |

**Concurrent clicks:** Safe — batch row is locked per chunk; second request waits and only fills the remainder.

**UI copy suggestions:**
- Loading: *"Generating coupons… this may take a minute for large batches."*
- Partial: *"200 of 500 generated. Click Resume to continue."*
- Stuck `generating`: *"Generation was interrupted. Click Resume."*

---

### 3. List batches

```http
GET /coupons/admin/getAllCouponBatches?page=1&limit=50
```

**Response:**
```json
{
  "data": {
    "rows": [ { "coupon_batch_id", "name", "face_value_paise", "total_count", "generated_count", "status", "expires_at", "created_at", ... } ],
    "total": 12
  }
}
```

**UI:** Paginated table. Columns: name, face value (₹), count, generated, status, expiry, created.

---

### 4. Batch detail + stats

```http
GET /coupons/admin/getCouponBatchById/:batchId
```

**Response:**
```json
{
  "data": {
    "batch": { ... },
    "stats": {
      "created": 0,
      "printed": 0,
      "allotted": 8200,
      "redeemed": 6200,
      "expired": 0,
      "void": 0,
      "redemption_rate": 75.6
    }
  }
}
```

**UI:** Detail page with stat cards + action buttons:
- Generate (if draft/partial)
- Export CSV
- Mark printed (if has `created` coupons)
- Mark allotted (if has `printed` coupons)
- Void batch
- Archive

Show redemption rate: `stats.redemption_rate` % (redeemed / allotted+redeemed).

---

### 5. Export CSV for printer

```http
GET /coupons/admin/exportBatchCodes/:batchId
```

**Response:** `200` — `Content-Type: text/csv` (not JSON)

**CSV columns:**
```
code,redeem_url,face_value_paise,face_value_rupees
AB12CD34,https://redeem.yoursite.com?code=AB12CD34,5000,50
```

**UI:** Download button. Use `redeem_url` for QR code generation on print side.

The backend **does not** render PDFs or label layouts — CSV is data-only. Physical coupon design is a **frontend responsibility** (see §5a).

---

### 5a. Print layout — frontend PDF (required)

Admin must be able to print coupons in a **proper branded format**, not raw CSV rows. Implement this in the **admin frontend** (e.g. jsPDF + QR library, `@react-pdf/renderer`, or browser print CSS).

#### What to show on each coupon

| Element | Required | Source |
|---|---|---|
| **Company logo** | Yes | Static asset in admin app (not from API) |
| **QR code** | Yes | Encode `redeem_url` from CSV export, or build `{batch.redeem_base_url}?code={code}` |
| **Coupon code** | Yes | Human-readable 8-char code (large, monospace) — `coupons.code` |
| **Face value** | Yes | e.g. `₹50` from `face_value_paise / 100` |
| **Batch / campaign name** | Recommended | `coupon_batches.name` from batch detail |
| **Expiry date** | If set | `expires_at` on coupon/batch — omit or show “No expiry” when null |
| **Redeem instructions** | Recommended | Short line, e.g. “Scan QR or visit link to redeem” |
| **Redeem URL (text)** | Optional | Small print under QR for manual entry |

#### Suggested sticker layout

```
┌──────────────────────────────┐
│  [Logo]          Batch name  │
│                              │
│       ┌──────────┐           │
│       │ QR code  │  AB12CD34  │
│       └──────────┘           │
│         ₹50 Cashback         │
│   Scan to redeem · Exp …     │
└──────────────────────────────┘
```

Agree sticker dimensions with print vendor (e.g. 50×30 mm, 2×5 per A4 sheet) and implement one default template; allow minor tweaks via CSS/mm units.

#### Print modes (UI actions)

| Action | Where | Data source |
|---|---|---|
| **Print entire batch** | Batch detail | `GET exportBatchCodes/:batchId` **or** paginate `getAllCoupons?batchId=` |
| **Print selected** | Coupons table (multi-select) | Selected rows from `getAllCoupons` |
| **Reprint one** | Coupon detail / row action | `getCouponByCode/:code` + batch `redeem_base_url` from `getCouponBatchById` |

**Flow:** Fetch codes → generate QR per `redeem_url` → render PDF → browser print or download. Show loading for large batches (500+).

#### QR rules

- QR payload = full `redeem_url` (must match public redeem page query param `code`).
- If batch has no `redeem_base_url`, show code + manual entry only; warn admin at batch create.
- Minimum QR quiet zone and size for reliable phone scans (≥25 mm square recommended).

#### Backend scope (explicit non-goals)

- No `exportCouponsPdf` endpoint today — do **not** wait on backend for layout.
- CSV export remains for external print shops / bulk label software.
- After physical print, admin still calls **Mark printed** then **Mark allotted** (lifecycle unchanged).

---

### 6. Mark batch printed

```http
POST /coupons/admin/markBatchPrinted/:batchId
```

**Response:**
```json
{ "data": { "updated": 10000 }, "message": "Batch marked printed" }
```

Transitions all `created` → `printed`.

---

### 7. Mark batch allotted

```http
POST /coupons/admin/markBatchAllotted/:batchId
```

**Response:**
```json
{ "data": { "updated": 10000 }, "message": "Batch marked allotted" }
```

Transitions all `printed` → `allotted`. **After this, customers can redeem.**

**UI:** Confirm dialog: *"This will make all printed coupons in this batch live for redemption."*

---

### 8. Archive batch

```http
POST /coupons/admin/archiveCouponBatch/:batchId
```

Sets batch `status` → `archived`. Does not change coupon statuses.

---

### 9. Void batch

```http
POST /coupons/admin/voidCouponBatch/:batchId
```

Voids all coupons not in `redeemed`, `void`, or `expired`.

**Response:** `{ "data": { "voided": 1800 } }`

**UI:** Destructive confirm dialog.

---

### 10. Delete batch (permanent)

Hard-deletes a batch and all its coupons. **Only allowed when the batch has zero redemptions.**

```http
POST /coupons/admin/deleteCouponBatch/:batchId
```

**Response:** `200`
```json
{ "data": { "coupon_batch_id": "...", "deleted": true }, "message": "Batch deleted permanently" }
```

**Errors:**
- `400` — batch has one or more redemptions (use archive/void instead)
- `404` — batch not found

**UI:** Destructive confirm — *"This permanently removes the batch and all coupon codes. Cannot be undone."* Hide unless batch has no redemptions.

---

## Phase 1 — Coupon inventory

### 11. List / search coupons

```http
GET /coupons/admin/getAllCoupons?batchId=<uuid>&status=allotted&code=AB12&page=1&limit=50
```

| Query param | Type | Notes |
|---|---|---|
| `batchId` | UUID | Filter by batch |
| `status` | enum | `created`, `printed`, `allotted`, `redeemed`, `expired`, `void` |
| `code` | string | Prefix search (case-insensitive) |
| `page` | int | default 1 |
| `limit` | int | 1–200, default 50 |

**Response:**
```json
{
  "data": {
    "rows": [ { "coupon_id", "code", "status", "face_value_paise", "expires_at", "redeemed_at", ... } ],
    "total": 8200
  }
}
```

**UI — coupons table:**
- Paginated list on batch detail (`batchId` filter).
- Status badge per row.
- Row action: **View** → coupon detail; **Print** → single-coupon PDF (§5a); **Mark printed** / **Mark allotted** when status allows (§12a / §12b); **Void**.
- Multi-select + **Print selected** for partial reprints (damaged/lost stickers).

---

### 12. Coupon detail by code

```http
GET /coupons/admin/getCouponByCode/:code
```

**Response:**
```json
{
  "data": {
    "coupon": { "code", "status", "face_value_paise", "coupon_batch_id", ... },
    "history": [
      { "from_status", "to_status", "reason", "changed_by", "created_at", ... }
    ]
  }
}
```

**UI:** Code lookup page — show timeline from `history` array.

---

### 12. Void single coupon

```http
POST /coupons/admin/voidCoupon/:code
```

Voids if not already `redeemed`, `void`, or `expired`.

---

### 12a. Mark single coupon printed

```http
POST /coupons/admin/markCouponPrinted/:code
```

Transitions one coupon `created` → `printed`. Returns 400 if current status is not `created`.

**Response:** updated coupon row.

**UI:** Row action on coupon detail / inventory table when status is `created` (e.g. after reprinting one sticker).

---

### 12b. Mark single coupon allotted

```http
POST /coupons/admin/markCouponAllotted/:code
```

Transitions one coupon `printed` → `allotted` (redeemable). Returns 400 if current status is not `printed`.

**Response:** updated coupon row.

**UI:** Row action when status is `printed`. To take a `created` coupon live, call printed then allotted (or use batch APIs for the whole batch).

---

## Phase 1 — Redemptions & payouts

### 13. Pending payouts (primary queue)

```http
GET /coupons/admin/getPendingPayouts?page=1&limit=50
```

Shortcut for `getAllRedemptions?payoutStatus=pending`.

**Response rows include:**
| Field | UI display |
|---|---|
| `public_ref` | Reference ID (e.g. `RED-2026-A1B2`) |
| `code` | Coupon code |
| `total_amount_paise` | Amount to pay (includes bonus) |
| `payout_upi_vpa` | Pay to this UPI |
| `payout_account_holder_name` | Account name |
| `payout_account_number` | Full account number (for manual bank transfer) |
| `payout_ifsc` | IFSC |
| `last_payout_error` | Show if Razorpay failed (Phase 3) |
| `created_at` | Redeem time |

**UI workflow:**
1. Show pending list sorted by `created_at` ASC (oldest first)
2. Admin pays customer externally (UPI/bank)
3. Click **Mark Paid** → enter UPI transaction reference
4. Row moves to paid

---

### 14. All redemptions (filterable)

```http
GET /coupons/admin/getAllRedemptions?payoutStatus=pending&batchId=&phone=&code=&fromDate=&toDate=&page=1&limit=50
```

| Query param | Values |
|---|---|
| `payoutStatus` | `pending`, `paid` |
| `batchId` | UUID |
| `phone` | 10-digit (normalized server-side for redeemer filter) |
| `code` | exact 8-char code |
| `fromDate`, `toDate` | ISO dates |

---

### 15. Redemption detail

```http
GET /coupons/admin/getRedemptionById/:id
```

**Response:**
```json
{
  "data": {
    "redemption": { ... full payout bank fields ... },
    "redeemer": { "phone", "name", "total_redemptions", "lifetime_earned_paise", ... },
    "ruleApplications": [
      { "rule_name", "bonus_paise", "created_at" }
    ],
    "payoutAttempts": [
      { "status", "razorpay_payout_id", "failure_reason", "created_at", "completed_at" }
    ]
  }
}
```

**UI sections:**
- Amount breakdown: base + bonus = total
- Payout details snapshot (UPI/bank at redeem time)
- Applied rules list (Phase 2)
- Razorpay attempt timeline (Phase 3)
- Mark paid button (if pending)

---

### 16. Mark redemption paid (manual)

```http
POST /coupons/admin/markRedemptionPaid/:id
```

**Request:**
```json
{
  "payment_reference": "UPI987654321",
  "notes": "Paid via PhonePe"
}
```

**Response:**
```json
{
  "data": {
    "redemptionId": "...",
    "publicRef": "RED-2026-A1B2",
    "payoutStatus": "paid",
    "paidVia": "manual",
    "paymentReference": "UPI987654321",
    "paidAt": "2026-03-21T10:00:00.000Z",
    "totalAmountPaise": 6000
  }
}
```

**Errors:**
- `400` — already paid
- `404` — redemption not found

**Important:** Always pay `total_amount_paise` (base + bonus), not just face value.

---

### 17. Bulk mark redemptions paid

Mark multiple pending redemptions in one request. Partial success is allowed — check `failed` in the response.

```http
POST /coupons/admin/bulkMarkRedemptionsPaid
Authorization: Bearer <token>
```

**Request:**
```json
{
  "items": [
    { "redemption_id": "uuid-1", "payment_reference": "UPI-111" },
    { "redemption_id": "uuid-2", "payment_reference": "UPI-222" }
  ],
  "notes": "Batch payout run 2026-03-21"
}
```

Max **100** items per request.

**Response:**
```json
{
  "data": {
    "succeeded": [
      { "redemptionId": "...", "publicRef": "RED-2026-A1B2", "payoutStatus": "paid", "totalAmountPaise": 6000 }
    ],
    "failed": [
      { "redemptionId": "...", "error": "Redemption is already paid" }
    ]
  }
}
```

**UI:** Multi-select rows in pending queue → single modal for per-row or shared payment references → show success/failure summary.

---

### 18. Undo mark paid (revert to pending)

Reverts a paid redemption back to `pending`. Use when admin marked the wrong row paid.

```http
POST /coupons/admin/unmarkRedemptionPaid/:id
Authorization: Bearer <token>
```

**Request:**
```json
{ "reason": "Marked wrong redemption by mistake" }
```

**Response:**
```json
{
  "data": {
    "redemptionId": "...",
    "publicRef": "RED-2026-A1B2",
    "payoutStatus": "pending",
    "previousPaidVia": "manual",
    "previousPaymentReference": "UPI-111",
    "previousPaidAt": "2026-03-21T10:00:00.000Z"
  }
}
```

**Errors:**
- `400` — redemption is not paid

**UI:** Destructive confirm with required reason field. Works for both `manual` and `razorpay` paid rows (Razorpay attempt history is preserved).

---

## Phase 1 — Redeemers

### 19. Redeemer by phone

```http
GET /coupons/admin/getRedeemerByPhone/:phone
```

Accepts 10-digit or `91` prefixed phone.

**Response:**
```json
{
  "data": {
    "redeemer": { "phone", "name", "upi_vpa", "total_redemptions", "lifetime_earned_paise", ... },
    "redemptions": [ { "public_ref", "total_amount_paise", "payout_status", "created_at", ... } ]
  }
}
```

---

### 20. List all redeemers

```http
GET /coupons/admin/getAllRedeemers?page=1&limit=50
```

Paginated list sorted by `last_redeemed_at`.

**Response:** each row includes flat fields plus structured `bank_details` for the BANK column:

```json
{
  "data": {
    "rows": [
      {
        "phone": "9968063874",
        "name": "hello there",
        "upi_vpa": "name@paytm",
        "account_holder_name": "hello there",
        "bank_name": "HDFC",
        "account_number": "99999996603477",
        "ifsc": "HDFC0009314",
        "bank_details": {
          "account_holder_name": "hello there",
          "bank_name": "HDFC",
          "account_number": "99999996603477",
          "ifsc": "HDFC0009314"
        },
        "total_redemptions": 2,
        "lifetime_earned_paise": 10000
      }
    ],
    "total": 1
  }
}
```

**UI — BANK column:** render `bank_details` on separate lines (do not join with `·`):

```
hello there
HDFC
99999996603477
HDFC0009314
```

If only UPI (no bank): show `upi_vpa` in UPI column; BANK column = `—`.

Redemption list / pending payouts use `payout_details` the same way (`upi_vpa` + nested `bank`).

## Phase 2 — Promotion rules

### 19. Create promotion rule

```http
POST /coupons/admin/createPromotionRule
```

**Request:**
```json
{
  "name": "5th coupon bonus",
  "description": "Extra ₹10 on 5th redeem",
  "rule_type": "REDEMPTION_COUNT",
  "conditions": {
    "minCount": 5,
    "maxCount": 5,
    "countIncludesCurrent": true
  },
  "reward": { "type": "FIXED", "bonusPaise": 1000 },
  "is_active": true,
  "priority": 10,
  "valid_from": "2026-03-01T00:00:00.000Z",
  "valid_to": "2027-03-31T23:59:59.000Z"
}
```

### Rule type reference (for form builder)

| rule_type | conditions fields | UI hint |
|---|---|---|
| `FIRST_TIME` | `{}` empty | First redeem ever for phone |
| `REDEMPTION_COUNT` | `minCount`, `maxCount?`, `countIncludesCurrent` | Milestone redeems |
| `BATCH` | `batchIds: string[]` | Multi-select batches |

### Reward type reference

| reward.type | Fields | Example | UI hint |
|---|---|---|---|
| `FIXED` | `bonusPaise` (integer) | `{ "type": "FIXED", "bonusPaise": 1000 }` | Fixed ₹10 bonus |
| `PERCENT` | `percent` (1-100) | `{ "type": "PERCENT", "percent": 20 }` | 20% of face value |
| `MULTIPLIER` | `times` (>1, ≤5) | `{ "type": "MULTIPLIER", "times": 1.5 }` | 1.5× total payout |
| `PERCENT_CAPPED` | `percent`, `maxBonusPaise` | `{ "type": "PERCENT_CAPPED", "percent": 25, "maxBonusPaise": 2000 }` | 25% capped at ₹20 |

**Legacy format:** `{ "bonusPaise": 1000 }` (without `type`) is treated as `FIXED` for backward compatibility.

**Validation:**
- `bonusPaise`: Must be positive integer ≥ 1
- `percent`: Must be 1-100
- `times`: Must be > 1 and ≤ 5
- `maxBonusPaise`: Must be positive integer ≥ 1

**Stacking:** Multiple active rules can all apply on one redeem. Bonuses **sum** — there is no global cap in the engine. Rules are evaluated in **priority order** (lower number = higher priority); order affects display only, not the total.

#### Rule stacking UX (form builder)

When creating or editing a rule, show a **live stack preview** so admins see the combined payout before saving.

**Preview panel inputs:**
| Field | Source | Notes |
|---|---|---|
| Batch | Required dropdown | Drives `coupon_batch_id` and default face value |
| Face value | Optional override | Defaults to batch `face_value_paise` |
| Redeemer context | Phone **or** manual count | Phone looks up `total_redemptions`; manual count simulates milestones |
| Include inactive | Toggle (default off) | Shows inactive rules in skipped list with reason |

**Preview panel output (recommended layout):**

```
Redeemer: 4 prior redeems (phone 9876543210)
Face value: ₹50.00

Applied rules (priority order)
┌─────────────────────────────────────────────────────────────┐
│ 1. First-time bonus        FIXED      +₹10.00   (skipped)  │
│ 2. 5th redeem milestone    FIXED      +₹10.00   ✓ applied   │
│ 3. Summer batch promo      PERCENT    +₹5.00    ✓ applied   │
└─────────────────────────────────────────────────────────────┘

Base amount:     ₹50.00
Bonus total:     ₹15.00
Total payout:    ₹65.00
```

- **Applied rules:** green check, show `bonusPaise`, `rewardType`, optional `rewardDetail` (e.g. `20% of face value`)
- **Skipped rules:** grey/muted, show `skipReason` (e.g. `redemption count 5 is above maxCount 5`)
- **Total row:** `baseAmountPaise + bonusAmountPaise = totalAmountPaise`

Call `POST /coupons/admin/previewPromotionRuleStack` on debounced form changes (batch, face value, phone/count).

**On redemption detail:** `ruleApplications` on each redemption shows which rules fired for that single event. Use rule-level analytics (below) for aggregate counts.

---

### 20. List promotion rules

```http
GET /coupons/admin/getAllPromotionRules?includeInactive=true
```

---

### 21. Get rule by ID

```http
GET /coupons/admin/getPromotionRuleById/:id
```

---

### 22. Update promotion rule

```http
POST /coupons/admin/updatePromotionRule/:id
```

Partial update — send only changed fields.

---

### 23. Toggle rule active

```http
POST /coupons/admin/togglePromotionRule/:id
{ "is_active": false }
```

---

### 24. Delete promotion rule

Permanently removes a rule. **Only allowed if the rule has never been applied** to a redemption (no `rule_applications` rows).

```http
POST /coupons/admin/deletePromotionRule/:id
```

**Response:** `{ "data": { "promotionRuleId": "...", "deleted": true } }`

**Errors:**
- `400` — rule has been applied N times (deactivate instead via toggle)
- `404` — rule not found

**UI:** Delete button on rule row (disabled with tooltip if rule has applications). Confirm dialog.

---

### 25. Preview rule stack (simulator)

Simulates which rules would apply for a hypothetical redeem. Use on the create/edit form and a standalone "Rule simulator" page.

```http
POST /coupons/admin/previewPromotionRuleStack
```

**Request:**
```json
{
  "phone": "9876543210",
  "coupon_batch_id": "batch-uuid",
  "face_value_paise": 5000,
  "include_inactive": false,
  "include_skipped": true
}
```

| Field | Required | Notes |
|---|---|---|
| `coupon_batch_id` | Yes | Batch UUID |
| `phone` | No | Looks up redeemer; overrides `total_redemptions` if found |
| `total_redemptions` | No | Manual simulation when no phone (default `0` = first-time) |
| `face_value_paise` | No | Defaults to batch face value |
| `include_inactive` | No | Include inactive rules in `skippedRules` |
| `include_skipped` | No | Default `true` — return rules that did not match |

**Response:**
```json
{
  "data": {
    "redeemerContext": { "totalRedemptions": 4, "phone": "9876543210" },
    "couponBatchId": "...",
    "faceValuePaise": 5000,
    "baseAmountPaise": 5000,
    "bonusAmountPaise": 1500,
    "totalAmountPaise": 6500,
    "appliedRules": [
      {
        "promotionRuleId": "...",
        "ruleName": "5th coupon bonus",
        "ruleType": "REDEMPTION_COUNT",
        "priority": 10,
        "bonusPaise": 1000,
        "rewardType": "FIXED",
        "rewardDetail": null
      }
    ],
    "skippedRules": [
      {
        "promotionRuleId": "...",
        "ruleName": "First-time bonus",
        "ruleType": "FIRST_TIME",
        "priority": 5,
        "skipReason": "redeemer already has 4 redemption(s)"
      }
    ]
  }
}
```

---

### 26. Rule performance stats (single rule)

Drill-down for one rule: how many times it fired, total bonus paid, recent applications.

```http
GET /coupons/admin/getPromotionRuleStats/:id?fromDate=&toDate=&recentLimit=10
```

**Response:**
```json
{
  "data": {
    "rule": {
      "promotionRuleId": "...",
      "name": "5th coupon bonus",
      "ruleType": "REDEMPTION_COUNT",
      "isActive": true
    },
    "stats": {
      "applicationCount": 142,
      "totalBonusPaise": 142000,
      "averageBonusPaise": 1000,
      "lastAppliedAt": "2026-03-21T10:00:00.000Z"
    },
    "recentApplications": [
      {
        "ruleApplicationId": "...",
        "redemptionId": "...",
        "publicRef": "RDM-ABC123",
        "code": "AB12CD34",
        "bonusPaise": 1000,
        "totalAmountPaise": 6000,
        "appliedAt": "2026-03-21T10:00:00.000Z"
      }
    ]
  }
}
```

**UI:** Rule detail drawer or page. Link each `recentApplications` row to redemption detail.

---

## Phase 3 — Razorpay (admin UI)

Razorpay is **off by default** (`COUPON_PAYOUT_ENABLED=false`). When enabled, most payouts happen automatically.

### Admin UI for Phase 3

**Pending queue changes:**
- Some rows may have `last_payout_error` set — show warning badge
- Show **Retry payout** button instead of/in addition to Mark Paid

### 24. Retry Razorpay payout

```http
POST /coupons/admin/retryPayout/:redemptionId
```

Re-queues Razorpay for a pending redemption. No body.

**Response:** `{ "data": { "redemptionId": "..." }, "message": "Payout retry queued" }`

**UI:** Use when `last_payout_error` is set and `payout_status === "pending"`.

---

### 25. Get payout attempts

```http
GET /coupons/admin/getPayoutAttempts/:redemptionId
```

**Response:** Array of attempts:
```json
[
  { "status": "failed", "failure_reason": "Invalid VPA", "created_at": "..." },
  { "status": "success", "razorpay_payout_id": "pout_xxx", "completed_at": "..." }
]
```

**UI:** Timeline on redemption detail. Failed attempts stay failed even if you later mark paid manually.

---

### Razorpay webhook (backend only — not for admin UI)

```http
POST /coupons/admin/webhooks/razorpay
X-Razorpay-Signature: <hmac>
```

Configure in Razorpay dashboard. No JWT. Admin UI does not call this.

---

## Phase 4 — Analytics

Base: `/api/v1/coupons/analytics` — same JWT auth.

**Date filters (all endpoints that accept `fromDate` / `toDate`):** Pass `YYYY-MM-DD`. Date-only `toDate` is **inclusive through end of that calendar day** (UTC). Same rule applies to admin list APIs (`getAllRedemptions`, `getRedemptionAttempts`, `getPromotionRuleStats`).

### 26. Overview dashboard

```http
GET /coupons/analytics/getOverview?fromDate=2026-03-01&toDate=2026-03-31
```

**Response:**
```json
{
  "data": {
    "coupons": {
      "totalGenerated": 50000,
      "allotted": 42000,
      "redeemed": 31000,
      "expired": 500,
      "redemptionRate": 73.8
    },
    "redemptions": {
      "totalCount": 31000,
      "totalAmountPaise": 155000000,
      "bonusAmountPaise": 3100000
    },
    "payouts": {
      "pendingCount": 47,
      "pendingAmountPaise": 235000,
      "paidCount": 30953,
      "paidAmountPaise": 154765000
    }
  }
}
```

**UI cards:**
- Total generated / allotted / redeemed
- Redemption rate %
- Pending payout count + amount (link to pending queue)
- Total paid

---

### 27. Batch performance

```http
GET /coupons/analytics/getBatchPerformance?batchId=<optional>&page=1&limit=50
```

| Query param | Notes |
|---|---|
| `batchId` | Optional — single batch stats |
| `page` | Default `1` |
| `limit` | Default `50`, max `200` |

Per-batch: allotted, redeemed, redemption rate, pending/paid amounts.

**Response:**
```json
{
  "data": {
    "rows": [
      {
        "batchId": "...",
        "name": "March-2026-500",
        "faceValuePaise": 5000,
        "totalCount": 500,
        "generated": 500,
        "allotted": 400,
        "redeemed": 254,
        "redemptionRate": 63.5,
        "pendingPayoutPaise": 0,
        "paidOutPaise": 1642100
      }
    ],
    "page": 1,
    "limit": 50,
    "total": 12
  }
}
```

**UI:** Paginated table on analytics dashboard. Use `total` for page count.

---

### 28. Redemption trends

```http
GET /coupons/analytics/getRedemptionTrends?fromDate=&toDate=&granularity=day
```

`granularity`: `day` | `week` | `month`

**Date params:** Pass `YYYY-MM-DD` for preset ranges (7d / 30d / 90d). Date-only `toDate` is **inclusive through end of that day** (UTC). Full ISO timestamps (`2026-07-05T23:59:59.999Z`) are also supported.

**UI:** Line/bar chart — `date`, `redemptionCount`, `totalAmountPaise`. Note: `date` is bucket start (may appear as prior UTC evening for IST calendar days depending on DB timezone).

---

### 29. Payout summary

```http
GET /coupons/analytics/getPayoutSummary
```

```json
{
  "data": {
    "pending": { "count", "amountPaise" },
    "paidManual": { "count", "amountPaise" },
    "paidRazorpay": { "count", "amountPaise" },
    "razorpayFailedAttempts": 12
  }
}
```

---

### 30. Redeemer leaderboard

```http
GET /coupons/analytics/getRedeemerLeaderboard?limit=20&sortBy=count
```

`sortBy`: `count` | `amount`

---

### 31. Fraud signals

```http
GET /coupons/analytics/getFraudSignals?fromDate=&toDate=
```

```json
{
  "data": {
    "failedAttempts": 340,
    "failureReasonBreakdown": {
      "not_found": 120,
      "expired": 85,
      "not_allotted": 65,
      "already_redeemed": 45,
      "void": 15,
      "invalid_format": 10
    },
    "topFailedCodes": [{ "codePrefix": "AB12", "attempts": 45 }],
    "topFailedIps": [{ "ip": "1.2.3.4", "attempts": 28 }],
    "phonesWithHighRedemptions": [{ "phone": "9876543210", "count": 12 }]
  }
}
```

**UI:** Link from fraud dashboard → filtered attempts table.

---

### 33. Promotion rule performance (analytics)

Aggregate stats for **all rules** — use on the rules list table and analytics dashboard.

```http
GET /coupons/analytics/getPromotionRulePerformance?fromDate=&toDate=
```

**Response:**
```json
{
  "data": {
    "rules": [
      {
        "promotionRuleId": "...",
        "name": "5th coupon bonus",
        "ruleType": "REDEMPTION_COUNT",
        "isActive": true,
        "applicationCount": 142,
        "totalBonusPaise": 142000,
        "lastAppliedAt": "2026-03-21T10:00:00.000Z"
      }
    ]
  }
}
```

**Rules list columns (recommended):**

| Column | Source |
|---|---|
| Name / type / active | `getAllPromotionRules` |
| Times fired | `applicationCount` |
| Total bonus paid | `totalBonusPaise` |
| Last fired | `lastAppliedAt` |
| Actions | Edit, toggle, delete, **View stats** → `getPromotionRuleStats/:id` |

Date filters on the list should pass the same `fromDate`/`toDate` to both list performance and detail stats.

---

### 32. Redemption attempts drill-down

Paginated list of individual failed verify/redeem attempts. Use to investigate fraud signals.

```http
GET /coupons/admin/getRedemptionAttempts?failureReason=not_found&code=AB12&phone=&ip=&fromDate=&toDate=&page=1&limit=50
```

| Query param | Notes |
|---|---|
| `code` | Prefix search on `code_attempted` |
| `phone` | Exact phone match |
| `ip` | Exact IP match |
| `failureReason` | e.g. `not_found`, `expired`, `already_redeemed`, `void`, `not_allotted`, `invalid_format` |
| `fromDate`, `toDate` | ISO dates |
| `page`, `limit` | Pagination (max 200) |

**Response:**
```json
{
  "data": {
    "rows": [
      {
        "redemption_attempt_id": "...",
        "code_attempted": "AB12CD34",
        "phone": "9876543210",
        "ip": "1.2.3.4",
        "failure_reason": "not_found",
        "created_at": "2026-03-21T10:00:00.000Z"
      }
    ],
    "total": 340
  }
}
```

---

## Suggested admin user flows

### Daily ops flow

```
1. Open Dashboard → check pendingCount
2. Go to Pending Payouts
3. For each row: pay UPI externally → Mark Paid
4. Check Fraud signals if failed attempts spike
```

### New batch flow

```
Create batch → Generate → Print coupons (frontend PDF: logo + QR + details, §5a)
  → optional: Export CSV for external printer
→ Mark printed → Ship bags → Mark allotted
→ Monitor batch detail redemption_rate
```

### Handle Razorpay failure (Phase 3)

```
Pending row with last_payout_error
→ Option A: Retry payout (POST retryPayout)
→ Option B: Pay manually → Mark Paid (paid_via stays manual)
```

---

## UI state / button enablement matrix

| Batch status | Generate | Export CSV | Print PDF | Mark printed | Mark allotted | Void | Delete |
|---|---|---|---|---|---|---|---|
| `draft` | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓* |
| `generating` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `ready` | ✗* | ✓ | ✓ | ✓ | ✗ | ✓ | ✓* |
| `archived` | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓* |

*Delete only when batch has **zero redemptions**

*Generate again only if `generated_count < total_count`

| Coupon status | Void |
|---|---|
| `created`, `printed`, `allotted` | ✓ |
| `redeemed`, `expired`, `void` | ✗ |

| Redemption payout_status | Mark paid | Bulk mark paid | Undo paid | Retry Razorpay |
|---|---|---|---|---|
| `pending` | ✓ | ✓ | ✗ | ✓ (Phase 3) |
| `paid` | ✗ | ✗ | ✓ | ✗ |

| Promotion rule | Edit | Toggle | Delete |
|---|---|---|---|
| Never applied | ✓ | ✓ | ✓ |
| Has applications | ✓ | ✓ | ✗ |

---

## Testing tools

| Tool | Path |
|---|---|
| Smoke test | `npm run test:coupon-flow` |
| Postman collection | `docs/coupon-postman-collection.json` |
| Module overview | `docs/COUPON_MODULE.md` |

---

## TypeScript helper types (optional)

```typescript
type CouponStatus = 'created' | 'printed' | 'allotted' | 'redeemed' | 'expired' | 'void';
type BatchStatus = 'draft' | 'generating' | 'ready' | 'archived';
type PayoutStatus = 'pending' | 'paid';
type PaidVia = 'manual' | 'razorpay';
type RuleType = 'FIRST_TIME' | 'REDEMPTION_COUNT' | 'BATCH';

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}
```
