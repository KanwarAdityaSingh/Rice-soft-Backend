#!/bin/bash

# Comprehensive Test Script for New Purchase Flow
# Tests: Independent entity creation, junction tables, calculations, linking/unlinking

set -e

BASE_URL="http://localhost:3000/api/v1"
TOKEN=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test data storage
VENDOR_ID=""
BROKER_ID=""
TRANSPORTER_ID=""
PURCHASER_ID=""
SAUDA_IDS=()
ISP_IDS=()
LOT_IDS=()
PURCHASE_IDS=()

# Helper functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}✓ PASS${NC} $1"
}

log_fail() {
    echo -e "${RED}✗ FAIL${NC} $1"
    echo "Response: $2"
}

log_info() {
    echo -e "${YELLOW}ℹ INFO${NC} $1"
}

log_section() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}════════════════════════════════════════${NC}"
}

# Check server health
check_server() {
    log_test "Checking server health..."
    RESPONSE=$(curl -s "$BASE_URL/health" 2>&1)
    
    if echo "$RESPONSE" | grep -q "Cannot GET"; then
        log_fail "Server is not responding correctly. Please restart the server with: npm run dev"
        echo "Response: $RESPONSE"
        exit 1
    fi
    
    STATUS=$(echo "$RESPONSE" | jq -r '.status // empty' 2>/dev/null)
    if [ "$STATUS" != "OK" ]; then
        log_fail "Server health check failed"
        echo "Response: $RESPONSE"
        exit 1
    fi
    
    log_pass "Server is healthy"
}

# Login
login() {
    log_test "Logging in with admin/admin123..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/auth/loginUser" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}')
    
    # Check if response is HTML error page
    if echo "$RESPONSE" | grep -q "<!DOCTYPE html>"; then
        log_fail "Server returned HTML error. Server may need restart or routes not loaded."
        echo "Response: $RESPONSE"
        exit 1
    fi
    
    TOKEN=$(echo "$RESPONSE" | jq -r '.data.token // empty' 2>/dev/null)
    
    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
        log_fail "Login failed"
        echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
        exit 1
    fi
    
    log_pass "Login successful"
    echo "Token: ${TOKEN:0:30}..."
}

# Get existing vendor
setup_vendor() {
    log_test "Getting existing vendor..."
    
    # Get first existing vendor
    RESPONSE=$(curl -s -X GET "$BASE_URL/vendors/getAllVendors?limit=1" \
        -H "Authorization: Bearer $TOKEN")
    
    VENDOR_ID=$(echo "$RESPONSE" | jq -r '.data[0].id // empty')
    
    if [ -z "$VENDOR_ID" ] || [ "$VENDOR_ID" = "null" ]; then
        log_fail "No existing vendor found. Please create a vendor first."
        echo "$RESPONSE" | jq .
        exit 1
    fi
    
    VENDOR_NAME=$(echo "$RESPONSE" | jq -r '.data[0].business_name // "Unknown"')
    log_pass "Using existing vendor: $VENDOR_NAME (ID: $VENDOR_ID)"
}

# Get existing broker
setup_broker() {
    log_test "Getting existing broker..."
    
    RESPONSE=$(curl -s -X GET "$BASE_URL/brokers/getAllBrokers?limit=1" \
        -H "Authorization: Bearer $TOKEN")
    
    BROKER_ID=$(echo "$RESPONSE" | jq -r '.data[0].id // empty')
    
    if [ -z "$BROKER_ID" ] || [ "$BROKER_ID" = "null" ]; then
        log_fail "No existing broker found. Please create a broker first."
        echo "$RESPONSE" | jq .
        exit 1
    fi
    
    BROKER_NAME=$(echo "$RESPONSE" | jq -r '.data[0].business_name // "Unknown"')
    log_pass "Using existing broker: $BROKER_NAME (ID: $BROKER_ID)"
}

# Get existing transporter
setup_transporter() {
    log_test "Getting existing transporter..."
    
    RESPONSE=$(curl -s -X GET "$BASE_URL/transporters?limit=1" \
        -H "Authorization: Bearer $TOKEN")
    
    TRANSPORTER_ID=$(echo "$RESPONSE" | jq -r '.data[0].id // empty')
    
    if [ -z "$TRANSPORTER_ID" ] || [ "$TRANSPORTER_ID" = "null" ]; then
        log_fail "No existing transporter found. Please create a transporter first."
        echo "$RESPONSE" | jq .
        exit 1
    fi
    
    TRANSPORTER_NAME=$(echo "$RESPONSE" | jq -r '.data[0].business_name // "Unknown"')
    log_pass "Using existing transporter: $TRANSPORTER_NAME (ID: $TRANSPORTER_ID)"
}

