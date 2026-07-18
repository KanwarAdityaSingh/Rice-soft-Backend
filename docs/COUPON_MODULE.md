# Coupon Module — Implementation Guide

Independent module for the rice coupon program: generate physical coupons, track inventory, let customers redeem online, apply bonus rules, and pay out (manually or via Razorpay).

**Base path:** `/api/v1/coupons/`

---

## Overview

| Phase | What it does | Active by default? |
|---|---|---|
| **Phase 1** | Batch generation, inventory lifecycle, public verify/redeem, manual payouts | Yes |
| **Phase 2** | Configurable promotion rules (bonuses at redeem) | Yes |
| **Phase 3** | Razorpay auto payout + webhooks | No — requires env config |
| **Phase 4** | Analytics & ops dashboards | Yes |
| **Phase 5** | Customer OTP login, refresh tokens, redemption history, payout status | Yes |

**Migrations:** `156`–`165` — core (`156`–`162`), `163_add_payout_bank_name_to_redemptions`, `164_create_razorpay_webhook_events`, `165_add_redeemer_bank_kyc`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ADMIN CMS          /api/v1/coupons/admin      (JWT auth)     │
│  Batch ops · inventory · redemptions · rules · payouts      │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  PostgreSQL                                                  │
│  coupon_batches · coupons · coupon_status_history            │
│  redeemers · redemptions · redemption_attempts               │
│  promotion_rules · rule_applications · payout_attempts       │
│  razorpay_webhook_events · public_otp_verifications          │
│  public_refresh_tokens                                       │
└───────────────────────────▲─────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│  PUBLIC API         /api/v1/coupons/public                  │
│  OTP login · refresh tokens · verify/redeem (JWT required)    │
│  myRedemptions · myProfile · payoutStatus · sessions        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ANALYTICS          /api/v1/coupons/analytics  (JWT auth)   │
└─────────────────────────────────────────────────────────────┘

Background (server start):
  · Expiry cron — marks expired coupons daily (default 24h interval)
  · Payout worker — polls pending redemptions for Razorpay (Phase 3 only)
```

### Code layout

```
src/
├── constants/coupon-status.ts, promotion-rewards.ts
├── models/coupon.model.ts, public-otp.model.ts, refresh-token.model.ts
├── dao/                    # coupon-*, redeemer, redemption*, promotion-rule, payout-attempt,
│                           # razorpay-webhook-event, public-otp, refresh-token
├── services/               # batch, verify, redeem, payout, rules engine, analytics, razorpay,
│                           # public-otp, refresh-token
├── controllers/            # coupon-admin, coupon-public, coupon-analytics
├── routes/                 # coupon-admin, coupon-public, coupon-analytics
├── middleware/public-auth.middleware.ts
├── workers/coupon-payout.worker.ts
├── utils/coupon.validators.ts, coupon.helpers.ts
└── database/migrations/156_*.sql … 164_*.sql
```

---

## Phase 1 — Core Inventory & Manual Payout

### Purpose

Run the full coupon program with you paying customers manually via UPI/bank.

### Coupon lifecycle

```
created  →  printed  →  allotted  →  redeemed
                              ↓
                           expired / void
```

| Status | Meaning | Set by |
|---|---|---|
| `created` | Code generated, not yet printed | System (generation) |
| `printed` | Sent to printer / export done | Admin: mark batch printed |
| `allotted` | In bags, live in market — **only this status is redeemable** | Admin: mark batch allotted |
| `redeemed` | Customer successfully redeemed | Public redeem API |
| `expired` | Past expiry date (`expires_at IS NOT NULL` only) | Expiry cron |
| `void` | Cancelled | Admin |

Admin void uses `SELECT … FOR UPDATE` on the coupon row and updates only when the status still matches what was read, so a concurrent redeem cannot be overwritten by void.

Every status change is logged in `coupon_status_history` (append-only).

### Code generation

- **Format:** 8-character alphanumeric
- **Charset:** `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L)
- **Uniqueness:** DB `UNIQUE(code)` constraint + generator retry on conflict
- **Bulk insert:** 500 codes per chunk with `ON CONFLICT DO NOTHING`

### Admin workflow

```
1. Create batch (name, face value, count, optional expiry — `expires_at: null` = never expires)
2. Generate codes
3. Export CSV for printer (code, redeem URL, face value)
4. Mark batch printed
5. Put coupons in rice bags
6. Mark batch allotted  ← codes become redeemable
7. Monitor redemptions
8. Pay customer manually → Mark redemption paid
```

### Public workflow

```
1. Customer lands on redeem page → must login with phone + OTP
2. verifyOtp → access token (15 min) + refresh token (7 days)
3. Customer enters 8-char code
4. verifyCoupon (JWT required) → shows face value if valid
5. Customer submits name, UPI (or bank details); phone from JWT
6. redeemCoupon (JWT required) → redemption created, payout_status = pending
7. Customer can view myRedemptions / payoutStatus/:publicRef anytime
8. You pay them offline (Phase 1) or Razorpay auto-pays (Phase 3)
```

