#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  RICE SOFT BACKEND - E2E TEST${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Login as Admin
echo -e "${YELLOW}Step 1: Login as Admin${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/loginUser \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Xk9#mP2@nQ7!vR4$wT8&aL5"}')

TOKEN=$(echo $LOGIN_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])")

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo $LOGIN_RESPONSE | python3 -m json.tool
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo "Token: ${TOKEN:0:50}..."
echo ""

# Step 2: Get All Users
echo -e "${YELLOW}Step 2: Get All Users${NC}"
curl -s -X GET http://localhost:3000/api/v1/users/getAllUsers \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -30
echo ""

# Step 3: Create a Salesman
echo -e "${YELLOW}Step 3: Create a Salesman${NC}"
SALESMAN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/users/createUser \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"salesman_test",
    "email":"salesman@test.com",
    "password":"password123",
    "full_name":"Test Salesman",
    "phone":"9999999999",
    "user_type":"salesman"
  }')
echo $SALESMAN_RESPONSE | python3 -m json.tool
echo ""

# Step 4: Get All Salesmen
echo -e "${YELLOW}Step 4: Get All Salesmen${NC}"
curl -s -X GET http://localhost:3000/api/v1/salesmen/getAllSalesmen \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -30
echo ""

# Step 5: Create a Vendor
echo -e "${YELLOW}Step 5: Create a Vendor${NC}"
VENDOR_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/vendors/createVendor \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "business_name":"Rice Traders Pvt Ltd",
    "contact_person":"Mr. Rice Seller",
    "email":"seller@rice.com",
    "phone":"8888888888",
    "address":{"street":"Market St","city":"Mumbai","state":"MH","pincode":"400001","country":"India"},
    "business_details":{"gst_number":"27AAQCR1234A1Z5","pan_number":"AAQCR1234A"},
    "type":"seller"
  }')
echo $VENDOR_RESPONSE | python3 -m json.tool | head -20
echo ""

# Step 6: Get All Vendors
echo -e "${YELLOW}Step 6: Get All Vendors${NC}"
curl -s -X GET http://localhost:3000/api/v1/vendors/getAllVendors \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -30
echo ""

# Step 7: Create a Lead
echo -e "${YELLOW}Step 7: Create a Lead${NC}"
LEAD_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/leads/createLead \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name":"Potential Customer Ltd",
    "contact_person":"Buyer Name",
    "email":"buyer@customer.com",
    "phone":"7777777777",
    "lead_status":"new",
    "priority":"high",
    "estimated_value":50000
  }')
echo $LEAD_RESPONSE | python3 -m json.tool | head -20
echo ""

# Step 8: Get All Leads
echo -e "${YELLOW}Step 8: Get All Leads${NC}"
curl -s -X GET http://localhost:3000/api/v1/leads/getAllLeads \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -30
echo ""

# Step 9: Get Lead Analytics
echo -e "${YELLOW}Step 9: Get Lead Analytics${NC}"
curl -s -X GET http://localhost:3000/api/v1/leads/getLeadAnalytics \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

# Step 10: Get Leaderboard
echo -e "${YELLOW}Step 10: Get Leaderboard${NC}"
curl -s -X GET http://localhost:3000/api/v1/leaderboard/getLeaderboard \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -50
echo ""

# Step 11: Get Team Stats
echo -e "${YELLOW}Step 11: Get Team Stats${NC}"
curl -s -X GET http://localhost:3000/api/v1/leaderboard/getTeamStats \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  E2E TEST COMPLETED${NC}"
echo -e "${GREEN}========================================${NC}"

