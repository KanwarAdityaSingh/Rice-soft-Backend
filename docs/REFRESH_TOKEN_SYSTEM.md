# Refresh Token Authentication System

## Overview

The public coupon API now uses a **dual-token authentication system** for enhanced security:

- **Access Token**: Short-lived (15 minutes), used for API calls
- **Refresh Token**: Long-lived (7 days), used to get new access tokens

---

## Why Refresh Tokens?

### Security Benefits

| Feature | Before (Single Token) | After (Refresh Tokens) |
|---------|---------------------|----------------------|
| **Token Lifetime** | 7 days | Access: 15 min, Refresh: 7 days |
| **Stolen Token Risk** | Valid for 7 days | Valid for 15 minutes max |
| **Revocation** | Not possible | ✅ Can revoke anytime |
| **Session Tracking** | No tracking | ✅ Track all devices |
| **Logout** | Client-side only | ✅ Server-side revocation |
| **Force Logout** | Not possible | ✅ Logout from all devices |

### How It Works

```
1. User logs in with OTP
   ↓
2. Server issues TWO tokens:
   - Access Token (15 min) → Use for API calls
   - Refresh Token (7 days) → Use to get new access token
   ↓
3. After 15 minutes, access token expires
   ↓
4. Client uses refresh token to get new access token
   ↓
5. Server issues NEW pair of tokens (token rotation)
   ↓
6. Repeat every 15 minutes
   ↓
7. After 7 days, refresh token expires → User must login with OTP again
```

---

## Database

### New Table: `public_refresh_tokens`

```sql
CREATE TABLE public_refresh_tokens (
    refresh_token_id UUID PRIMARY KEY,
    phone VARCHAR(15) NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,  -- SHA-256 hash
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(255),
    device_info JSONB,
    ip INET,
    user_agent TEXT,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Security Note:** Tokens are hashed with SHA-256 before storage. Plaintext tokens are never stored in the database.

---

## API Endpoints

### 1. Verify OTP (Updated)

**POST** `/coupons/public/verifyOtp`

**Response:**
```json
{
  "accessToken": "eyJhbGc...",           // 15 minutes
  "refreshToken": "dGhpc2lz...",        // 7 days
  "accessTokenExpiresAt": "...",
  "refreshTokenExpiresAt": "...",
  "phone": "9876543210"
}
```

### 2. Refresh Token (New)

**POST** `/coupons/public/refreshToken`

**Request:**
```json
{
  "refreshToken": "dGhpc2lz..."
}
```

**Response:**
```json
{
  "accessToken": "newToken...",         // New 15-min token
  "refreshToken": "newRefresh...",      // New 7-day token (rotated)
  "accessTokenExpiresAt": "...",
  "refreshTokenExpiresAt": "..."
}
```

**Note:** Old refresh token is automatically revoked (token rotation for security).

### 3. Logout (New)

**POST** `/coupons/public/logout`

**Request:**
```json
{
  "refreshToken": "dGhpc2lz..."
}
```

Revokes the refresh token, ending the session.

### 4. Logout All (New)

**POST** `/coupons/public/logoutAll`

Revokes ALL refresh tokens for the authenticated user (all devices).

### 5. View Sessions (New)

**GET** `/coupons/public/sessions`

Returns list of active sessions with device info, IP, and last used timestamp.

---

## Frontend Implementation

### Token Storage

```typescript
// Refresh Token (7 days) → localStorage
localStorage.setItem('coupon_refresh_token', refreshToken);

// Access Token (15 min) → Memory/State (NOT localStorage)
let accessToken = data.accessToken;
let accessTokenExpiry = new Date(data.accessTokenExpiresAt);
```

**Why not store access token in localStorage?**
- It changes every 15 minutes
- Storing in memory reduces XSS attack surface
- If stolen, only valid for 15 minutes

### Auto-Refresh Logic

```typescript
async function getAccessToken(): Promise<string> {
  // Check if token expires in <1 minute
  const needsRefresh = accessTokenExpiry.getTime() - Date.now() < 60000;
  
  if (needsRefresh) {
    await refreshAccessToken(); // Get new tokens
  }
  
  return accessToken;
}