**`publicRef`** — customer-facing reference per redemption (e.g. `RED-2026-A1B2`). Used for support and payout status lookup.

### Payment model (Phase 1)

- **`redemptions.payout_status`:** `pending` | `paid` only
- **Manual pay:** `POST markRedemptionPaid` sets `paid_via = manual`, stores UPI reference
- **Admin responses** include structured `bank_details` (redeemer) and `payout_details` (redemption) for payout UI
- **No ledger table** — redemption row is the source of truth
- **No `payout_attempts` rows** for manual payments

### Tables (Phase 1)

| Table | Purpose |
|---|---|
| `coupon_batches` | Print runs (name, face value, count, expiry — `expires_at` nullable = never expires) |
| `coupons` | One row per code (`code` UNIQUE) |
| `coupon_status_history` | Audit trail of every status change |
| `redeemers` | People keyed by phone + latest UPI/bank details |
| `redemptions` | Successful redeems + payout state + idempotency key |
| `redemption_attempts` | Failed verify/redeem attempts (fraud tracking) |

### Phase 1 APIs

**Public** — `/api/v1/coupons/public`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/sendOtp` | None | Send 6-digit OTP via SMS (Kaleyra) |
| POST | `/verifyOtp` | None | Verify OTP → issue access + refresh tokens |
| POST | `/refreshToken` | None | Rotate tokens; get new access token |
| POST | `/verifyCoupon` | JWT | Read-only validation |
| GET | `/verifyBankAccount` | JWT | Surepass bank verify (before redeem; bank payout only) |
| POST | `/redeemCoupon` | JWT | Redeem + save user details |
| GET | `/myRedemptions` | JWT | Customer's redemption history |
| GET | `/myProfile` | JWT | Profile summary (total earned, etc.) |
| GET | `/payoutStatus/:publicRef` | JWT | Payout status for one redemption |
| POST | `/logout` | JWT | Revoke refresh token (single session) |
| POST | `/logoutAll` | JWT | Revoke all refresh tokens for phone |
| GET | `/sessions` | JWT | List active sessions / devices |

See `docs/COUPON_PUBLIC_UI_INTEGRATION.md` for full request/response shapes and frontend integration.

**Admin** — `/api/v1/coupons/admin` (JWT required)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/createCouponBatch` | Create batch |
| POST | `/generateBatchCodes/:batchId` | Generate codes |
| GET | `/getAllCouponBatches` | List batches |
| GET | `/getCouponBatchById/:batchId` | Detail + status counts |
| GET | `/exportBatchCodes/:batchId` | CSV download |
| POST | `/markBatchPrinted/:batchId` | created → printed |
| POST | `/markBatchAllotted/:batchId` | printed → allotted |
| POST | `/archiveCouponBatch/:batchId` | Archive batch |
| POST | `/voidCouponBatch/:batchId` | Void non-terminal coupons |
| GET | `/getAllCoupons` | Search/filter coupons |
| GET | `/getCouponByCode/:code` | Coupon + history |
| POST | `/markCouponPrinted/:code` | Single coupon: created → printed |
| POST | `/markCouponAllotted/:code` | Single coupon: printed → allotted |
| POST | `/voidCoupon/:code` | Void single coupon |
| GET | `/getAllRedemptions` | List redemptions |
| GET | `/getPendingPayouts` | Pending payout queue |
| GET | `/getRedemptionById/:id` | Full redemption detail (+ `payoutAttempts`, `webhookEvents`) |
| POST | `/markRedemptionPaid/:id` | Manual mark paid |
| POST | `/bulkMarkRedemptionsPaid` | Bulk manual mark paid |
| POST | `/unmarkRedemptionPaid/:id` | Undo paid (ops correction) |
| GET | `/getRedemptionAttempts` | Failed verify/redeem log (fraud) |
| POST | `/deleteCouponBatch/:batchId` | Delete empty/draft batch |
| GET | `/getRedeemerByPhone/:phone` | Redeemer + history |
| GET | `/getAllRedeemers` | List redeemers |

---

## Phase 2 — Promotion Rules

### Purpose

Configurable bonuses at redeem time without code deploys.

### Rule types

| rule_type | When it fires | conditions example |
|---|---|---|
| `FIRST_TIME` | First ever redeem for that phone | `{}` |
| `REDEMPTION_COUNT` | Nth redeem milestone | `{ "minCount": 5, "maxCount": 5, "countIncludesCurrent": true }` |
| `BATCH` | Coupon from specific batch(es) | `{ "batchIds": ["uuid-..."] }` |

### Reward format

Rewards are JSON objects on `promotion_rules.reward`. All types resolve to **integer bonus paise** at redeem time (`bonus_amount_paise` on the redemption row; `bonus_paise` on `rule_applications`).