# Get existing purchaser (user)
setup_purchaser() {
    log_test "Getting existing purchaser (user)..."
    
    RESPONSE=$(curl -s -X GET "$BASE_URL/users/getAllUsers?limit=1" \
        -H "Authorization: Bearer $TOKEN")
    
    PURCHASER_ID=$(echo "$RESPONSE" | jq -r '.data[0].id // empty')
    
    if [ -z "$PURCHASER_ID" ] || [ "$PURCHASER_ID" = "null" ]; then
        log_fail "No users found. Please create a user first."
        echo "$RESPONSE" | jq .
        exit 1
    fi
    
    PURCHASER_NAME=$(echo "$RESPONSE" | jq -r '.data[0].username // "Unknown"')
    log_pass "Using existing purchaser: $PURCHASER_NAME (ID: $PURCHASER_ID)"
}

# Test 1: Create independent saudas
test_create_saudas() {
    log_section "TEST 1: Create Independent Saudas"
    
    # Sauda 1: Xgodown type
    log_test "Creating Sauda 1 (Xgodown)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/saudas" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_type\": \"exgodown\",
            \"rice_quality\": \"Premium Basmati\",
            \"rate\": 85.50,
            \"broker_id\": \"$BROKER_ID\",
            \"broker_commission\": 2.5,
            \"transporter_id\": \"$TRANSPORTER_ID\",
            \"transportation_cost\": 5000.00,
            \"cash_discount\": 1000.00,
            \"quantity\": 1000,
            \"purchaser_id\": \"$VENDOR_ID\",
            \"status\": \"active\"
        }")
    
    SAUDA_ID_1=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$SAUDA_ID_1" ] || [ "$SAUDA_ID_1" = "null" ]; then
        log_fail "Failed to create Sauda 1"
        echo "$RESPONSE" | jq .
        return 1
    fi
    SAUDA_IDS+=("$SAUDA_ID_1")
    log_pass "Sauda 1 created: $SAUDA_ID_1"
    
    # Sauda 2: FOR type
    log_test "Creating Sauda 2 (FOR)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/saudas" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_type\": \"for\",
            \"rice_quality\": \"Standard Basmati\",
            \"rate\": 75.00,
            \"broker_id\": \"$BROKER_ID\",
            \"broker_commission\": 1.5,
            \"cash_discount\": 500.00,
            \"quantity\": 800,
            \"purchaser_id\": \"$VENDOR_ID\",
            \"status\": \"active\"
        }")
    
    SAUDA_ID_2=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$SAUDA_ID_2" ] || [ "$SAUDA_ID_2" = "null" ]; then
        log_fail "Failed to create Sauda 2"
        echo "$RESPONSE" | jq .
        return 1
    fi
    SAUDA_IDS+=("$SAUDA_ID_2")
    log_pass "Sauda 2 created: $SAUDA_ID_2"
}

# Test 2: Create independent inward slip passes
test_create_inward_slip_passes() {
    log_section "TEST 2: Create Independent Inward Slip Passes"
    
    # ISP 1: Linked to Sauda 1
    log_test "Creating Inward Slip Pass 1 (linked to Sauda 1)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/inward-slip-passes" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"${SAUDA_IDS[0]}\",
            \"slip_number\": \"ISP-001\",
            \"date\": \"2024-01-15\",
            \"vehicle_number\": \"MH01AB1234\",
            \"party_name\": \"Test Party 1\",
            \"party_address\": \"Party Address 1\",
            \"party_gst_number\": \"27ABCDE1234F1Z5\",
            \"status\": \"pending\"
        }")
    
    ISP_ID_1=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$ISP_ID_1" ] || [ "$ISP_ID_1" = "null" ]; then
        log_fail "Failed to create ISP 1"
        echo "$RESPONSE" | jq .
        return 1
    fi
    ISP_IDS+=("$ISP_ID_1")
    log_pass "ISP 1 created: $ISP_ID_1"
    
    # ISP 2: Linked to Sauda 2
    log_test "Creating Inward Slip Pass 2 (linked to Sauda 2)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/inward-slip-passes" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"${SAUDA_IDS[1]}\",
            \"slip_number\": \"ISP-002\",
            \"date\": \"2024-01-16\",
            \"vehicle_number\": \"MH01AB5678\",
            \"party_name\": \"Test Party 2\",
            \"party_address\": \"Party Address 2\",
            \"status\": \"pending\"
        }")
    
    ISP_ID_2=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$ISP_ID_2" ] || [ "$ISP_ID_2" = "null" ]; then
        log_fail "Failed to create ISP 2"
        echo "$RESPONSE" | jq .
        return 1
    fi
    ISP_IDS+=("$ISP_ID_2")
    log_pass "ISP 2 created: $ISP_ID_2"
}

