# Coupon Module — Public UI Integration Guide

Frontend integration reference for the **customer-facing redeem website/app**: OTP login, verify coupon, redeem, view history, and payout status.

**Authentication required** for all coupon operations. Rate-limited.

---

## Base configuration

| Item | Value |
|---|---|
| **Base URL** | `{API_HOST}/api/v1` |
| **Public prefix** | `/coupons/public` |
| **Auth** | **None**: sendOtp, verifyOtp, refreshToken |
|  | **Bearer access JWT**: verifyCoupon, redeemCoupon, myRedemptions, myProfile, payoutStatus, logout, logoutAll, sessions |
| **Rate limit** | 20 requests / minute / IP (coupon + refreshToken endpoints; override via `COUPON_PUBLIC_RATE_LIMIT_MAX`) |
|  | 10 requests / minute / IP (OTP endpoints) |
| **Content-Type** | `application/json` |

**IMPORTANT:** All users must log in with phone + OTP before accessing any coupon operations.

### Standard response envelope

```typescript
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;        // present on HTTP errors
  timestamp: string;
  isSessionValid?: boolean; // always true on public routes (admin portal uses this for session checks)
}
```

### HTTP status codes

| Code | When |
|---|---|
| 200 | Verify success; idempotent redeem retry; OTP sent; authenticated requests |
| 201 | New redemption created |
| 400 | Validation error, invalid/expired/already-used coupon, bad OTP |
| 401 | Missing/invalid/expired JWT token (authenticated endpoints) |
| 429 | Rate limit exceeded |
| 500 | Server error |

On `400` errors, body: `{ success: false, error: "message" }`

On verify, invalid coupons still return **`200`** with `data.valid: false` (not HTTP 400).

---

## Recommended public screens

```
Landing page
  ↓
OTP Login (mandatory)
  ├── Enter phone number
  ├── Request OTP
  ├── Enter 6-digit OTP
  └── Verify → Receive access + refresh tokens
        ↓
Authenticated Home
  ├── Enter coupon code
  ├── Verify coupon (requires auth)
  └── View my redemptions / profile
        ↓
Verify result
  ├── Valid → show prize amount + redeem form
  └── Invalid → show error message
        ↓
Redeem form
  ├── Name
  ├── Phone (auto-filled from login, read-only)
  ├── UPI ID  (or bank details)
  └── Submit
        ↓
Success
  ├── Confirmation message
  ├── publicRef (reference number)
  ├── Total amount (base + bonus)
  ├── "Payment will be transferred shortly"
  └── View my redemptions
```

---

## URL / deep link support

Coupons printed with a redeem URL from admin CSV export:

```
https://redeem.yoursite.com?code=AB12CD34
```

**UI on load:**
1. Read `code` from query string
2. Pre-fill code input
3. Optionally auto-call verify on mount

**Code format:**
- Exactly **8 characters**
- Alphanumeric uppercase: `A-Z`, `2-9`
- Excludes ambiguous: `0`, `O`, `1`, `I`, `L`
- Normalize client-side: `code.trim().toUpperCase()`

---

## User flow (step by step)

```
Step 1   User lands on redeem page (optionally pre-fill code from ?code= query param)
Step 2   OTP login (mandatory): sendOtp → verifyOtp
Step 3   Store refresh token in localStorage; keep access token in memory (~15 min)
Step 4   User enters or scans 8-char coupon code
Step 5   Call verifyCoupon (Authorization: Bearer accessToken)
Step 6a  Valid   → show prize amount + redeem form
Step 6b  Invalid → show error (do not show form)
Step 7   User fills name + UPI/bank (phone from login, read-only)
Step 8   Generate idempotency_key (UUID) — store in sessionStorage until success
Step 9   Call redeemCoupon (Authorization: Bearer accessToken)
Step 10  Success screen with publicRef + total amount (base + bonus)
Step 11  Optional: myRedemptions / payoutStatus / myProfile; logout revokes refresh token
```

---

## API 1 — Verify coupon

**Authentication required.** Read-only for coupon state — does **not** mark a coupon redeemed. Failed attempts are logged server-side for fraud analytics (`redemption_attempts`); successful verify does not create a redemption row.