| Type | Fields | Example | ₹50 coupon effect |
|---|---|---|---|
| `FIXED` | `bonusPaise` | `{ "type": "FIXED", "bonusPaise": 1000 }` | +₹10 flat |
| Legacy | `bonusPaise` only | `{ "bonusPaise": 1000 }` | +₹10 |
| `PERCENT` | `percent` | `{ "type": "PERCENT", "percent": 20 }` | +₹10 (20% of face) |
| `MULTIPLIER` | `times` | `{ "type": "MULTIPLIER", "times": 1.5 }` | +₹25 (1.5× payout) |
| `PERCENT_CAPPED` | `percent`, `maxBonusPaise` | `{ "type": "PERCENT_CAPPED", "percent": 50, "maxBonusPaise": 1500 }` | +₹15 (50%, max ₹15) |

- **`percent`** — plain number 1–100 (`20` = 20% of coupon face value)
- **`times`** — payout multiplier (`1.5` = customer receives 1.5× face value)
- **`maxBonusPaise`** / **`bonusPaise`** — amounts in paise (₹1 = `100`)

**Stacking:** Multiple rules can fire; each computed bonus is summed.

**Future types** (documented, not implemented): `TIERED`, `BONUS_POOL`, `FIXED_PLUS_PERCENT`, `MIN_GUARANTEE` — see `src/constants/promotion-rewards.ts`.

### Behaviour

- **Stacking:** Multiple rules can fire on one redeem; bonuses add up
- **Evaluation:** Inside redeem transaction, after locking the redeemer row (`SELECT … FOR UPDATE` by phone), before incrementing redeemer counter
- **Audit:** Each fired rule logged in `rule_applications`
- **Campaign window:** `valid_from` / `valid_to` on the rule row

### Redemption amounts

```
base_amount_paise   = coupon face value
bonus_amount_paise  = sum of all matching rules
total_amount_paise  = base + bonus   ← this is what you pay
```

### Tables (Phase 2)

| Table | Purpose |
|---|---|
| `promotion_rules` | Rule definitions |
| `rule_applications` | Which rules fired on which redemption |

### Phase 2 APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/createPromotionRule` | Create rule |
| GET | `/getAllPromotionRules` | List rules |
| GET | `/getPromotionRuleById/:id` | Rule detail |
| POST | `/updatePromotionRule/:id` | Update rule |
| POST | `/togglePromotionRule/:id` | Enable/disable |
| POST | `/deletePromotionRule/:id` | Delete rule |
| POST | `/previewPromotionRuleStack` | Dry-run rule stacking |
| GET | `/getPromotionRuleStats/:id` | Per-rule redemption stats |

### Example rules

**Welcome bonus (first redeem):**
```json
{
  "name": "Welcome bonus",
  "rule_type": "FIRST_TIME",
  "conditions": {},
  "reward": { "bonusPaise": 500 },
  "priority": 1,
  "is_active": true
}
```

**Exactly 5th redeem (+₹10):**
```json
{
  "name": "5th coupon bonus",
  "rule_type": "REDEMPTION_COUNT",
  "conditions": { "minCount": 5, "maxCount": 5, "countIncludesCurrent": true },
  "reward": { "bonusPaise": 1000 },
  "priority": 10,
  "is_active": true
}
```

---

## Phase 3 — Razorpay Auto Payout

### Purpose

Automatically pay customers via Razorpay UPI after redeem. Manual fallback still works.

### Gated by env

Phase 3 code exists but is **off by default**. Set:

```env
COUPON_PAYOUT_ENABLED=true
RAZORPAY_KEY_ID=rzp_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PAYOUT_ACCOUNT_NUMBER=...
```

Optional tuning:

```env
COUPON_PAYOUT_WORKER_INTERVAL_MS=300000   # poll pending every 5 min
```

### Flow

```
Redeem → payout_status = pending
Worker picks pending → lock redemption (FOR UPDATE)
  → skip if initiated attempt already exists
  → insert payout_attempts (initiated) — unique per redemption at DB level
  → Razorpay API (outside DB transaction)
  → on API accept: store razorpay_payout_id on attempt (still initiated)

Webhook arrives → verify HMAC signature
  → INSERT razorpay_webhook_events (status: received)
  → process payout event
  → markOutcome: processed | ignored | failed

Webhook payout.processed (transaction):
  → payout_attempts = success
  → redemption = paid, paid_via = razorpay

Webhook payout.failed / payout.reversed (transaction):
  → payout_attempts = failed + failure_reason
  → redemption stays pending, last_payout_error set
  → you pay manually OR retry (only when no initiated attempt remains)
```

Duplicate webhook deliveries with the same `razorpay_event_id` are ignored once the event row is `processed` or `ignored`.

### Concurrency (Phase 3)