// Before EVERY API call:
const token = await getAccessToken(); // Auto-refreshes if needed
fetch(url, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Error Handling

```typescript
// 401 on API call? Try refresh once
if (response.status === 401) {
  const refreshed = await refreshAccessToken();
  if (refreshed) {
    // Retry API call with new token
  } else {
    // Refresh failed → Redirect to login
    window.location.href = '/login';
  }
}
```

---

## Security Features

### 1. Token Rotation

Every time refresh token is used, **both tokens are rotated**:
- Old refresh token → revoked
- New refresh token → issued
- New access token → issued

**Benefit:** If refresh token is stolen and used, the legitimate user's next refresh will fail, alerting them.

### 2. Token Hashing

Refresh tokens are hashed with SHA-256 before storage:

```typescript
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
```

**Benefit:** Database breach doesn't expose usable tokens.

### 3. Short Access Token Lifetime

Access tokens expire in 15 minutes:

**Benefit:** Stolen access token is only valid briefly.

### 4. Session Tracking

Every refresh token has:
- IP address
- User agent
- Last used timestamp
- Device info

**Benefit:** Can show "Logged in devices" and detect suspicious activity.

### 5. Explicit Revocation

Tokens can be revoked:
- Single session logout
- All devices logout
- Admin can revoke by phone

**Benefit:** True server-side session management.

---

## Migration Guide

### Old Code (Single Token):

```typescript
// After OTP verification
localStorage.setItem('coupon_auth_token', token);

// API calls
fetch(url, {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('coupon_auth_token')}` }
});
```

### New Code (Refresh Tokens):

```typescript
// After OTP verification
localStorage.setItem('coupon_refresh_token', refreshToken);
let accessToken = data.accessToken;

// API calls (with auto-refresh)
const token = await getAccessToken(); // Handles refresh automatically
fetch(url, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## Cron Job (Optional)

Cleanup expired tokens periodically:

```typescript
// Run daily
import { refreshTokenService } from './services/refresh-token.service';

async function cleanupExpiredTokens() {
  const count = await refreshTokenService.cleanupExpired();
  console.log(`Cleaned up ${count} expired tokens`);
}
```

Deletes refresh tokens that expired >30 days ago.

---

## Files Created/Modified

### New Files:
1. `src/database/migrations/162_create_refresh_tokens.sql` - Database table
2. `src/models/refresh-token.model.ts` - TypeScript models
3. `src/dao/refresh-token.dao.ts` - Database operations
4. `src/services/refresh-token.service.ts` - Business logic

### Modified Files:
1. `src/controllers/coupon-public.controller.ts` - New endpoints
2. `src/routes/coupon-public.routes.ts` - New routes
3. `src/utils/coupon.validators.ts` - Refresh token schema
4. `docs/COUPON_PUBLIC_UI_INTEGRATION.md` - Updated documentation

---

## Testing

```bash
# 1. Send OTP
POST /coupons/public/sendOtp
{ "phone": "9876543210" }

# 2. Verify OTP → Get tokens
POST /coupons/public/verifyOtp
{ "phone": "9876543210", "otp": "123456" }
→ Returns: accessToken, refreshToken

# 3. Use access token for 15 minutes
POST /coupons/public/verifyCoupon
Authorization: Bearer <accessToken>

# 4. After 15 minutes, refresh
POST /coupons/public/refreshToken
{ "refreshToken": "..." }
→ Returns: NEW accessToken, NEW refreshToken

# 5. Logout
POST /coupons/public/logout
Authorization: Bearer <accessToken>
{ "refreshToken": "..." }
→ Token revoked, can't be used again
```

---

## Summary

✅ **Access tokens** expire in 15 minutes (short-lived, secure)
✅ **Refresh tokens** expire in 7 days (long-lived, revocable)
✅ **Token rotation** on every refresh (security best practice)
✅ **SHA-256 hashing** for stored tokens
✅ **Session tracking** with IP, user agent, device info
✅ **True logout** via token revocation
✅ **Multi-device support** with "logout all" feature
✅ **Production-ready** with proper error handling and documentation

**This is now a secure, scalable authentication system suitable for financial transactions!**