```http
POST /api/v1/coupons/public/verifyCoupon
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes | 8-char alphanumeric |

```json
{ "code": "AB12CD34" }
```

**Note:** Phone number is automatically pulled from the authenticated user's JWT token.

### Response — valid coupon

HTTP `200`

```json
{
  "success": true,
  "data": {
    "valid": true,
    "faceValuePaise": 5000,
    "faceValueRupees": 50,
    "currency": "INR"
  },
  "timestamp": "2026-03-20T12:00:00.000Z"
}
```

**UI display:**
```
🎉 Congratulations! You won ₹50!
Enter your details below to claim your reward.
```

Use `faceValueRupees` for display. Note: **final payout may be higher** if promotion rules apply (bonus shown only after redeem).

### Response — invalid coupon

HTTP `200` (still success envelope — check `data.valid`)

```json
{
  "success": true,
  "data": {
    "valid": false,
    "message": "This coupon is not valid",
    "reason": "not_found"
  }
}
```

### Verify `reason` codes → UI messages

| reason | Default message | Recommended UI |
|---|---|---|
| `invalid_format` | This coupon is not valid | Generic invalid |
| `not_found` | This coupon is not valid | Generic invalid (don't reveal code doesn't exist) |
| `not_allotted` | This coupon is not valid | Generic invalid |
| `void` | This coupon is not valid | Generic invalid |
| `already_redeemed` | This coupon has already been used | Specific — can show this one |
| `expired` | This coupon has expired | Specific — can show this one |

**Security:** Use vague copy for `not_found` / `not_allotted` / `void`. Only be specific for `already_redeemed` and `expired`.

### Verify UI validation (client-side, before API)

```typescript
const CODE_REGEX = /^[A-Z0-9]{8}$/;

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s/g, '');
}

function isValidFormat(code: string): boolean {
  return CODE_REGEX.test(code);
}
```

Disable Verify button until 8 valid characters entered.

---

## API 1b — Verify bank account (bank payout only)

**Authentication required.** Calls Surepass **before** redeem — separate from `redeemCoupon`. UPI-only redeems skip this step.

```http
GET /api/v1/coupons/public/verifyBankAccount?account_number=123456789012&ifsc_code=HDFC0001234
Authorization: Bearer <jwt_token>
```

### Success response (shape)

```json
{
  "success": true,
  "data": {
    "accountHolderName": "RAJESH KUMAR",
    "accountNumber": "123456789012",
    "ifscCode": "HDFC0001234",
    "bankName": "HDFC BANK",
    "kyc_verification_details": {
      "bank": {
        "provider": "surepass",
        "verified_at": "2026-07-06T12:00:00.000Z",
        "raw": { },
        "mapped": { }
      }
    }
  }
}
```

Show `accountHolderName` to the user for confirmation, then pass **`kyc_verification_details` unchanged** into `redeemCoupon`.

---

## API 2 — Redeem coupon

**Authentication required.** Creates redemption, marks coupon redeemed, stores user details.

```http
POST /api/v1/coupons/public/redeemCoupon
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes | Same code verified in step 3 |
| `name` | string | yes | max 255 |
| `phone` | string | **no** | Optional - phone is pulled from JWT token |
| `upi_vpa` | string | conditional | Required if no bank account |
| `account_holder_name` | string | conditional | Required for bank payout |
| `account_number` | string | conditional | Bank payout |
| `ifsc` | string | conditional | Required for bank payout (11 chars) |
| `bank_name` | string | no | |
| `kyc_verification_details` | object | conditional | **Required when using bank account** — from `verifyBankAccount` |
| `idempotency_key` | string | yes | Client-generated UUID, max 64 |

**Either `upi_vpa` OR `account_number` is required.**

**Bank payout:** Call `GET /verifyBankAccount` first, show holder name, then redeem with the returned `kyc_verification_details`. Do not call Surepass inside redeem.

**UPI payout:** No bank KYC — `upi_vpa` only (recommended when Razorpay auto payout is enabled).

**Note:** Phone is automatically taken from the authenticated user's JWT token, ensuring the redemption is tied to the logged-in user.

### Example — UPI redeem