| Guard | Purpose |
|---|---|
| `SELECT … FOR UPDATE` on `redemptions` | Only one payout worker/retry creates an attempt at a time |
| `SELECT … FOR UPDATE` on in-flight `payout_attempts` | Check initiated attempt inside same transaction as redemption lock |
| Reject if `initiated` attempt exists | Prevents duplicate Razorpay API calls |
| Partial unique index on `payout_attempts(redemption_id) WHERE status = 'initiated'` | DB-level backstop for concurrent workers / multi-instance deploys |
| `retryPayout` blocked while `initiated` | Admin must wait for webhook or failed attempt before retry |
| `markPaid` uses `WHERE payout_status = 'pending'` | Prevents double mark-paid |
| Payout failure updates in one transaction | `payout_attempts.failed` + `redemptions.last_payout_error` stay in sync |
| Webhook success in one transaction | `payout_attempts.success` + `redemptions.paid` stay in sync |
| `razorpay_event_id UNIQUE` on webhook events | Idempotent webhook replay |

### Payment design decisions

| Decision | Choice |
|---|---|
| `payout_attempts` scope | **Razorpay tries only** — not manual payments |
| Manual pay after Razorpay fail | Update `redemptions` only; failed attempt row stays failed |
| `paid_via` on manual fallback | Always `manual`, even if Razorpay tried first |
| Amount sent to Razorpay | Always `total_amount_paise` (includes bonuses) |

### Tables (Phase 3)

| Table | Purpose |
|---|---|
| `payout_attempts` | Each Razorpay try (initiated / success / failed) |
| `razorpay_webhook_events` | Raw webhook payloads + processing outcome (`received` → `processed` / `ignored` / `failed`) |

`getRedemptionById` returns both `payoutAttempts[]` (try history) and `webhookEvents[]` (audit trail).

### Phase 3 APIs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/webhooks/razorpay` | HMAC signature | Razorpay webhook (no JWT — signature only) |
| POST | `/retryPayout/:redemptionId` | JWT | Re-queue payout |
| GET | `/getPayoutAttempts/:redemptionId` | JWT | Razorpay try history |

---

## Phase 4 — Analytics

### Purpose

Ops visibility: redemption rates, payout totals, fraud signals.

### APIs — `/api/v1/coupons/analytics` (JWT required)

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/getOverview` | Totals: generated, redeemed, pending/paid amounts |
| GET | `/getBatchPerformance` | Per-batch redemption rate + payout stats |
| GET | `/getRedemptionTrends` | Daily/weekly/monthly redeem counts |
| GET | `/getPayoutSummary` | Pending vs paid (manual vs razorpay) |
| GET | `/getRedeemerLeaderboard` | Top redeemers by count or amount |
| GET | `/getFraudSignals` | Failed attempts with breakdown by reason, suspicious IPs/phones |
| GET | `/getPromotionRulePerformance` | Per-rule bonus totals and application counts |

Query params: `fromDate`, `toDate`, `batchId`, `granularity`, `limit`, `sortBy` where applicable. Date filters use `YYYY-MM-DD` strings (inclusive end-of-day for `toDate`).

`getFraudSignals` includes `failureReasonBreakdown` (counts per `failure_reason`, including `expired`).

---

## Phase 5 — Customer Authentication & Self-Service

### Purpose

Phone + OTP login for the public redeem portal. Customers can view redemption history and payout status without calling support. All coupon operations (`verifyCoupon`, `redeemCoupon`) require a valid JWT.

### Authentication model

| Token | Lifetime | Storage (client) | Use |
|---|---|---|---|
| **Access token** | 15 minutes | Memory / app state | `Authorization: Bearer` on API calls |
| **Refresh token** | 7 days | `localStorage` (hashed server-side) | `POST /refreshToken` when access expires |

**Token rotation:** Each refresh revokes the old refresh token and issues a new pair.

See `docs/REFRESH_TOKEN_SYSTEM.md` for full security rationale and frontend patterns.

### OTP flow

```
POST /sendOtp { phone }
  → 6-digit OTP via Kaleyra SMS (10 min expiry)
  → Rate limit: max 3 OTPs / 15 min / phone; max 10 req / min / IP

POST /verifyOtp { phone, otp }
  → Max 3 wrong attempts per OTP
  → Returns accessToken + refreshToken
```

In development, if Kaleyra is not configured or `COUPON_PUBLIC_SMS_ENABLED=false`, OTP is stored in DB without SMS and logged to the server console — see `docs/COUPON_PUBLIC_UI_INTEGRATION.md`.

### Tables (Phase 5)

| Table | Purpose |
|---|---|
| `public_otp_verifications` | OTP records (phone, code, expiry, attempts, verified flag) |
| `public_refresh_tokens` | Refresh token hashes (SHA-256), session metadata, revocation |

### Phase 5 behaviour

- **Phone binding:** `verifyCoupon` and `redeemCoupon` use phone from JWT (`req.publicUser.phone`), not request body
- **Redeem body:** `phone` is optional in `redeemCoupon` schema — server overrides with authenticated phone
- **Payout status:** `GET /payoutStatus/:publicRef` returns status only if redemption belongs to logged-in user
- **Logout:** Revokes refresh token in DB; access token expires naturally (15 min)

### Bank KYC (bank payout path only)

Two-step flow — Surepass is **not** called inside `redeemCoupon`:

```
1. GET /coupons/public/verifyBankAccount?account_number=&ifsc_code=  (public JWT)
      → Surepass lookup → returns holder name + kyc_verification_details.bank snapshot