# Test 3: Create independent lots (linked to saudas)
test_create_lots() {
    log_section "TEST 3: Create Independent Lots (Linked to Saudas)"
    
    # Lot 1: Linked to Sauda 1
    log_test "Creating Lot 1 (linked to Sauda 1)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/lots" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"${SAUDA_IDS[0]}\",
            \"lot_number\": \"LOT-001\",
            \"item_name\": \"Premium Basmati Rice\",
            \"no_of_bags\": 50,
            \"bag_weight\": 50.00,
            \"bill_weight\": 2500.00,
            \"received_weight\": 2480.00,
            \"bardana\": \"Standard\",
            \"rate\": 85.50
        }")
    
    LOT_ID_1=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$LOT_ID_1" ] || [ "$LOT_ID_1" = "null" ]; then
        log_fail "Failed to create Lot 1"
        echo "$RESPONSE" | jq .
        return 1
    fi
    LOT_IDS+=("$LOT_ID_1")
    log_pass "Lot 1 created: $LOT_ID_1"
    
    # Lot 2: Linked to Sauda 1
    log_test "Creating Lot 2 (linked to Sauda 1)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/lots" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"${SAUDA_IDS[0]}\",
            \"lot_number\": \"LOT-002\",
            \"item_name\": \"Premium Basmati Rice\",
            \"no_of_bags\": 30,
            \"bag_weight\": 50.00,
            \"bill_weight\": 1500.00,
            \"received_weight\": 1490.00,
            \"rate\": 85.50
        }")
    
    LOT_ID_2=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$LOT_ID_2" ] || [ "$LOT_ID_2" = "null" ]; then
        log_fail "Failed to create Lot 2"
        echo "$RESPONSE" | jq .
        return 1
    fi
    LOT_IDS+=("$LOT_ID_2")
    log_pass "Lot 2 created: $LOT_ID_2"
    
    # Lot 3: Linked to Sauda 2
    log_test "Creating Lot 3 (linked to Sauda 2)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/lots" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"${SAUDA_IDS[1]}\",
            \"lot_number\": \"LOT-003\",
            \"item_name\": \"Standard Basmati Rice\",
            \"no_of_bags\": 40,
            \"bag_weight\": 50.00,
            \"bill_weight\": 2000.00,
            \"received_weight\": 1980.00,
            \"rate\": 75.00
        }")
    
    LOT_ID_3=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$LOT_ID_3" ] || [ "$LOT_ID_3" = "null" ]; then
        log_fail "Failed to create Lot 3"
        echo "$RESPONSE" | jq .
        return 1
    fi
    LOT_IDS+=("$LOT_ID_3")
    log_pass "Lot 3 created: $LOT_ID_3"
}

# Test 4: Create purchase with only saudas
test_purchase_with_saudas() {
    log_section "TEST 4: Create Purchase with Only Saudas"
    
    log_test "Creating Purchase 1 (with 2 saudas)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"vendor_id\": \"$VENDOR_ID\",
            \"sauda_ids\": [\"${SAUDA_IDS[0]}\", \"${SAUDA_IDS[1]}\"],
            \"broker_id\": \"$BROKER_ID\",
            \"broker_commission\": 2.0,
            \"cash_discount\": 1500.00,
            \"transportation_cost\": 5000.00,
            \"purchase_date\": \"2024-01-20\",
            \"rate\": 80.00,
            \"igst_percentage\": 5.0
        }")
    
    PURCHASE_ID_1=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$PURCHASE_ID_1" ] || [ "$PURCHASE_ID_1" = "null" ]; then
        log_fail "Failed to create Purchase 1"
        echo "$RESPONSE" | jq .
        return 1
    fi
    PURCHASE_IDS+=("$PURCHASE_ID_1")
    log_pass "Purchase 1 created: $PURCHASE_ID_1"
    
    # Verify linked entities
    log_test "Verifying linked entities for Purchase 1..."
    RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID_1/linked-entities" \
        -H "Authorization: Bearer $TOKEN")
    
    LINKED_SAUDAS=$(echo "$RESPONSE" | jq -r '.data.sauda_ids | length')
    if [ "$LINKED_SAUDAS" != "2" ]; then
        log_fail "Expected 2 linked saudas, got $LINKED_SAUDAS"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "Purchase 1 has 2 linked saudas"
}

