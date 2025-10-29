#!/bin/bash

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  COMPREHENSIVE API & EDGE CASE TESTING${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Initialize variables
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/loginUser \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data']['token'] if data['success'] else '')")
INVALID_TOKEN="invalid.jwt.token"
EXPIRED_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJub3ZhbGlkIiwiZXhwIjoxNTAwMDAwMDAwfQ.invalid"

# Counter for test results
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="$5"
    local auth_token="$6"
    
    if [ -z "$auth_token" ]; then
        auth_token=$TOKEN
    fi
    
    echo -e "${YELLOW}Testing: $test_name${NC}"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "http://localhost:3000$endpoint" \
            ${auth_token:+-H "Authorization: Bearer $auth_token"})
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:3000$endpoint" \
            -H "Content-Type: application/json" \
            ${data:+-d "$data"} \
            ${auth_token:+-H "Authorization: Bearer $auth_token"})
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASSED (HTTP $http_code)${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAILED (Expected HTTP $expected_status, got $http_code)${NC}"
        echo "Response: $body" | python3 -m json.tool 2>/dev/null || echo "Response: $body"
        ((FAILED++))
    fi
    echo ""
}

# ========================================
# SECTION 1: AUTHENTICATION
# ========================================
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 1: AUTHENTICATION${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

test_endpoint "1.1 Valid Login" POST "/api/v1/auth/loginUser" '{"username":"admin","password":"admin123"}' 200 ""
test_endpoint "1.2 Invalid Password" POST "/api/v1/auth/loginUser" '{"username":"admin","password":"wrongpassword123"}' 401 ""
test_endpoint "1.3 Invalid Username" POST "/api/v1/auth/loginUser" '{"username":"nonexistent","password":"admin123"}' 401 ""
test_endpoint "1.4 Missing Credentials" POST "/api/v1/auth/loginUser" '{}' 400 ""

# ========================================
# SECTION 2: AUTHORIZATION & SECURITY
# ========================================
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 2: AUTHORIZATION & SECURITY${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

test_endpoint "2.1 Access without Token" GET "/api/v1/users/getAllUsers" "" 401 ""
test_endpoint "2.2 Access with Invalid Token" GET "/api/v1/users/getAllUsers" "" 401 "$INVALID_TOKEN"
test_endpoint "2.3 Access with Valid Token" GET "/api/v1/users/getAllUsers" "" 200 "$TOKEN"

# ========================================
# SECTION 3: USER MANAGEMENT
# ========================================
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 3: USER MANAGEMENT${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

test_endpoint "3.1 Get All Users" GET "/api/v1/users/getAllUsers" "" 200 "$TOKEN"
test_endpoint "3.2 Create User - Valid" POST "/api/v1/users/createUser" '{"username":"test_user_'$(date +%s)'","email":"test'$(date +%s)'@test.com","password":"password123","full_name":"Test User","user_type":"custom"}' 201 "$TOKEN"
test_endpoint "3.3 Create User - Duplicate Username" POST "/api/v1/users/createUser" '{"username":"admin","email":"new@test.com","password":"password123","full_name":"Admin Duplicate","user_type":"custom"}' 409 "$TOKEN"
test_endpoint "3.4 Create User - Invalid Email" POST "/api/v1/users/createUser" '{"username":"test123","email":"invalid-email","password":"password123","user_type":"custom"}' 400 "$TOKEN"
test_endpoint "3.5 Create User - Weak Password" POST "/api/v1/users/createUser" '{"username":"test456","email":"test456@test.com","password":"123","user_type":"custom"}' 400 "$TOKEN"
test_endpoint "3.6 Get User by ID - Valid" GET "/api/v1/users/getUserById/ccf3951e-9a57-4697-ab58-40098dbafc44" "" 200 "$TOKEN"
test_endpoint "3.7 Get User by ID - Invalid UUID" GET "/api/v1/users/getUserById/invalid-id" "" 400 "$TOKEN"
test_endpoint "3.8 Get User by ID - Not Found" GET "/api/v1/users/getUserById/00000000-0000-0000-0000-000000000000" "" 404 "$TOKEN"

# ========================================
# SECTION 4: VENDOR MANAGEMENT
# ========================================
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 4: VENDOR MANAGEMENT${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

test_endpoint "4.1 Get All Vendors" GET "/api/v1/vendors/getAllVendors" "" 200 "$TOKEN"
test_endpoint "4.2 Create Vendor - Valid" POST "/api/v1/vendors/createVendor" '{"business_name":"Test Rice Co '$(date +%s)'","contact_person":"John Doe","email":"vendor'$(date +%s)'@test.com","phone":"9876543210","address":{"street":"123 St","city":"Mumbai","state":"MH","pincode":"400001","country":"India"},"business_details":{},"type":"seller"}' 201 "$TOKEN"
test_endpoint "4.3 Create Vendor - Missing Required Field" POST "/api/v1/vendors/createVendor" '{"contact_person":"John Doe","email":"test@test.com","type":"seller"}' 400 "$TOKEN"
test_endpoint "4.4 Create Vendor - Invalid Vendor Type" POST "/api/v1/vendors/createVendor" '{"business_name":"Test Co","contact_person":"John","email":"test2@test.com","phone":"123","type":"invalid_type"}' 400 "$TOKEN"
test_endpoint "4.5 Lookup GST - Valid Format" GET "/api/v1/vendors/lookupGST?gst_number=29AQHPS1234A1Z5" "" 200 "$TOKEN"
test_endpoint "4.6 Lookup GST - Invalid Format" GET "/api/v1/vendors/lookupGST?gst_number=123" "" 400 "$TOKEN"

# ========================================
# SECTION 5: LEAD MANAGEMENT
# ========================================
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 5: LEAD MANAGEMENT${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

test_endpoint "5.1 Get All Leads" GET "/api/v1/leads/getAllLeads" "" 200 "$TOKEN"
test_endpoint "5.2 Create Lead - Valid" POST "/api/v1/leads/createLead" '{"company_name":"Potential Client '$(date +%s)'","contact_person":"Jane Doe","email":"lead'$(date +%s)'@test.com","phone":"9999999999","lead_status":"new","priority":"high"}' 201 "$TOKEN"
test_endpoint "5.3 Create Lead - Duplicate Email" POST "/api/v1/leads/createLead" '{"company_name":"Duplicate Test","contact_person":"Test","email":"buyer@customer.com","phone":"123","lead_status":"new"}' 409 "$TOKEN"
test_endpoint "5.4 Create Lead - Invalid Status" POST "/api/v1/leads/createLead" '{"company_name":"Test Co","contact_person":"Test","email":"test'$(date +%s)'@test.com","phone":"123","lead_status":"invalid_status"}' 400 "$TOKEN"
test_endpoint "5.5 Get Lead Analytics" GET "/api/v1/leads/getLeadAnalytics" "" 200 "$TOKEN"
test_endpoint "5.6 Get Lead by ID - Invalid UUID" GET "/api/v1/leads/getLeadById/not-a-uuid" "" 400 "$TOKEN"

# ========================================
# SECTION 6: SALES & LEADERBOARD
# ========================================
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 6: SALES & LEADERBOARD${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

test_endpoint "6.1 Get Leaderboard" GET "/api/v1/leaderboard/getLeaderboard" "" 200 "$TOKEN"
test_endpoint "6.2 Get Team Stats" GET "/api/v1/leaderboard/getTeamStats" "" 200 "$TOKEN"
test_endpoint "6.3 Get All Salesmen" GET "/api/v1/salesmen/getAllSalesmen" "" 200 "$TOKEN"
test_endpoint "6.4 Get Salesperson Stats - Invalid ID" GET "/api/v1/leaderboard/getSalespersonStats/invalid-id" "" 400 "$TOKEN"

# ========================================
# SECTION 7: DOCUMENT MANAGEMENT
# ========================================
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 7: DOCUMENT MANAGEMENT${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

test_endpoint "7.1 Get All Documents" GET "/api/v1/documents/getAllDocuments" "" 200 "$TOKEN"
test_endpoint "7.2 Create Document - Valid" POST "/api/v1/documents/createDocument" '{"user_id":"ccf3951e-9a57-4697-ab58-40098dbafc44","document_type":"aadhar","document_number":"123456789012","document_name":"Aadhar Card"}' 201 "$TOKEN"
test_endpoint "7.3 Create Document - Invalid Type" POST "/api/v1/documents/createDocument" '{"user_id":"ccf3951e-9a57-4697-ab58-40098dbafc44","document_type":"invalid_type","document_number":"123"}' 400 "$TOKEN"
test_endpoint "7.4 Get Document by Invalid ID" GET "/api/v1/documents/getDocumentById/invalid" "" 400 "$TOKEN"

# ========================================
# SECTION 8: RATE LIMITING & PERFORMANCE
# ========================================
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 8: RATE LIMITING${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Testing Rate Limiting (Multiple rapid requests)...${NC}"
rapid_requests=0
rate_limited=0
for i in {1..10}; do
    response=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/v1/auth/loginUser" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}')
    http_code=$(echo "$response" | tail -n1)
    if [ "$http_code" = "429" ]; then
        ((rate_limited++))
    fi
    ((rapid_requests++))
    sleep 0.1
done

if [ "$rate_limited" -gt 0 ]; then
    echo -e "${GREEN}✅ Rate limiting working ($rate_limited out of $rapid_requests requests were rate-limited)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  Rate limiting not triggered (this might be expected)${NC}"
fi
echo ""

# ========================================
# TEST SUMMARY
# ========================================
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}           TEST SUMMARY${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "Total:  $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! 🎉${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi

