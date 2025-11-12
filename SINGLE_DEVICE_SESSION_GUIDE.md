# Single Device Session Management Guide

## Overview

This feature implements single-device session enforcement where a user can only be logged in from one device at a time. When a user logs in from a new device, all previous sessions are immediately invalidated.

## How It Works

### Backend Implementation

1. **Session ID Generation**: When a user logs in (via password or OTP), the system generates a unique session ID (UUID)
2. **Database Storage**: The session ID is stored in the `users` table in the `active_session_id` column
3. **JWT Token**: The session ID is embedded in the JWT token payload
4. **Validation**: On every authenticated request, the session ID from the JWT is compared with the active session ID in the database
5. **Response Flag**: All API responses include an `isSessionValid` boolean flag

### Database Changes

A new migration was added: `021_add_user_sessions.sql`

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_session_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_users_active_session ON users(active_session_id);
```

### API Response Format

All API responses now include the `isSessionValid` field:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "timestamp": "2025-11-11T10:30:00.000Z",
  "isSessionValid": true
}
```

## User Flow Example

### Scenario: User logs in from Device A, then logs in from Device B

1. **Device A Login**:
   - User logs in on Device A
   - Backend generates `sessionId_A` 
   - Stores `sessionId_A` in database
   - Returns JWT with `sessionId_A` embedded
   - Response: `isSessionValid: true`

2. **Device B Login**:
   - User logs in on Device B
   - Backend generates `sessionId_B`
   - **Overwrites** database with `sessionId_B` (invalidating Device A)
   - Returns JWT with `sessionId_B` embedded
   - Response: `isSessionValid: true`

3. **Device A Makes Request**:
   - Device A makes an API call with JWT containing `sessionId_A`
   - Backend compares: `sessionId_A` (from JWT) ≠ `sessionId_B` (from DB)
   - Response: `isSessionValid: false`
   - Frontend should immediately logout the user

## Frontend Integration

### Required Changes

The frontend must check `isSessionValid` in every API response and handle logout accordingly.

### Implementation Example

```typescript
// API Interceptor (Axios example)
axios.interceptors.response.use(
  (response) => {
    // Check if session is invalid
    if (response.data.isSessionValid === false) {
      // Clear local storage/session
      localStorage.removeItem('token');
      
      // Redirect to login
      window.location.href = '/login';
      
      // Optional: Show notification
      showNotification('You have been logged out because you logged in from another device');
    }
    return response;
  },
  (error) => {
    // Also check in error responses
    if (error.response?.data?.isSessionValid === false) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

### Key Points for Frontend

1. **Check Every Response**: The `isSessionValid` flag should be checked on every API response
2. **Immediate Logout**: When `isSessionValid: false`, immediately clear tokens and redirect to login
3. **Global Handler**: Implement this check in a global API interceptor/middleware
4. **User Notification**: Consider showing a message like "You've been logged out because you logged in from another device"
5. **No Need to Call Logout API**: The session is already invalid, just clear local data

## Testing the Feature

### Manual Test Steps

1. **Login from Device/Browser 1**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "testuser", "password": "password123"}'
   ```
   - Save the returned token as `TOKEN_1`

2. **Make Request from Device 1**:
   ```bash
   curl -X GET http://localhost:3000/api/auth/profile \
     -H "Authorization: Bearer TOKEN_1"
   ```
   - Response should show `"isSessionValid": true`

3. **Login from Device/Browser 2** (same user):
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "testuser", "password": "password123"}'
   ```
   - Save the returned token as `TOKEN_2`

4. **Make Request from Device 2**:
   ```bash
   curl -X GET http://localhost:3000/api/auth/profile \
     -H "Authorization: Bearer TOKEN_2"
   ```
   - Response should show `"isSessionValid": true`

5. **Make Request from Device 1 Again**:
   ```bash
   curl -X GET http://localhost:3000/api/auth/profile \
     -H "Authorization: Bearer TOKEN_1"
   ```
   - Response should show `"isSessionValid": false` ✓
   - This means Device 1 session is invalidated!

### Expected Behavior

- Only the most recent login remains valid
- Previous sessions immediately return `isSessionValid: false`
- User can explicitly logout using the logout endpoint
- Logout clears the `active_session_id` from database

## Files Modified

### New Files
- `src/database/migrations/021_add_user_sessions.sql` - Database migration
- `src/middleware/session.middleware.ts` - Session validation middleware (created but not used directly, logic integrated into auth middleware)

### Modified Files
- `src/models/user.model.ts` - Added `active_session_id` field
- `src/dao/user.dao.ts` - Added `updateActiveSession()` method and included `active_session_id` in queries
- `src/utils/jwt.ts` - Added `sessionId` to `TokenPayload` interface
- `src/controllers/auth.controller.ts` - Generate and store session IDs on login, clear on logout
- `src/services/auth.service.ts` - Generate and store session IDs on login
- `src/middleware/auth.middleware.ts` - Validate session and set `isSessionValid` flag
- `src/utils/response.ts` - Include `isSessionValid` in all API responses

## Running the Migration

To apply the database migration:

```bash
# Option 1: Using npm script (if available)
npm run migrate

# Option 2: Direct SQL execution
psql -U your_username -d your_database -f src/database/migrations/021_add_user_sessions.sql
```

## Security Considerations

1. **Session Hijacking**: Even if a JWT token is stolen, it becomes invalid once the user logs in from another device
2. **Immediate Invalidation**: Sessions are invalidated immediately, not after token expiry
3. **No Grace Period**: Previous sessions are terminated instantly
4. **Audit Trail**: All login attempts are still logged in `login_history` table

## Troubleshooting

### Issue: Old tokens still working
- Check if migration was run successfully
- Verify `active_session_id` column exists in users table
- Check if `authenticate` middleware is being used on the route

### Issue: All requests showing isSessionValid: false
- Check if session ID is being generated and stored during login
- Verify JWT token contains sessionId in payload
- Check database `active_session_id` value matches token

### Issue: Frontend not logging out automatically
- Verify API interceptor is checking `isSessionValid` field
- Check if interceptor is registered before API calls
- Ensure logout logic is being triggered

## Future Enhancements

Possible improvements for future versions:

1. **Multiple Device Support**: Allow N concurrent devices per user
2. **Device Management**: Let users view and revoke specific device sessions
3. **Named Sessions**: Track device names/types for better UX
4. **Session Activity**: Track last activity timestamp for idle timeout
5. **Trusted Devices**: Allow marking certain devices as trusted

## Support

For issues or questions, contact the backend development team.