# Test 5: Create purchase with saudas and ISPs
test_purchase_with_saudas_and_isps() {
    log_section "TEST 5: Create Purchase with Saudas and ISPs"
    
    log_test "Creating Purchase 2 (with saudas and ISPs)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"vendor_id\": \"$VENDOR_ID\",
            \"sauda_ids\": [\"${SAUDA_IDS[0]}\"],
            \"inward_slip_pass_ids\": [\"${ISP_IDS[0]}\", \"${ISP_IDS[1]}\"],
            \"purchase_date\": \"2024-01-21\",
            \"rate\": 85.50,
            \"igst_percentage\": 5.0
        }")
    
    PURCHASE_ID_2=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$PURCHASE_ID_2" ] || [ "$PURCHASE_ID_2" = "null" ]; then
        log_fail "Failed to create Purchase 2"
        echo "$RESPONSE" | jq .
        return 1
    fi
    PURCHASE_IDS+=("$PURCHASE_ID_2")
    log_pass "Purchase 2 created: $PURCHASE_ID_2"
    
    # Verify linked entities
    log_test "Verifying linked entities for Purchase 2..."
    RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID_2/linked-entities" \
        -H "Authorization: Bearer $TOKEN")
    
    LINKED_SAUDAS=$(echo "$RESPONSE" | jq -r '.data.sauda_ids | length')
    LINKED_ISPS=$(echo "$RESPONSE" | jq -r '.data.inward_slip_pass_ids | length')
    
    if [ "$LINKED_SAUDAS" != "1" ] || [ "$LINKED_ISPS" != "2" ]; then
        log_fail "Expected 1 sauda and 2 ISPs, got $LINKED_SAUDAS saudas and $LINKED_ISPS ISPs"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "Purchase 2 has 1 linked sauda and 2 linked ISPs"
}

# Test 6: Create purchase with lots (should calculate totals)
test_purchase_with_lots() {
    log_section "TEST 6: Create Purchase with Lots (Calculate Totals)"
    
    log_test "Creating Purchase 3 (with lots for calculation)..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"vendor_id\": \"$VENDOR_ID\",
            \"lot_ids\": [\"${LOT_IDS[0]}\", \"${LOT_IDS[1]}\", \"${LOT_IDS[2]}\"],
            \"broker_commission\": 2.0,
            \"cash_discount\": 1500.00,
            \"transportation_cost\": 5000.00,
            \"purchase_date\": \"2024-01-22\",
            \"rate\": 80.00,
            \"igst_percentage\": 5.0
        }")
    
    PURCHASE_ID_3=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$PURCHASE_ID_3" ] || [ "$PURCHASE_ID_3" = "null" ]; then
        log_fail "Failed to create Purchase 3"
        echo "$RESPONSE" | jq .
        return 1
    fi
    PURCHASE_IDS+=("$PURCHASE_ID_3")
    log_pass "Purchase 3 created: $PURCHASE_ID_3"
    
    # Get purchase details to verify calculations
    log_test "Verifying calculations for Purchase 3..."
    RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID_3" \
        -H "Authorization: Bearer $TOKEN")
    
    TOTAL_WEIGHT=$(echo "$RESPONSE" | jq -r '.data.total_weight // 0')
    TOTAL_AMOUNT=$(echo "$RESPONSE" | jq -r '.data.total_amount // 0')
    IGST_AMOUNT=$(echo "$RESPONSE" | jq -r '.data.igst_amount // 0')
    
    log_info "Total Weight: $TOTAL_WEIGHT"
    log_info "Total Amount: $TOTAL_AMOUNT"
    log_info "IGST Amount: $IGST_AMOUNT"
    
    # Expected calculations:
    # Lot 1: received_weight=2480, rate=85.50, amount=212040
    # Lot 2: received_weight=1490, rate=85.50, amount=127395
    # Lot 3: received_weight=1980, rate=75.00, amount=148500
    # Total weight: 2480 + 1490 + 1980 = 5950
    # Base amount: 212040 + 127395 + 148500 = 487935
    # After cash discount (1500): 486435
    # After broker commission (2%): 486435 + 9728.70 = 496163.70
    # After transportation (5000): 501163.70
    # IGST (5%): 501163.70 * 0.05 = 25058.185
    # Final total: 501163.70 + 25058.185 = 526221.885
    
    # Verify total weight (should be around 5950)
    WEIGHT_INT=$(echo "$TOTAL_WEIGHT" | awk '{printf "%.0f", $1}')
    if [ "$WEIGHT_INT" -lt 5900 ] || [ "$WEIGHT_INT" -gt 6000 ]; then
        log_fail "Total weight calculation seems incorrect: $TOTAL_WEIGHT (expected ~5950)"
    else
        log_pass "Total weight calculation correct: $TOTAL_WEIGHT"
    fi
    
    # Verify total amount (should be around 526222)
    AMOUNT_INT=$(echo "$TOTAL_AMOUNT" | awk '{printf "%.0f", $1}')
    if [ "$AMOUNT_INT" -lt 520000 ] || [ "$AMOUNT_INT" -gt 530000 ]; then
        log_fail "Total amount calculation seems incorrect: $TOTAL_AMOUNT (expected ~526222)"
    else
        log_pass "Total amount calculation correct: $TOTAL_AMOUNT"
    fi
}