```json
{
  "code": "AB12CD34",
  "name": "Rajesh Kumar",
  "upi_vpa": "rajesh@paytm",
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Example — Bank redeem

After `GET /verifyBankAccount`, include the returned snapshot:

```json
{
  "code": "AB12CD34",
  "name": "Rajesh Kumar",
  "account_holder_name": "Rajesh Kumar",
  "account_number": "123456789012",
  "ifsc": "HDFC0001234",
  "bank_name": "HDFC Bank",
  "kyc_verification_details": {
    "bank": { "provider": "surepass", "verified_at": "...", "raw": {}, "mapped": {} }
  },
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Response — success

HTTP `201`

```json
{
  "success": true,
  "message": "Redemption successful",
  "data": {
    "redemptionId": "uuid",
    "publicRef": "RED-2026-A1B2",
    "baseAmountPaise": 5000,
    "bonusAmountPaise": 1000,
    "totalAmountPaise": 6000,
    "payoutStatus": "pending",
    "appliedRules": [
      { "name": "5th coupon bonus", "bonusPaise": 1000 }
    ],
    "message": "Redemption successful"
  },
  "timestamp": "2026-03-20T12:05:00.000Z"
}
```

### Response fields for UI

| Field | Display |
|---|---|
| `publicRef` | Reference number: *"Your reference: RED-2026-A1B2"* |
| `baseAmountPaise` | Base coupon value |
| `bonusAmountPaise` | Extra from promotion rules (0 if none) |
| `totalAmountPaise` | **Total customer will receive** |
| `payoutStatus` | Always `pending` on success |
| `appliedRules` | Optional breakdown: *"+ ₹10 loyalty bonus"* |

**Success screen copy (Phase 1 — manual payout):**
```
✓ Redemption successful!

Reference: RED-2026-A1B2
Amount: ₹60 (₹50 coupon + ₹10 bonus)

Your reward will be transferred to rajesh@paytm within 2-3 business days.
```

**Success screen copy (Phase 3 — Razorpay enabled):**
```
✓ Redemption successful!

₹60 will be transferred to your UPI shortly.
Reference: RED-2026-A1B2
```

---

## Idempotency (critical for mobile networks)

Generate **one UUID per redeem attempt** and reuse on retry:

```typescript
import { randomUUID } from 'crypto'; // or crypto.randomUUID() in browser

let idempotencyKey: string | null = null;

function getOrCreateIdempotencyKey(): string {
  if (!idempotencyKey) {
    idempotencyKey = crypto.randomUUID();
    // Persist in sessionStorage until success:
    sessionStorage.setItem('redeem_idempotency_key', idempotencyKey);
  }
  return idempotencyKey;
}

// On success, clear:
sessionStorage.removeItem('redeem_idempotency_key');
```

If the network fails after redeem succeeded, **retry with the same key** — server returns the same redemption (HTTP `201`) without double-redeeming.

**Never reuse idempotency key for a different coupon.**

---

## Error handling on redeem

HTTP `400` with `{ success: false, error: "..." }`

| Error message | Cause | UI action |
|---|---|---|
| `This coupon is not valid` | Wrong code / not allotted / void | Back to code entry |
| `This coupon has already been used` | Double submit / shared link | Show already used |
| `This coupon has expired` | Past expiry | Show expired |
| `Either upi_vpa or account_number is required` | Missing payout details | Highlight form fields |
| `Invalid phone number` | Bad phone format | Highlight phone field |
| Joi validation messages | Malformed request | Show field errors |

On rate limit (`429`): *"Too many attempts. Please wait a minute and try again."*

---

## Form validation (client-side)

### Phone

```typescript
function isValidIndianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || (digits.startsWith('91') && digits.length === 12);
}
```

Display formatted; send as user typed (server normalizes to 10 digits).

### UPI VPA

Basic check: contains `@`, min length 3.

```typescript
function isValidUpi(vpa: string): boolean {
  return /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(vpa.trim());
}
```

### Name

Required, min 2 characters.

---

## Phase 2 — Promotion rules (public UI impact)

Rules are evaluated **server-side at redeem**. Public UI does not call rule APIs.

**What changes for public UI:**

| Before rules | After rules |
|---|---|
| Success shows face value only | Success shows base + bonus + total |
| N/A | Show `appliedRules` breakdown if `bonusAmountPaise > 0` |

**Example bonus display:**
```
Coupon value:     ₹50
Loyalty bonus:   + ₹10
─────────────────────
Total payout:     ₹60
```

Do **not** promise bonus amount on verify screen — bonus is only known after redeem (depends on user's redeem history and active rules).

---

## Phase 3 — Razorpay (public UI impact)

When `COUPON_PAYOUT_ENABLED=true` on backend:

- Redeem API response is **identical** (`payoutStatus: "pending"`)
- Payout happens automatically in background
- Public UI copy can say *"transferred shortly"* instead of *"2-3 business days"*
- No Razorpay SDK needed on public frontend — all payout is server-side

If auto payout fails, customer still sees success (redemption is valid). Ops team handles failed payouts in admin.

**UPI required for Razorpay:** If only bank details provided and no UPI, Razorpay auto payout may fail — prefer collecting UPI on public form when Phase 3 is active.

---

## Complete React-style integration example

Minimal flow using in-memory access token (see **Token management example** below for refresh/logout).

```typescript
const API = '/api/v1/coupons/public';

// Assume accessToken is set after verifyOtp (memory) — see Token management example
let accessToken: string | null = null;

function authHeaders(): HeadersInit {
  if (!accessToken) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

async function verifyCoupon(code: string) {
  const res = await fetch(`${API}/verifyCoupon`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });
  if (res.status === 401) throw new Error('Session expired — login again');
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function redeemCoupon(payload: {
  code: string;
  name: string;
  upi_vpa: string;
  idempotency_key: string;
}) {
  const res = await fetch(`${API}/redeemCoupon`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload), // phone omitted — taken from JWT
  });
  if (res.status === 401) throw new Error('Session expired — login again');
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function handleVerify(code: string) {
  const result = await verifyCoupon(code);
  if (!result.valid) {
    showError(result.message);
    return;
  }
  showPrize(result.faceValueRupees);
  showRedeemForm(code);
}

async function handleRedeem(form: RedeemForm, code: string) {
  const key = sessionStorage.getItem('redeem_idempotency_key') ?? crypto.randomUUID();
  sessionStorage.setItem('redeem_idempotency_key', key);

  try {
    const result = await redeemCoupon({
      code,
      name: form.name,
      upi_vpa: form.upiVpa,
      idempotency_key: key,
    });
    sessionStorage.removeItem('redeem_idempotency_key');
    showSuccess(result);
  } catch {
    showRetryOption(); // retry with same idempotency key on network error
  }
}
```

---

## UX guidelines

### Do

- Pre-fill code from URL query param
- Uppercase code input as user types
- Show loading states on verify and redeem
- Disable submit while request in flight
- Store idempotency key in sessionStorage
- Show `publicRef` on success (customer support reference)
- Show total amount including bonus
- Use mobile-friendly phone + UPI inputs

### Don't

- Call redeem without verify first (allowed by API but bad UX)
- Show different messages for "code not found" vs "not allotted" (security)
- Reuse idempotency key across different coupons
- Show admin-only data (redeemer_id, internal UUIDs) to customer
- Assume verify amount equals final payout (bonus may apply)

---

## What is available on public API

| Feature | Status |
|---|---|
| User login / OTP | ✅ Implemented |
| My redemptions history | ✅ Implemented |
| Payout status check by customer | ✅ Implemented (by reference number) |
| Email confirmation | ❌ Not implemented |

---

## OTP Authentication (Phase 3)

Customers can now log in with their phone number to view their redemption history and payout status.

### Authentication flow

```
1. Customer enters phone number
2. Backend sends 6-digit OTP via SMS (Kaleyra)
3. Customer enters OTP
4. Backend returns access token (~15 min) + refresh token (~7 days)
5. Customer uses access token for verify/redeem/history; refresh when access expires
```

### Security features

- OTP expires in 10 minutes
- Max 3 verification attempts per OTP
- Max 3 OTP requests per 15-minute window per phone
- Rate limited: 10 OTP requests/minute per IP
- JWT tokens signed with server secret

### Local development (Kaleyra off / fixed OTP)

When SMS is unavailable, configure `.env` for predictable login during UI testing:

```bash
NODE_ENV=development
COUPON_PUBLIC_SMS_ENABLED=false
COUPON_PUBLIC_FIXED_OTP=996806
# Optional — only these phones get the fixed OTP; omit for all phones in dev
# COUPON_PUBLIC_FIXED_OTP_PHONES=9876543210
```

**Flow:**

1. `POST /sendOtp` with any allowed phone → OTP **`996806`** is stored in DB (SMS skipped).
2. `POST /verifyOtp` with `{ "phone": "...", "otp": "996806" }` → JWT + refresh token.

For real SMS, set `COUPON_PUBLIC_SMS_ENABLED=true` with Kaleyra configured (and clear `COUPON_PUBLIC_FIXED_OTP` if you want random OTPs).

---

## API 3 — Send OTP

Request OTP for phone login.

```http
POST /api/v1/coupons/public/sendOtp
Content-Type: application/json
```

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `phone` | string | yes | 10-digit or 91+10 digits |

### Example

```json
{
  "phone": "9876543210"
}
```

### Response — success

HTTP `200`

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "otpSent": true,
    "expiresAt": "2026-07-05T14:15:00.000Z"
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

### Error handling

| Error | HTTP | Cause | UI action |
|---|---|---|---|
| `Too many OTP requests. Please try again after 15 minutes.` | 400 | Rate limit per phone | Show countdown timer |
| `Invalid phone number` | 400 | Bad format | Highlight phone field |
| `Too many OTP requests, please try again later.` | 429 | Rate limit per IP | Wait 60 seconds |

### UI considerations

- Show "OTP sent to +91 9876543210"
- Display countdown timer (10 minutes)
- Show resend button after 60 seconds
- Auto-focus OTP input field

---

## API 4 — Verify OTP

Verify OTP and get authentication tokens (**access token + refresh token**).

```http
POST /api/v1/coupons/public/verifyOtp
Content-Type: application/json
```

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `phone` | string | yes | Same phone used in sendOtp |
| `otp` | string | yes | 6-digit code |

### Example

```json
{
  "phone": "9876543210",
  "otp": "123456"
}
```

### Response — success

HTTP `200`

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "dGhpc2lzYXJlZnJlc2h0b2tlbg...",
    "accessTokenExpiresAt": "2026-07-05T14:20:00.000Z",
    "refreshTokenExpiresAt": "2026-07-12T14:05:00.000Z",
    "phone": "9876543210"
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

### Token Types

| Token | Lifetime | Purpose | Storage |
|---|---|---|---|
| **accessToken** | 15 minutes | API calls | Memory/State (not localStorage) |
| **refreshToken** | 7 days | Get new access token | localStorage (secure) |

**Important:**
- **Access token** expires in 15 minutes (short-lived for security)
- **Refresh token** expires in 7 days (long-lived, stored securely)
- Use refresh token to get new access token when it expires
- Both tokens revoked on logout

### Error handling

| Error | HTTP | Cause | UI action |
|---|---|---|---|
| `No pending OTP found or OTP expired` | 400 | Expired or not sent | Show "Request new OTP" |
| `Invalid OTP` | 400 | Wrong code | Show error, allow retry |
| `Maximum OTP verification attempts exceeded. Request a new OTP.` | 400 | 3 failed attempts | Disable input, show resend button |

### Store tokens

```typescript
// Store refresh token (7 days) in localStorage
localStorage.setItem('coupon_refresh_token', data.refreshToken);
localStorage.setItem('coupon_refresh_expires', data.refreshTokenExpiresAt);

// Store access token (15 mins) in memory/state - NOT localStorage
// Access tokens are short-lived, no need to persist
let accessToken = data.accessToken;
let accessTokenExpiry = new Date(data.accessTokenExpiresAt);

// Include access token in API requests
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${accessToken}`
};
```

---

## API 8 — Refresh access token

Get a new access token using refresh token. Call this when access token expires (every 15 minutes).

```http
POST /api/v1/coupons/public/refreshToken
Content-Type: application/json
```

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `refreshToken` | string | yes | Refresh token from verifyOtp |

### Example

```json
{
  "refreshToken": "dGhpc2lzYXJlZnJlc2h0b2tlbg..."
}
```

### Response — success

HTTP `200`

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "bmV3cmVmcmVzaHRva2VuaGVyZQ...",
    "accessTokenExpiresAt": "2026-07-05T14:35:00.000Z",
    "refreshTokenExpiresAt": "2026-07-12T14:20:00.000Z"
  },
  "timestamp": "2026-07-05T14:20:00.000Z"
}
```

**Token Rotation:**
- Old refresh token is automatically revoked
- New refresh token is issued (security best practice)
- Update both tokens in storage

### Error handling

| Error | HTTP | Cause | UI action |
|---|---|---|---|
| `Invalid or expired refresh token` | 401 | Token expired or revoked | Redirect to OTP login |

### When to refresh

```typescript
// Check if access token is about to expire (1 minute buffer)
function needsRefresh(expiryDate: Date): boolean {
  const now = new Date();
  const bufferMs = 60 * 1000; // 1 minute
  return expiryDate.getTime() - now.getTime() < bufferMs;
}

// Before each API call, check and refresh if needed
if (needsRefresh(accessTokenExpiry)) {
  const newTokens = await refreshAccessToken();
  accessToken = newTokens.accessToken;
  accessTokenExpiry = new Date(newTokens.accessTokenExpiresAt);
  localStorage.setItem('coupon_refresh_token', newTokens.refreshToken);
}
```

---

## API 9 — Logout

Revoke refresh token and end session.

```http
POST /api/v1/coupons/public/logout
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `refreshToken` | string | yes | Refresh token to revoke |

### Example

```json
{
  "refreshToken": "dGhpc2lzYXJlZnJlc2h0b2tlbg..."
}
```

### Response — success

HTTP `200`

```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": {
    "loggedOut": true
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

### Client-side logout

```typescript
async function logout() {
  const refreshToken = localStorage.getItem('coupon_refresh_token');
  const accessToken = /* from memory/state */;
  
  if (refreshToken && accessToken) {
    try {
      await fetch('/api/v1/coupons/public/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });
    } catch (error) {
      // Even if API fails, clear local tokens
      console.error('Logout failed', error);
    }
  }
  
  // Clear all tokens
  localStorage.removeItem('coupon_refresh_token');
  localStorage.removeItem('coupon_refresh_expires');
  accessToken = null;
  
  // Redirect to login
  window.location.href = '/login';
}
```

---

## API 10 — Logout from all devices

Revoke all refresh tokens for the authenticated user.

```http
POST /api/v1/coupons/public/logoutAll
Authorization: Bearer <access_token>
```

### Request

No body required.

### Response — success

HTTP `200`

```json
{
  "success": true,
  "message": "Logged out from all devices",
  "data": {
    "loggedOut": true,
    "sessionsRevoked": 3
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

**Use case:** User suspects account compromise, wants to logout from all devices.

---

## API 11 — View active sessions

Get list of active sessions (devices) for the authenticated user.

```http
GET /api/v1/coupons/public/sessions
Authorization: Bearer <access_token>
```

### Response — success

HTTP `200`

```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "uuid-1",
        "createdAt": "2026-07-05T14:00:00.000Z",
        "lastUsedAt": "2026-07-05T14:05:00.000Z",
        "expiresAt": "2026-07-12T14:00:00.000Z",
        "ip": "103.x.x.x",
        "userAgent": "Mozilla/5.0..."
      },
      {
        "sessionId": "uuid-2",
        "createdAt": "2026-07-04T10:00:00.000Z",
        "lastUsedAt": "2026-07-04T10:30:00.000Z",
        "expiresAt": "2026-07-11T10:00:00.000Z",
        "ip": "103.y.y.y",
        "userAgent": "iPhone; iOS 17.0..."
      }
    ]
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