2. User confirms holder name on UI
3. POST /redeemCoupon with bank fields + kyc_verification_details (snapshot from step 1)
      → server compares body to snapshot (exact account, IFSC, holder name)
      → redeemer.bank_details_verified_at set on success
```

| Path | Bank KYC required? |
|---|---|
| UPI redeem (`upi_vpa` only) | No |
| Bank redeem (`account_number` + `ifsc`) | Yes — `kyc_verification_details.bank` snapshot required |

Admin `GET /kyc/bank/verify` (admin JWT) still works for back-office; public portal uses the coupon-scoped endpoint above.

Redeemers store `kyc_verification_details`, `bank_details_verified_at`, `bank_verification_error` (migration 165). Bank field changes clear verification (same pattern as vendors).

### Phase 5 APIs

Already listed under Phase 1 public table above. Auth-free endpoints: `sendOtp`, `verifyOtp`, `refreshToken` only.

---

## Key request/response examples

### Send OTP

```http
POST /api/v1/coupons/public/sendOtp
Content-Type: application/json

{ "phone": "9876543210" }
```

### Verify OTP (login)

```http
POST /api/v1/coupons/public/verifyOtp
Content-Type: application/json

{ "phone": "9876543210", "otp": "123456" }
```

Response:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "dGhpc2lz...",
    "accessTokenExpiresAt": "2026-07-05T14:20:00.000Z",
    "refreshTokenExpiresAt": "2026-07-12T14:05:00.000Z",
    "phone": "9876543210"
  }
}
```

### Refresh access token

```http
POST /api/v1/coupons/public/refreshToken
Content-Type: application/json

{ "refreshToken": "dGhpc2lz..." }
```

### Verify coupon

```http
POST /api/v1/coupons/public/verifyCoupon
Authorization: Bearer <access_token>
Content-Type: application/json

{ "code": "AB12CD34" }
```

Valid response:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "faceValuePaise": 5000,
    "faceValueRupees": 50,
    "currency": "INR"
  }
}
```

### Redeem coupon

```http
POST /api/v1/coupons/public/redeemCoupon
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "code": "AB12CD34",
  "name": "Rajesh Kumar",
  "upi_vpa": "rajesh@paytm",
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}
```

Phone is taken from the JWT; do not rely on a `phone` field in the body.

Response:
```json
{
  "success": true,
  "data": {
    "redemptionId": "uuid",
    "publicRef": "RED-2026-A1B2",
    "baseAmountPaise": 5000,
    "bonusAmountPaise": 0,
    "totalAmountPaise": 5000,
    "payoutStatus": "pending",
    "appliedRules": [],
    "message": "Redemption successful"
  }
}
```

### Check payout status (customer)

```http
GET /api/v1/coupons/public/payoutStatus/RED-2026-A1B2
Authorization: Bearer <access_token>
```

Response:
```json
{
  "success": true,
  "data": {
    "publicRef": "RED-2026-A1B2",
    "code": "AB12CD34",
    "totalAmountPaise": 6000,
    "payoutStatus": "paid",
    "paidAt": "2026-07-04T10:30:00.000Z",
    "paidVia": "razorpay",
    "lastPayoutError": null,
    "redeemedAt": "2026-07-03T15:20:00.000Z"
  }
}
```

### Mark paid (manual)

```http
POST /api/v1/coupons/admin/markRedemptionPaid/:id
Authorization: Bearer <token>
Content-Type: application/json