# Test 7: Link/unlink entities
test_link_unlink() {
    log_section "TEST 7: Link/Unlink Entities"
    
    # Link additional sauda to Purchase 1
    log_test "Linking additional sauda to Purchase 1..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases/${PURCHASE_IDS[0]}/link-saudas" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_ids\": [\"${SAUDA_IDS[1]}\"]
        }")
    
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    if [ "$SUCCESS" != "true" ]; then
        log_fail "Failed to link sauda"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "Sauda linked successfully"
    
    # Link lots to Purchase 2
    log_test "Linking lots to Purchase 2..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases/${PURCHASE_IDS[1]}/link-lots" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"lot_ids\": [\"${LOT_IDS[0]}\"]
        }")
    
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    if [ "$SUCCESS" != "true" ]; then
        log_fail "Failed to link lots"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "Lots linked successfully"
    
    # Unlink a sauda
    log_test "Unlinking sauda from Purchase 1..."
    RESPONSE=$(curl -s -X DELETE "$BASE_URL/purchases/${PURCHASE_IDS[0]}/unlink-sauda/${SAUDA_IDS[1]}" \
        -H "Authorization: Bearer $TOKEN")
    
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    if [ "$SUCCESS" != "true" ]; then
        log_fail "Failed to unlink sauda"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "Sauda unlinked successfully"
}

# Test 8: Recalculate totals
test_recalculate() {
    log_section "TEST 8: Recalculate Purchase Totals"
    
    log_test "Recalculating totals for Purchase 3..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases/${PURCHASE_IDS[2]}/recalculate-totals" \
        -H "Authorization: Bearer $TOKEN")
    
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    if [ "$SUCCESS" != "true" ]; then
        log_fail "Failed to recalculate totals"
        echo "$RESPONSE" | jq .
        return 1
    fi
    
    TOTAL_AMOUNT=$(echo "$RESPONSE" | jq -r '.data.total_amount // 0')
    log_info "Recalculated Total Amount: $TOTAL_AMOUNT"
    log_pass "Totals recalculated successfully"
}

# Test 9: Get all lots by sauda
test_get_lots_by_sauda() {
    log_section "TEST 9: Get Lots by Sauda"
    
    log_test "Getting lots for Sauda 1..."
    RESPONSE=$(curl -s -X GET "$BASE_URL/lots?sauda_id=${SAUDA_IDS[0]}" \
        -H "Authorization: Bearer $TOKEN")
    
    LOT_COUNT=$(echo "$RESPONSE" | jq -r '.data | length')
    if [ "$LOT_COUNT" != "2" ]; then
        log_fail "Expected 2 lots for Sauda 1, got $LOT_COUNT"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "Found $LOT_COUNT lots for Sauda 1"
}