**Use case:** Show "Logged in devices" screen, allow user to logout specific sessions.

---

## API 5 — My redemptions

Get authenticated customer's redemption history.

```http
GET /api/v1/coupons/public/myRedemptions
Authorization: Bearer <token>
```

### Request

No body. Token required in Authorization header.

### Response — success

HTTP `200`

```json
{
  "success": true,
  "data": {
    "phone": "9876543210",
    "name": "Rajesh Kumar",
    "totalRedemptions": 3,
    "lifetimeEarnedPaise": 18000,
    "redemptions": [
      {
        "publicRef": "RED-2026-A1B2",
        "code": "AB12CD34",
        "baseAmountPaise": 5000,
        "bonusAmountPaise": 1000,
        "totalAmountPaise": 6000,
        "payoutStatus": "paid",
        "paidAt": "2026-07-04T10:30:00.000Z",
        "paidVia": "razorpay",
        "redeemedAt": "2026-07-03T15:20:00.000Z"
      },
      {
        "publicRef": "RED-2026-C3D4",
        "code": "CD34EF56",
        "baseAmountPaise": 5000,
        "bonusAmountPaise": 0,
        "totalAmountPaise": 5000,
        "payoutStatus": "pending",
        "paidAt": null,
        "paidVia": null,
        "redeemedAt": "2026-07-05T12:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

### Response fields

| Field | Type | Description |
|---|---|---|
| `publicRef` | string | Reference number for customer support |
| `code` | string | Coupon code (partially masked if needed: `AB12****`) |
| `totalAmountPaise` | number | Final amount (base + bonus) |
| `payoutStatus` | string | `pending` or `paid` |
| `paidAt` | string \| null | When payout completed (null if pending) |
| `paidVia` | string \| null | `manual` or `razorpay` (null if pending) |
| `redeemedAt` | string | When coupon was redeemed |

### UI display

```tsx
<RedemptionCard>
  <Badge>{payout_status === 'paid' ? '✓ Paid' : 'Pending'}</Badge>
  <Amount>₹{totalAmountPaise / 100}</Amount>
  <Date>{format(redeemedAt, 'dd MMM yyyy')}</Date>
  <Ref>Ref: {publicRef}</Ref>
  {paidAt && <PaidDate>Paid on {format(paidAt, 'dd MMM')}</PaidDate>}