{ "payment_reference": "UPI987654321" }
```

---

## Security, concurrency & fraud prevention

Defense in depth: **row locks** for races, **optimistic `UPDATE … WHERE` guards** for state transitions, **DB unique constraints** as backstops, **auth boundaries** between public/admin/webhook, and **audit tables** for forensics.

Automated coverage: `npm run test:coupon-fraud` (`src/scripts/test-coupon-fraud.ts`).

---

### Row-level locks (`SELECT … FOR UPDATE`)

Locks serialize concurrent writers on the same row so only one transaction wins.

| Where | Row locked | Why |
|---|---|---|
| **Redeem** (`coupon-redeem.service`) | `coupons` by code | Two simultaneous redeems on the same code cannot both pass validation |
| **Redeem** (`coupon-redeem.service`) | `redeemers` by phone | Promotion rules (e.g. `FIRST_TIME`) read `total_redemptions` — lock prevents two concurrent redeems from both seeing count `0` |
| **Admin void** (`coupon-admin.service`) | `coupons` by code | Admin void and customer redeem cannot both succeed — loser hits state machine / `updateStatusIf` failure |
| **Batch code generation** (`coupon-batch.service`) | `coupon_batches` | Prevents duplicate chunk generation if generate is clicked twice or two workers run |
| **Mark batch printed / allotted** (`coupon-batch.service`) | All `coupons` in batch with expected `from` status | Bulk transition is consistent; coupons added mid-flight are not half-updated |
| **Acquire payout attempt** (`razorpay-payout.service`) | `redemptions` | Only one worker/admin retry creates an `initiated` payout attempt at a time |
| **Acquire payout attempt** (`razorpay-payout.service`) | Latest `payout_attempts` with `status = initiated` | Confirms no in-flight Razorpay call inside the same transaction as the redemption lock |

---

### Optimistic guards (`UPDATE … WHERE current = expected`)

If a row changed between read and write, the update affects 0 rows and the operation fails safely.

| Where | Guard | Why |
|---|---|---|
| **State machine** (`coupon-state.machine`) | `UPDATE coupons SET status = $to WHERE coupon_id = $id AND status = $from` | Concurrent void vs redeem — only the transaction that still sees the expected status wins |
| **Manual mark paid** (`redemption.dao`) | `WHERE payout_status = 'pending'` | Double mark-paid returns no row → `400` |
| **Razorpay mark paid** (webhook handler) | Same `pending` guard inside transaction | Webhook replay cannot re-mark an already paid redemption |
| **Bulk batch transitions** (`coupon.dao`) | `WHERE coupon_batch_id = $id AND status = $from` | Only eligible coupons transition (e.g. printed → allotted) |

---

### Database constraints (hard backstops)

| Constraint | Prevents |
|---|---|
| `coupons.code` UNIQUE | Duplicate codes in inventory |
| `redemptions.coupon_id` UNIQUE | More than one redemption per coupon (double spend) |
| `redemptions.idempotency_key` UNIQUE | Replay of the same client request creating two rows |
| `redemptions.public_ref` UNIQUE | Colliding customer references |
| `redeemers.phone` UNIQUE | Duplicate redeemer identities |
| `public_refresh_tokens.token_hash` UNIQUE | Token hash collision (extremely unlikely; indexed lookup) |
| `payout_attempts(redemption_id) WHERE status = 'initiated'` UNIQUE (migration 159) | Two in-flight Razorpay attempts for one redemption |
| `razorpay_webhook_events.razorpay_event_id` UNIQUE (migration 164) | Processing the same webhook delivery twice |

---

### Transaction boundaries

| Operation | Atomic updates |
|---|---|
| **Full redeem** | Redeemer upsert → rule eval → redemption insert → rule applications → coupon → redeemed → stats increment |
| **Payout API failure** | `payout_attempts.failed` + `redemptions.last_payout_error` |
| **Webhook payout.processed** | `payout_attempts.success` + `redemptions` mark paid |
| **Webhook payout.failed** | `payout_attempts.failed` + `redemptions.last_payout_error` |
| **Admin void coupon** | State machine transition + history insert |

Razorpay HTTP call runs **outside** the acquire-attempt transaction (network I/O should not hold DB locks).

---

### Authentication & access control

| Surface | Protection |
|---|---|
| **Admin / analytics** | JWT required on all routes except Razorpay webhook |
| **Public verify / redeem** | JWT required; token `type` must be `public` (admin tokens rejected) |
| **Phone binding** | `redeemCoupon` uses `req.publicUser.phone` from JWT — body `phone` is ignored |
| **Payout status** | `GET /payoutStatus/:publicRef` only returns redemptions owned by logged-in phone |
| **Razorpay webhook** | `x-razorpay-signature` HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`; `timingSafeEqual` comparison |
| **Refresh tokens** | Stored as SHA-256 hash only; rotation on refresh; revocable via logout |

---

### Rate limiting & OTP hardening

| Control | Limit |
|---|---|
| Public authenticated routes | 20 req/min/IP (`COUPON_PUBLIC_RATE_LIMIT_MAX` override) |
| OTP send / verify | 10 req/min/IP |
| OTPs per phone | Max 3 per 15 minutes |
| Wrong OTP guesses | Max 3 per OTP record, then must request new OTP |
| OTP expiry | 10 minutes |
| Access token | 15 minutes |
| Refresh token | 7 days |

Dev: `COUPON_PUBLIC_SMS_ENABLED=false` stores OTP in DB and logs it to the console.

---

### Audit & observability

| Table | What it captures |
|---|---|
| `coupon_status_history` | Every coupon status change (append-only) |
| `redemption_attempts` | Every failed verify/redeem (code, phone, IP, `failure_reason`) |
| `rule_applications` | Which promotion rules fired and bonus amounts |
| `payout_attempts` | Each Razorpay try (initiated → success/failed) |
| `razorpay_webhook_events` | Full webhook JSON + `processed` / `ignored` / `failed` outcome |

Analytics `getFraudSignals` surfaces failed attempt counts, reason breakdown, and suspicious IPs/phones.

---

### Fraud scenarios prevented

Mapped to `test:coupon-fraud` groups. Each row: **threat → how we stop it**.

#### Brute force / code guessing

| Threat | Mitigation |
|---|---|
| Attacker probes random codes via verify | Invalid attempts logged in `redemption_attempts` with `failure_reason` (`not_found`, `invalid_format`, etc.) |
| SQL injection / malformed codes | Joi validation rejects before DB; parameterized queries |
| Ops blind to probing | `getFraudSignals` aggregates failed attempts by reason, IP, phone |