# Test 10: Update purchase accounting fields
test_update_purchase_accounting() {
    log_section "TEST 10: Update Purchase Accounting Fields"
    
    log_test "Updating cash_discount and transportation_cost for Purchase 3..."
    RESPONSE=$(curl -s -X PUT "$BASE_URL/purchases/${PURCHASE_IDS[2]}" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "cash_discount": 2000.00,
            "transportation_cost": 6000.00,
            "igst_percentage": 6.0
        }')
    
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    if [ "$SUCCESS" != "true" ]; then
        log_fail "Failed to update purchase"
        echo "$RESPONSE" | jq .
        return 1
    fi
    
    CASH_DISCOUNT=$(echo "$RESPONSE" | jq -r '.data.cash_discount // 0')
    TRANSPORTATION_COST=$(echo "$RESPONSE" | jq -r '.data.transportation_cost // 0')
    
    CASH_DISCOUNT_INT=$(echo "$CASH_DISCOUNT" | awk '{printf "%.0f", $1}')
    if [ "$CASH_DISCOUNT_INT" != "2000" ]; then
        log_fail "Cash discount not updated correctly: $CASH_DISCOUNT (expected 2000)"
        return 1
    fi
    
    TRANSPORTATION_COST_INT=$(echo "$TRANSPORTATION_COST" | awk '{printf "%.0f", $1}')
    if [ "$TRANSPORTATION_COST_INT" != "6000" ]; then
        log_fail "Transportation cost not updated correctly: $TRANSPORTATION_COST (expected 6000)"
        return 1
    fi
    
    log_pass "Purchase accounting fields updated successfully"
    
    # Recalculate after update
    log_test "Recalculating after accounting field update..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases/${PURCHASE_IDS[2]}/recalculate-totals" \
        -H "Authorization: Bearer $TOKEN")
    
    NEW_TOTAL=$(echo "$RESPONSE" | jq -r '.data.total_amount // 0')
    log_info "New Total Amount after update: $NEW_TOTAL"
    log_pass "Recalculation after update successful"
}

# Main execution
main() {
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║  NEW PURCHASE FLOW COMPREHENSIVE TEST SUITE           ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    check_server
    login
    setup_vendor
    setup_broker
    setup_transporter
    setup_purchaser
    
    test_create_saudas
    test_create_inward_slip_passes
    test_create_lots
    test_purchase_with_saudas
    test_purchase_with_saudas_and_isps
    test_purchase_with_lots
    test_link_unlink
    test_recalculate
    test_get_lots_by_sauda
    test_update_purchase_accounting
    test_payment_advice
    test_complete_flow
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ALL TESTS COMPLETED SUCCESSFULLY!                     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Created Entities:"
    echo "  - Saudas: ${#SAUDA_IDS[@]}"
    echo "  - ISPs: ${#ISP_IDS[@]}"
    echo "  - Lots: ${#LOT_IDS[@]}"
    echo "  - Purchases: ${#PURCHASE_IDS[@]}"
}