</RedemptionCard>
```

### Error handling

| Error | HTTP | Cause | UI action |
|---|---|---|---|
| `No token provided` | 401 | Missing Authorization header | Redirect to OTP login |
| `Invalid token` | 401 | Malformed JWT | Clear token, redirect to login |
| `Token expired` | 401 | Access JWT expired (~15 min) | Call refreshToken; if that fails, redirect to OTP login |

---

## API 6 — My profile

Get authenticated customer's profile summary.

```http
GET /api/v1/coupons/public/myProfile
Authorization: Bearer <token>
```

### Response — success

HTTP `200`

```json
{
  "success": true,
  "data": {
    "phone": "9876543210",
    "name": "Rajesh Kumar",
    "upiVpa": "rajesh@paytm",
    "totalRedemptions": 3,
    "lifetimeEarnedPaise": 18000,
    "firstRedeemedAt": "2026-01-15T10:00:00.000Z",
    "lastRedeemedAt": "2026-07-05T12:00:00.000Z"
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

### UI display

```tsx
<ProfileCard>
  <Avatar>{name[0]}</Avatar>
  <Name>{name}</Name>
  <Phone>{phone}</Phone>
  <Stats>
    <Stat label="Total redeemed" value={totalRedemptions} />
    <Stat label="Total earned" value={`₹${lifetimeEarnedPaise / 100}`} />
  </Stats>
  <Meta>Member since {format(firstRedeemedAt, 'MMM yyyy')}</Meta>
</ProfileCard>
```

---

## API 7 — Check payout status

Check payout status for a specific redemption by reference number. Useful for tracking payment progress.

```http
GET /api/v1/coupons/public/payoutStatus/:publicRef
Authorization: Bearer <token>
```

### Request

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `publicRef` | string | yes | Reference number (e.g., RED-2026-A1B2) |

### Example

```
GET /api/v1/coupons/public/payoutStatus/RED-2026-A1B2
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response — success

HTTP `200`

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
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

### Response — pending payout

```json
{
  "success": true,
  "data": {
    "publicRef": "RED-2026-C3D4",
    "code": "CD34EF56",
    "totalAmountPaise": 5000,
    "payoutStatus": "pending",
    "paidAt": null,
    "paidVia": null,
    "lastPayoutError": null,
    "redeemedAt": "2026-07-05T12:00:00.000Z"
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

### Response — failed payout (rare)

```json
{
  "success": true,
  "data": {
    "publicRef": "RED-2026-E5F6",
    "code": "EF56GH78",
    "totalAmountPaise": 5000,
    "payoutStatus": "pending",
    "paidAt": null,
    "paidVia": null,
    "lastPayoutError": "UPI VPA validation failed",
    "redeemedAt": "2026-07-05T11:00:00.000Z"
  },
  "timestamp": "2026-07-05T14:05:00.000Z"
}
```

### Payout status values

| Status | Meaning | UI Display |
|---|---|---|
| `pending` | Payment not yet processed | "Payment in progress" |
| `paid` | Successfully paid | "✓ Paid on {date}" |

**Note:** Failed payouts remain as `pending` with `lastPayoutError` populated. Admin will retry failed payouts.

### Error handling

| Error | HTTP | Cause | UI action |
|---|---|---|---|
| `Redemption not found or does not belong to you` | 404 | Wrong ref or belongs to another user | Show "Invalid reference number" |
| `No token provided` | 401 | Missing Authorization header | Redirect to OTP login |
| `Invalid token` | 401 | Malformed JWT | Clear token, redirect to login |
| `Token expired` | 401 | Access JWT expired (~15 min) | Call refreshToken; if that fails, redirect to OTP login |

### UI use case

```tsx
// Customer support scenario: User calls with reference number
// Agent asks them to check status themselves

<PayoutStatusChecker>
  <Input 
    placeholder="Enter your reference number (e.g., RED-2026-A1B2)"
    value={publicRef}
    onChange={e => setPublicRef(e.target.value)}
  />
  <Button onClick={() => checkStatus(publicRef)}>
    Check Payment Status
  </Button>
  
  {status && (
    <StatusCard>
      <Amount>₹{status.totalAmountPaise / 100}</Amount>
      <Status status={status.payoutStatus}>
        {status.payoutStatus === 'paid' 
          ? `✓ Paid on ${format(status.paidAt, 'dd MMM yyyy')}`
          : 'Payment in progress'
        }
      </Status>
      {status.lastPayoutError && (
        <Error>Issue: {status.lastPayoutError}</Error>
      )}
    </StatusCard>
  )}
</PayoutStatusChecker>
```

---

## Authenticated flow diagram

```
Landing page
  ↓
OTP login (mandatory)
  ├── Enter phone
  ├── Request OTP (POST /sendOtp)
  ├── Enter OTP
  └── Verify (POST /verifyOtp) → access token (memory) + refresh token (localStorage)
        ↓
Authenticated home
  ├── Enter coupon code
  ├── Verify coupon (POST /verifyCoupon with auth)
  │     └── If valid, show redeem form
  ├── Fill details & redeem (POST /redeemCoupon with auth)
  │     └── Success → show reference & amount
  ├── View my redemptions (GET /myRedemptions with auth)
  │     └── List all past redemptions with status
  └── View profile (GET /myProfile with auth)
        └── Logout (clear token)
```

---

## Token management example

```typescript
// Global state for tokens
let accessToken: string | null = null;
let accessTokenExpiry: Date | null = null;

// 1. Send OTP
async function sendOtp(phone: string) {
  const response = await fetch('/api/v1/coupons/public/sendOtp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send OTP');
  }
  
  const result = await response.json();
  return result.data;
}

// 2. Verify OTP and store tokens
async function verifyOtp(phone: string, otp: string) {
  const response = await fetch('/api/v1/coupons/public/verifyOtp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Invalid OTP');
  }
  
  const result = await response.json();
  const { 
    accessToken: newAccessToken, 
    refreshToken, 
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    phone: verifiedPhone 
  } = result.data;
  
  // Store refresh token in localStorage (7 days)
  localStorage.setItem('coupon_refresh_token', refreshToken);
  localStorage.setItem('coupon_refresh_expires', refreshTokenExpiresAt);
  localStorage.setItem('coupon_auth_phone', verifiedPhone);
  
  // Store access token in memory (15 minutes)
  accessToken = newAccessToken;
  accessTokenExpiry = new Date(accessTokenExpiresAt);
  
  return result.data;
}

// 3. Refresh access token when expired
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('coupon_refresh_token');
  
  if (!refreshToken) {
    return false; // No refresh token, need to login
  }
  
  try {
    const response = await fetch('/api/v1/coupons/public/refreshToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Refresh token expired, clear and redirect to login
        localStorage.clear();
        window.location.href = '/login';
        return false;
      }
      throw new Error('Failed to refresh token');
    }
    
    const result = await response.json();
    const { 
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt
    } = result.data;
    
    // Update tokens (token rotation)
    accessToken = newAccessToken;
    accessTokenExpiry = new Date(accessTokenExpiresAt);
    localStorage.setItem('coupon_refresh_token', newRefreshToken);
    localStorage.setItem('coupon_refresh_expires', refreshTokenExpiresAt);
    
    return true;
  } catch (error) {
    console.error('Token refresh failed', error);
    return false;
  }
}

// 4. Get valid access token (auto-refresh if needed)
async function getAccessToken(): Promise<string> {
  // Check if we have a token
  if (!accessToken || !accessTokenExpiry) {
    throw new Error('Not authenticated');
  }
  
  // Check if token needs refresh (1 minute buffer)
  const now = new Date();
  const bufferMs = 60 * 1000; // 1 minute
  const needsRefresh = accessTokenExpiry.getTime() - now.getTime() < bufferMs;
  
  if (needsRefresh) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      throw new Error('Token refresh failed - please login again');
    }
  }
  
  return accessToken!;
}

// 5. Make authenticated API call
async function apiCall(url: string, options: RequestInit = {}) {
  const token = await getAccessToken(); // Auto-refreshes if needed
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  });
  
  if (response.status === 401) {
    // Access token invalid, try refresh once
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry with new token
      const token = await getAccessToken();
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
    } else {
      // Refresh failed, redirect to login
      localStorage.clear();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }
  
  return response;
}

// 6. Example usage: Verify coupon
async function verifyCoupon(code: string) {
  const response = await apiCall('/api/v1/coupons/public/verifyCoupon', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
  
  if (!response.ok) {
    throw new Error('Failed to verify coupon');
  }
  
  const result = await response.json();
  return result.data;
}

// 7. Example usage: Redeem coupon
async function redeemCoupon(data: {
  code: string;
  name: string;
  upi_vpa: string;
  idempotency_key: string;
}) {
  const response = await apiCall('/api/v1/coupons/public/redeemCoupon', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to redeem coupon');
  }
  
  const result = await response.json();
  return result.data;
}

// 8. Get redemptions
async function getMyRedemptions() {
  const response = await apiCall('/api/v1/coupons/public/myRedemptions');
  
  if (!response.ok) {
    throw new Error('Failed to fetch redemptions');
  }
  
  const result = await response.json();
  return result.data;
}

// 9. Logout
async function logout() {
  const refreshToken = localStorage.getItem('coupon_refresh_token');
  
  if (refreshToken && accessToken) {
    try {
      await apiCall('/api/v1/coupons/public/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      });
    } catch (error) {
      console.error('Logout API failed', error);
      // Continue with local cleanup even if API fails
    }
  }
  
  // Clear all tokens
  localStorage.removeItem('coupon_refresh_token');
  localStorage.removeItem('coupon_refresh_expires');
  localStorage.removeItem('coupon_auth_phone');
  accessToken = null;
  accessTokenExpiry = null;
  
  // Redirect to login
  window.location.href = '/';
}

// 10. Logout from all devices
async function logoutAll() {
  try {
    await apiCall('/api/v1/coupons/public/logoutAll', {
      method: 'POST'
    });
  } catch (error) {
    console.error('LogoutAll API failed', error);
  }
  
  // Clear local tokens
  await logout();
}
```

---

## What is NOT available on public API (yet)

| Feature | Status |
|---|---|
| Email confirmation | ❌ Not implemented |
| Password-based login | ❌ Not implemented (OTP-only) |
| Profile editing | ❌ Not implemented (read-only) |
| Push notifications | ❌ Not implemented |

Customer support flow: customer provides `publicRef` + phone → ops looks up in admin.

---

## Rate limiting

**OTP endpoints** (sendOtp, verifyOtp): **10 requests per minute per IP**.

**All other public coupon endpoints** (refreshToken, verifyCoupon, redeemCoupon, myRedemptions, myProfile, payoutStatus, logout, logoutAll, sessions): **20 requests per minute per IP** (configurable via `COUPON_PUBLIC_RATE_LIMIT_MAX`).

**Per-phone OTP cap:** max 3 sendOtp calls per 15 minutes (independent of IP limit).

**UI handling:**
- Debounce verify (e.g. only call on button click, not every keystroke)
- Disable rapid re-submit on redeem
- On `429`: show friendly wait message, disable buttons for 60 seconds
- OTP endpoints: show countdown timer, limit resend button

---

## Testing

### Manual test flow

```
1. Admin: create batch → generate → mark printed → mark allotted
2. Admin: get coupon code from getAllCoupons?status=allotted
3. Public: verifyCoupon with that code
4. Public: redeemCoupon
5. Admin: confirm in getPendingPayouts
```

### Automated smoke test

```bash
npm run dev          # terminal 1
npm run test:coupon-flow   # terminal 2
```

### Postman

Import `docs/coupon-postman-collection.json` → use **Public** folder.

---

## Field naming reference

| Context | Convention |
|---|---|
| Request body | `snake_case` (`upi_vpa`, `idempotency_key`) |
| Verify response | `camelCase` (`faceValuePaise`, `faceValueRupees`) |
| Redeem response | `camelCase` (`redemptionId`, `publicRef`, `totalAmountPaise`) |

Normalize in your API client if using TypeScript interfaces with consistent casing.

---

## Related docs

| Doc | Purpose |
|---|---|
| `docs/COUPON_MODULE.md` | Full backend module overview |
| `docs/COUPON_ADMIN_UI_INTEGRATION.md` | Admin CMS integration |
| `AUTH_JWT_REFRESH_GUIDE.md` | Refresh token system details |
| `docs/coupon-postman-collection.json` | Postman collection |