#### Double spend (same coupon)

| Threat | Mitigation |
|---|---|
| Same code, different idempotency keys | `SELECT FOR UPDATE` on coupon + `redemptions.coupon_id UNIQUE` — second redeem gets `already_redeemed` |
| Concurrent redeem bursts (8+ parallel requests) | Row lock + transaction — exactly one success, one redemption row |
| Coupon status after race | Winner sets `redeemed`; losers fail validation |

#### Replay / idempotency abuse

| Threat | Mitigation |
|---|---|
| Network retry sends same redeem body twice | `idempotency_key UNIQUE` — second call returns same redemption, no new row |
| Reuse idempotency key on a different coupon | Key already bound to first redemption — second coupon stays `allotted` |

#### Lifecycle bypass

| Threat | Mitigation |
|---|---|
| Redeem before batch allotted (`created` / `printed`) | `REDEEMABLE_COUPON_STATUS = allotted` enforced in verify + redeem |
| Redeem void or expired coupon | Status + `expires_at` checks; logged as `void` / `expired` |
| Admin void vs customer redeem race | `FOR UPDATE` + `updateStatusIf` — one wins, other fails |

#### Bonus gaming

| Threat | Mitigation |
|---|---|
| Two concurrent first redeems same phone claim `FIRST_TIME` twice | `FOR UPDATE` on redeemer before rule evaluation — serializes counter; only first redeem sees `total_redemptions = 0` |
| Rule stacking inflation | Rules evaluated once per redeem inside locked transaction; `rule_applications` audit trail |

#### Auth abuse

| Threat | Mitigation |
|---|---|
| Unauthenticated admin payout / batch export | JWT middleware — `401` without valid admin token |
| Public user marks own redemption paid | Admin routes require admin JWT |
| Admin JWT on public endpoints | Public middleware rejects `type !== 'public'` |
| Unauthenticated verify/redeem | `401` without public JWT |

#### Webhook forgery

| Threat | Mitigation |
|---|---|
| Fake `payout.processed` without signature | Rejected — missing/invalid `x-razorpay-signature` |
| Forged signature | HMAC does not match — `400` |
| Replay of legitimate webhook | `razorpay_event_id UNIQUE` + skip if already `processed`/`ignored` |
| Webhook for unknown payout ID | Stored as `ignored`; no redemption state change |

#### Payout manipulation

| Threat | Mitigation |
|---|---|
| Double mark-paid (inflate paid count) | `markPaid` checks `payout_status !== 'paid'`; SQL `WHERE pending` |
| Retry Razorpay on already-paid redemption | `retryPayout` rejects if `payout_status = paid` |
| Duplicate Razorpay API calls | One `initiated` attempt per redemption (app check + partial unique index) |
| Inconsistent failure state | Failure path updates attempt + `last_payout_error` in one transaction |

#### Input validation abuse

| Threat | Mitigation |
|---|---|
| Redeem without idempotency key or payment details | Joi schema — `400` |
| Spoof phone in redeem body to claim another user's identity | Server overrides with JWT phone |

#### Data exposure

| Policy | Detail |
|---|---|
| Verify on valid code | Returns face value only — no redeemer phone/UPI/history |
| Admin redemption detail | Full bank/UPI fields for payout ops — **admin JWT only** (intentional for finance UI) |
| Public history | User sees only their own redemptions via JWT-scoped queries |

---

### Quick reference table

| Feature | Implementation |
|---|---|
| Code uniqueness | DB `UNIQUE(code)` + crypto random generator |
| Double redeem prevention | `FOR UPDATE` on coupon + `redemptions.coupon_id UNIQUE` |
| Idempotent redeem | Client UUID in `idempotency_key UNIQUE` |
| Promotion bonus races | `FOR UPDATE` on redeemer by phone before rule evaluation |
| Admin void vs redeem race | `FOR UPDATE` on coupon + `updateStatusIf` |
| Duplicate Razorpay payout | Lock redemption + one `initiated` attempt (app + partial unique index) |
| Webhook idempotency | `razorpay_webhook_events.razorpay_event_id UNIQUE` |
| Public auth | OTP + JWT (15 min) + refresh token (7 days, SHA-256 hashed) |
| Public phone binding | Phone from JWT on verify/redeem |
| Only allotted redeemable | Validated in verify + redeem |
| State machine | Explicit allowed transitions; illegal transitions rejected |

---

## Background jobs

| Job | Trigger | Action |
|---|---|---|
| **Expiry cron** | Every `COUPON_EXPIRY_CRON_MS` (default 24h) when `COUPON_EXPIRY_CRON_ENABLED=true` | `printed`/`allotted` past expiry → `expired` (skips coupons with NULL expiry) |
| **Payout worker** | Every `COUPON_PAYOUT_WORKER_INTERVAL_MS` (default 5m) | Process pending redemptions via Razorpay (Phase 3 only) |
| **Refresh token cleanup** | Optional cron | Delete refresh tokens expired >30 days (`refreshTokenService.cleanupExpired`) |