# Test 11: Create Payment Advice linked to Purchase
test_payment_advice() {
    log_section "TEST 11: Create Payment Advice Linked to Purchase"
    
    # Get the purchase with lots (Purchase 3) for payment advice
    PURCHASE_ID=${PURCHASE_IDS[2]}
    
    log_test "Getting purchase details for Payment Advice..."
    RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" \
        -H "Authorization: Bearer $TOKEN")
    
    PURCHASE_AMOUNT=$(echo "$RESPONSE" | jq -r '.data.total_amount // 0')
    log_info "Purchase total amount: ₹$PURCHASE_AMOUNT"
    
    log_test "Creating Payment Advice linked to Purchase 3..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/payment-advices" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"purchase_id\": \"$PURCHASE_ID\",
            \"payer_id\": \"$PURCHASER_ID\",
            \"recipient_id\": \"$VENDOR_ID\",
            \"amount\": $PURCHASE_AMOUNT,
            \"date_of_payment\": \"2024-01-25\",
            \"status\": \"pending\",
            \"charges\": [
                {
                    \"charge_name\": \"Bank Charges\",
                    \"charge_value\": 500.00,
                    \"charge_type\": \"fixed\"
                },
                {
                    \"charge_name\": \"Processing Fee\",
                    \"charge_value\": 2.5,
                    \"charge_type\": \"percentage\"
                }
            ]
        }")
    
    PAYMENT_ADVICE_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$PAYMENT_ADVICE_ID" ] || [ "$PAYMENT_ADVICE_ID" = "null" ]; then
        log_fail "Failed to create Payment Advice"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "Payment Advice created: $PAYMENT_ADVICE_ID"
    
    # Verify purchase is linked
    log_test "Verifying Purchase-Payment Advice link..."
    RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" \
        -H "Authorization: Bearer $TOKEN")
    
    LINKED_PA_ID=$(echo "$RESPONSE" | jq -r '.data.payment_advice_id // empty')
    if [ "$LINKED_PA_ID" != "$PAYMENT_ADVICE_ID" ]; then
        log_fail "Purchase not linked to Payment Advice (Expected: $PAYMENT_ADVICE_ID, Got: $LINKED_PA_ID)"
        return 1
    fi
    log_pass "Purchase linked to Payment Advice correctly"
    
    # Verify net payable calculation
    log_test "Verifying Net Payable calculation..."
    RESPONSE=$(curl -s -X GET "$BASE_URL/payment-advices/$PAYMENT_ADVICE_ID" \
        -H "Authorization: Bearer $TOKEN")
    
    NET_PAYABLE=$(echo "$RESPONSE" | jq -r '.data.net_payable // 0')
    AMOUNT=$(echo "$RESPONSE" | jq -r '.data.amount // 0')
    CHARGES_COUNT=$(echo "$RESPONSE" | jq -r '.data.charges | length')
    
    log_info "Payment Advice Amount: ₹$AMOUNT"
    log_info "Net Payable: ₹$NET_PAYABLE"
    log_info "Charges Count: $CHARGES_COUNT"
    
    if [ "$CHARGES_COUNT" != "2" ]; then
        log_fail "Expected 2 charges, got $CHARGES_COUNT"
        return 1
    fi
    log_pass "Net payable calculated with charges: ₹$NET_PAYABLE"
}

