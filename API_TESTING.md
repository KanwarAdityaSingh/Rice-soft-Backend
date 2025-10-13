# API Testing Guide

This guide provides quick copy-paste commands for testing the Rice Soft Backend API.

## Prerequisites

- Server running on `http://localhost:3000`
- Admin user created with credentials: `admin` / `admin123`

## 1. Health Check

```bash
curl http://localhost:3000/api/v1/health
```

## 2. Authentication

### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**Save the token from the response for subsequent requests!**

### Get Profile
```bash
# Replace YOUR_TOKEN with the actual token
curl http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Logout
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 3. Role Management

### Get All Roles
```bash
curl http://localhost:3000/api/v1/roles \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Copy a role ID from the response for creating users!**

### Get Role by ID
```bash
curl http://localhost:3000/api/v1/roles/ROLE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Custom Role (Admin only)
```bash
curl -X POST http://localhost:3000/api/v1/roles \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "custom_manager",
    "description": "Custom manager with specific permissions",
    "permissions": {
      "contracts": ["read", "create"],
      "lots": ["read"]
    }
  }'
```

### Update Role (Admin only)
```bash
curl -X PUT http://localhost:3000/api/v1/roles/ROLE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description"
  }'
```

## 4. User Management

### Get All Users (Admin only)
```bash
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get All Users Including Inactive (Admin only)
```bash
curl "http://localhost:3000/api/v1/users?include_inactive=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get User by ID
```bash
curl http://localhost:3000/api/v1/users/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create User (Admin only)
```bash
# Replace ROLE_ID with actual role ID from /roles endpoint
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123",
    "role_id": "ROLE_ID",
    "full_name": "John Doe",
    "phone": "+1234567890"
  }'
```

### Create Salesman User
```bash
# First, get the salesman role ID
SALESMAN_ROLE_ID=$(curl -s http://localhost:3000/api/v1/roles \
  -H "Authorization: Bearer YOUR_TOKEN" | \
  grep -A 1 '"name": "salesman"' | \
  grep '"id"' | cut -d'"' -f4)

curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"sales_john\",
    \"email\": \"sales.john@example.com\",
    \"password\": \"SecurePass123\",
    \"role_id\": \"$SALESMAN_ROLE_ID\",
    \"full_name\": \"John Sales\",
    \"phone\": \"+1234567890\"
  }"
```

### Update User
```bash
curl -X PUT http://localhost:3000/api/v1/users/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Smith",
    "phone": "+9876543210"
  }'
```

### Update User Password
```bash
curl -X PUT http://localhost:3000/api/v1/users/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "NewSecurePassword123"
  }'
```

### Deactivate User (Admin only)
```bash
curl -X PUT http://localhost:3000/api/v1/users/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_active": false
  }'
```

### Delete User (Admin only)
```bash
curl -X DELETE http://localhost:3000/api/v1/users/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 5. Testing Different User Roles

### Test as Salesman
```bash
# 1. Create salesman user (as admin)
# 2. Login as salesman
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "sales_john",
    "password": "SecurePass123"
  }'

# 3. Try to access users (should fail - forbidden)
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer SALESMAN_TOKEN"

# Expected: 403 Forbidden
```

### Test as Accountant
```bash
# 1. Create accountant user
# 2. Login as accountant
# 3. Try to access roles (should succeed for read)
curl http://localhost:3000/api/v1/roles \
  -H "Authorization: Bearer ACCOUNTANT_TOKEN"
```

## 6. Error Testing

### Invalid Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "wrongpassword"
  }'
# Expected: 401 Unauthorized
```

### Missing Token
```bash
curl http://localhost:3000/api/v1/users
# Expected: 401 Unauthorized - No token provided
```

### Invalid Token
```bash
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer invalid_token"
# Expected: 401 Unauthorized - Invalid token
```

### Duplicate Username
```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "another@example.com",
    "password": "SecurePass123",
    "role_id": "ROLE_ID",
    "full_name": "Another Admin"
  }'
# Expected: 409 Conflict - Username already exists
```

### Invalid UUID
```bash
curl http://localhost:3000/api/v1/users/not-a-valid-uuid \
  -H "Authorization: Bearer YOUR_TOKEN"
# Expected: 400 Bad Request - Validation error
```

## 7. Rate Limiting Test

### Test Auth Rate Limit (5 attempts per 15 minutes)
```bash
# Run this 6 times quickly
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "username": "admin",
      "password": "wrongpassword"
    }'
  echo "\nAttempt $i"
done
# Expected: 6th attempt should return 429 Too Many Requests
```

## 8. Complete User Workflow

```bash
# Step 1: Login as admin
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | \
  grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: $TOKEN"

# Step 2: Get all roles
curl -s http://localhost:3000/api/v1/roles \
  -H "Authorization: Bearer $TOKEN" | json_pp

# Step 3: Get salesman role ID
ROLE_ID=$(curl -s http://localhost:3000/api/v1/roles \
  -H "Authorization: Bearer $TOKEN" | \
  grep -A 1 '"name": "salesman"' | \
  grep '"id"' | cut -d'"' -f4)

echo "Salesman Role ID: $ROLE_ID"

# Step 4: Create new user
NEW_USER=$(curl -s -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"test_user_$(date +%s)\",
    \"email\": \"test$(date +%s)@example.com\",
    \"password\": \"TestPass123\",
    \"role_id\": \"$ROLE_ID\",
    \"full_name\": \"Test User\",
    \"phone\": \"+1234567890\"
  }")

echo "Created User: $NEW_USER"

# Step 5: Get all users
curl -s http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer $TOKEN" | json_pp
```

## 9. Postman Collection

You can also import these requests into Postman:

1. Create a new collection
2. Add environment variables:
   - `base_url`: `http://localhost:3000/api/v1`
   - `token`: (will be set after login)
   - `user_id`: (for testing specific user operations)
   - `role_id`: (for creating users)

3. Add pre-request script to use token:
```javascript
pm.request.headers.add({
  key: 'Authorization',
  value: 'Bearer ' + pm.environment.get('token')
});
```

4. Add test script for login to save token:
```javascript
if (pm.response.code === 200) {
  var jsonData = pm.response.json();
  pm.environment.set('token', jsonData.data.token);
}
```

## Tips

1. **Save your token**: After login, save the token in an environment variable
2. **Use jq for JSON formatting**: `curl ... | jq`
3. **Create test script**: Save common commands in a bash script
4. **Check logs**: Monitor `logs/combined.log` for debugging
5. **Audit trail**: All user operations are logged in the `audit_logs` table

## Quick Test Script

Save this as `test-api.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000/api/v1"

# Health check
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/health" | json_pp

# Login
echo -e "\n2. Logging in..."
RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "Token obtained: ${TOKEN:0:20}..."

# Get profile
echo -e "\n3. Getting profile..."
curl -s "$BASE_URL/auth/profile" \
  -H "Authorization: Bearer $TOKEN" | json_pp

# Get roles
echo -e "\n4. Getting roles..."
curl -s "$BASE_URL/roles" \
  -H "Authorization: Bearer $TOKEN" | json_pp

echo -e "\n✅ All tests completed!"
```

Run with: `chmod +x test-api.sh && ./test-api.sh`