Both expiry cron and payout worker start automatically when the server starts (`src/bin/init.ts`).

---

## Environment variables

```env
# Optional — used in CSV export redeem URLs
COUPON_REDEEM_BASE_URL=https://redeem.yoursite.com

# Background job intervals
COUPON_EXPIRY_CRON_ENABLED=false
COUPON_EXPIRY_CRON_MS=86400000
COUPON_PAYOUT_WORKER_INTERVAL_MS=300000

```env
# Dev / staging public portal
COUPON_PUBLIC_SMS_ENABLED=false
COUPON_PUBLIC_RATE_LIMIT_MAX=20         # raise in test scripts

# Phase 3 — off by default
COUPON_PAYOUT_ENABLED=false
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PAYOUT_ACCOUNT_NUMBER=
```

---

## Testing

### Smoke test (automated)

```bash
# Terminal 1
COUPON_PUBLIC_RATE_LIMIT_MAX=500 npm run dev

# Terminal 2
npm run test:coupon-flow
npm run test:coupon-comprehensive   # failure/duplicate scenarios
```

Script: `src/scripts/test-coupon-full-flow.ts` — covers batch lifecycle, verify, redeem, idempotency, rules bonus, mark paid, analytics.

Comprehensive suite: `src/scripts/test-coupon-comprehensive.ts` — 35+ cases including void, duplicate redeem, payout edge cases, promotion rules.

Fraud suite: `src/scripts/test-coupon-fraud.ts` — brute-force logging, double-spend races, replay/idempotency abuse, lifecycle bypass, bonus gaming, auth abuse, webhook forgery, payout manipulation, input validation, PII leakage.

**Note:** Public `verifyCoupon` / `redeemCoupon` now require JWT. Existing smoke/comprehensive scripts may need OTP login steps added before public API calls.

```bash
npm run test:coupon-fraud
```

### Postman collection

Import: `docs/coupon-postman-collection.json`

Run **Auth → Login Admin** first; token is saved to collection variable `authToken`.

---

## Database schema summary

```
coupon_batches (1) ──< coupons (N)
coupons (1) ──< coupon_status_history (N)
coupons (1) ──< redemptions (0..1)     UNIQUE coupon_id
redeemers (1) ──< redemptions (N)
redemptions (1) ──< rule_applications (N)
redemptions (1) ──< payout_attempts (N)   Razorpay only
redemptions (1) ──< razorpay_webhook_events (N)   webhook audit (optional link)
payout_attempts (1) ──< razorpay_webhook_events (0..N)   via payout_attempt_id
promotion_rules (1) ──< rule_applications (N)
redeemers (1) ──< public_refresh_tokens (N)   by phone
```

**Key constraints:**
- `coupons.code` — UNIQUE
- `redemptions.coupon_id` — UNIQUE (one redeem per coupon)
- `redemptions.public_ref` — UNIQUE (customer reference, e.g. `RED-2026-A1B2`)
- `redemptions.idempotency_key` — UNIQUE
- `redeemers.phone` — UNIQUE
- `public_refresh_tokens.token_hash` — UNIQUE
- `payout_attempts(redemption_id) WHERE status = 'initiated'` — UNIQUE (one in-flight Razorpay try per redemption)
- `razorpay_webhook_events.razorpay_event_id` — UNIQUE (webhook idempotency)

---

## What's intentionally not included (yet)

- Email notifications on redeem
- Password-based login (OTP-only for public portal)
- Customer profile editing (read-only history/profile APIs)
- Push notifications
- Tiered / pool / hybrid reward types (`TIERED`, `BONUS_POOL`, etc. — see `promotion-rewards.ts`)
- Separate ledger / accounting table (redemptions + payout_attempts + webhook_events suffice for v1)
- Dealer/region allocation tracking
- Unified redemption event log for manual actions (webhook_events cover Razorpay; manual pay is on `redemptions` only)

These can be added later without changing the core schema.

---

## Related docs

| Doc | Purpose |
|---|---|
| `docs/COUPON_ADMIN_UI_INTEGRATION.md` | Admin CMS integration |
| `docs/COUPON_PUBLIC_UI_INTEGRATION.md` | Public portal (OTP, redeem, history) |
| `docs/REFRESH_TOKEN_SYSTEM.md` | Access/refresh token design & frontend patterns |
| `docs/coupon-postman-collection.json` | Postman collection |

---

## Quick reference: which phase do I need?

| I want to… | Phase |
|---|---|
| Print coupons and track inventory | 1 |
| Let customers redeem online | 1 + 5 (OTP login required) |
| Pay customers manually via UPI | 1 |
| Customer views own redemption history | 5 |
| Customer checks payout status by reference | 5 |
| Give bonus on 5th redeem / first redeem | 2 |
| Auto-pay via Razorpay | 3 (+ env config) |
| See redemption rates and pending payouts | 4 |