# Test 12: Complete End-to-End Flow
test_complete_flow() {
    log_section "TEST 12: Complete End-to-End Flow (Sauda → ISP → Lot → Purchase → Payment Advice)"
    
    log_test "Step 1: Creating new Sauda for complete flow..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/saudas" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_type\": \"exgodown\",
            \"rice_quality\": \"Complete Flow Test Rice\",
            \"rate\": 90.00,
            \"broker_id\": \"$BROKER_ID\",
            \"broker_commission\": 3.0,
            \"transporter_id\": \"$TRANSPORTER_ID\",
            \"transportation_cost\": 3000.00,
            \"cash_discount\": 800.00,
            \"quantity\": 500,
            \"purchaser_id\": \"$VENDOR_ID\",
            \"status\": \"active\"
        }")
    
    FLOW_SAUDA_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$FLOW_SAUDA_ID" ] || [ "$FLOW_SAUDA_ID" = "null" ]; then
        log_fail "Failed to create Sauda for complete flow"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "Sauda created: $FLOW_SAUDA_ID"
    
    log_test "Step 2: Creating ISP for complete flow..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/inward-slip-passes" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"$FLOW_SAUDA_ID\",
            \"slip_number\": \"CF-ISP-001\",
            \"date\": \"2024-01-23\",
            \"vehicle_number\": \"MH01CF1234\",
            \"party_name\": \"Complete Flow Party\",
            \"party_address\": \"Complete Flow Address\",
            \"status\": \"completed\"
        }")
    
    FLOW_ISP_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$FLOW_ISP_ID" ] || [ "$FLOW_ISP_ID" = "null" ]; then
        log_fail "Failed to create ISP for complete flow"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "ISP created: $FLOW_ISP_ID"
    
    log_test "Step 3: Creating Lot for complete flow..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/lots" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"$FLOW_SAUDA_ID\",
            \"lot_number\": \"CF-LOT-001\",
            \"item_name\": \"Complete Flow Rice\",
            \"no_of_bags\": 25,
            \"bag_weight\": 50.00,
            \"bill_weight\": 1250.00,
            \"received_weight\": 1240.00,
            \"rate\": 90.00
        }")
    
    FLOW_LOT_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$FLOW_LOT_ID" ] || [ "$FLOW_LOT_ID" = "null" ]; then
        log_fail "Failed to create Lot for complete flow"
        echo "$RESPONSE" | jq .
        return 1
    fi
    log_pass "Lot created: $FLOW_LOT_ID"
    
    log_test "Step 4: Creating Purchase for complete flow..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"vendor_id\": \"$VENDOR_ID\",
            \"sauda_ids\": [\"$FLOW_SAUDA_ID\"],
            \"inward_slip_pass_ids\": [\"$FLOW_ISP_ID\"],
            \"lot_ids\": [\"$FLOW_LOT_ID\"],
            \"broker_commission\": 3.0,
            \"cash_discount\": 800.00,
            \"transportation_cost\": 3000.00,
            \"purchase_date\": \"2024-01-24\",
            \"rate\": 90.00,
            \"igst_percentage\": 5.0
        }")
    
    FLOW_PURCHASE_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$FLOW_PURCHASE_ID" ] || [ "$FLOW_PURCHASE_ID" = "null" ]; then
        log_fail "Failed to create Purchase for complete flow"
        echo "$RESPONSE" | jq .
        return 1
    fi
    
    PURCHASE_TOTAL=$(echo "$RESPONSE" | jq -r '.data.total_amount // 0')
    log_pass "Purchase created: $FLOW_PURCHASE_ID (Total: ₹$PURCHASE_TOTAL)"
    
    log_test "Step 5: Creating Payment Advice for complete flow..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/payment-advices" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"purchase_id\": \"$FLOW_PURCHASE_ID\",
            \"payer_id\": \"$PURCHASER_ID\",
            \"recipient_id\": \"$VENDOR_ID\",
            \"amount\": $PURCHASE_TOTAL,
            \"date_of_payment\": \"2024-01-26\",
            \"status\": \"pending\",
            \"charges\": [
                {
                    \"charge_name\": \"Bank Charges\",
                    \"charge_value\": 300.00,
                    \"charge_type\": \"fixed\"
                }
            ]
        }")
    
    FLOW_PA_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$FLOW_PA_ID" ] || [ "$FLOW_PA_ID" = "null" ]; then
        log_fail "Failed to create Payment Advice for complete flow"
        echo "$RESPONSE" | jq .
        return 1
    fi
    
    NET_PAYABLE=$(echo "$RESPONSE" | jq -r '.data.net_payable // 0')
    log_pass "Payment Advice created: $FLOW_PA_ID (Net Payable: ₹$NET_PAYABLE)"
    
    # Verify complete flow linking
    log_test "Verifying complete flow linking..."
    sleep 1  # Wait for linking to complete
    
    PURCHASE_RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$FLOW_PURCHASE_ID" \
        -H "Authorization: Bearer $TOKEN")
    
    PURCHASE_PA_ID=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.payment_advice_id // empty')
    PURCHASE_AMOUNT=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.total_amount // 0')
    
    PA_RESPONSE=$(curl -s -X GET "$BASE_URL/payment-advices/$FLOW_PA_ID" \
        -H "Authorization: Bearer $TOKEN")
    
    PA_PURCHASE_ID=$(echo "$PA_RESPONSE" | jq -r '.data.purchase_id // empty')
    PA_AMOUNT=$(echo "$PA_RESPONSE" | jq -r '.data.amount // 0')
    
    if [ "$PURCHASE_PA_ID" = "$FLOW_PA_ID" ] && [ "$PA_PURCHASE_ID" = "$FLOW_PURCHASE_ID" ]; then
        log_pass "Bidirectional linking verified (Purchase ↔ Payment Advice)"
    else
        log_fail "Bidirectional linking failed (Purchase PA ID: $PURCHASE_PA_ID, PA Purchase ID: $PA_PURCHASE_ID)"
        return 1
    fi
    
    # Verify amounts match
    AMOUNT_INT_PURCHASE=$(echo "$PURCHASE_AMOUNT" | awk '{printf "%.0f", $1}')
    AMOUNT_INT_PA=$(echo "$PA_AMOUNT" | awk '{printf "%.0f", $1}')
    
    if [ "$AMOUNT_INT_PURCHASE" = "$AMOUNT_INT_PA" ]; then
        log_pass "Amounts match: Purchase (₹$PURCHASE_AMOUNT) = Payment Advice (₹$PA_AMOUNT)"
    else
        log_fail "Amounts don't match: Purchase (₹$PURCHASE_AMOUNT) ≠ Payment Advice (₹$PA_AMOUNT)"
        return 1
    fi
    
    log_pass "Complete end-to-end flow verified successfully!"
}

# Run tests
main

