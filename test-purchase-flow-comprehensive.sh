#!/bin/bash

# Comprehensive Purchase Flow Testing Script
# Tests all scenarios: CRUD, calculations, validations, edge cases, status transitions

set -e

BASE_URL="http://localhost:3000/api/v1"
TOKEN=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Helper functions
log_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -e "${BLUE}[TEST $TOTAL_TESTS]${NC} $1"
}

log_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✓ PASS${NC} $1"
}

log_fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}✗ FAIL${NC} $1"
}

log_info() {
    echo -e "${YELLOW}ℹ INFO${NC} $1"
}

# Login
login() {
    log_test "Login"
    RESPONSE=$(curl -s -X POST "$BASE_URL/auth/loginUser" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}')
    
    TOKEN=$(echo "$RESPONSE" | jq -r '.data.token // empty')
    
    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
        log_fail "Login failed"
        echo "$RESPONSE" | jq
        exit 1
    fi
    log_pass "Login successful"
}

# Clean up all purchase-related data
cleanup() {
    log_test "Cleaning up all purchase-related data"
    
    # Delete payment advices
    curl -s -X GET "$BASE_URL/payment-advices" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[].id' | while read id; do
        curl -s -X DELETE "$BASE_URL/payment-advices/$id" -H "Authorization: Bearer $TOKEN" > /dev/null
    done
    
    # Delete purchases
    curl -s -X GET "$BASE_URL/purchases" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[].id' | while read id; do
        curl -s -X DELETE "$BASE_URL/purchases/$id" -H "Authorization: Bearer $TOKEN" > /dev/null
    done
    
    # Delete inward slip passes
    curl -s -X GET "$BASE_URL/inward-slip-passes" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[].id' | while read id; do
        curl -s -X DELETE "$BASE_URL/inward-slip-passes/$id" -H "Authorization: Bearer $TOKEN" > /dev/null
    done
    
    # Delete saudas
    curl -s -X GET "$BASE_URL/saudas" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[].id' | while read id; do
        curl -s -X DELETE "$BASE_URL/saudas/$id" -H "Authorization: Bearer $TOKEN" > /dev/null
    done
    
    # Delete transporters
    curl -s -X GET "$BASE_URL/transporters" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[].id' | while read id; do
        curl -s -X DELETE "$BASE_URL/transporters/$id" -H "Authorization: Bearer $TOKEN" > /dev/null
    done
    
    log_pass "Cleanup completed"
}

# Test 1: Transporter CRUD
test_transporter_crud() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 1: TRANSPORTER CRUD OPERATIONS"
    echo "═══════════════════════════════════════════════════════════"
    
    # Create
    log_test "Create Transporter"
    RESPONSE=$(curl -s -X POST "$BASE_URL/transporters" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "business_name": "Test Transport Services",
            "contact_person": "Test Contact",
            "phone": "9876543210",
            "email": "test@transport.com",
            "address": {"street": "Test St", "city": "Test City", "state": "Test State", "pincode": "123456", "country": "India"},
            "gst_number": "23TEST1234F1Z56",
            "vehicle_numbers": ["TEST001", "TEST002"]
        }')
    
    TRANSPORTER_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$TRANSPORTER_ID" ] || [ "$TRANSPORTER_ID" = "null" ]; then
        log_fail "Create transporter"
        echo "$RESPONSE" | jq
        return
    fi
    log_pass "Create transporter: $TRANSPORTER_ID"
    
    # Read
    log_test "Get Transporter by ID"
    RESPONSE=$(curl -s -X GET "$BASE_URL/transporters/$TRANSPORTER_ID" \
        -H "Authorization: Bearer $TOKEN")
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
        log_pass "Get transporter by ID"
    else
        log_fail "Get transporter by ID"
    fi
    
    # Update
    log_test "Update Transporter"
    RESPONSE=$(curl -s -X PUT "$BASE_URL/transporters/$TRANSPORTER_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"business_name": "Updated Transport Services"}')
    UPDATED_NAME=$(echo "$RESPONSE" | jq -r '.data.business_name // empty')
    if [ "$UPDATED_NAME" = "Updated Transport Services" ]; then
        log_pass "Update transporter"
    else
        log_fail "Update transporter"
    fi
    
    # Delete
    log_test "Delete Transporter"
    RESPONSE=$(curl -s -X DELETE "$BASE_URL/transporters/$TRANSPORTER_ID" \
        -H "Authorization: Bearer $TOKEN")
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
        log_pass "Delete transporter"
    else
        log_fail "Delete transporter"
    fi
}

# Test 2: Sauda CRUD
test_sauda_crud() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 2: SAUDA CRUD OPERATIONS"
    echo "═══════════════════════════════════════════════════════════"
    
    # Create transporter first
    TRANSPORTER_RESPONSE=$(curl -s -X POST "$BASE_URL/transporters" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "business_name": "Test Transport",
            "contact_person": "Test",
            "phone": "9876543210",
            "email": "test@transport.com",
            "address": {"street": "Test", "city": "Test", "state": "Test", "pincode": "123456", "country": "India"},
            "vehicle_numbers": ["TEST001"]
        }')
    TRANSPORTER_ID=$(echo "$TRANSPORTER_RESPONSE" | jq -r '.data.id')
    
    VENDOR_ID="f6d38f0f-22e6-4b91-85e9-5ffbd36def05"
    BROKER_ID="f4eb4f83-21cc-4d9f-b8b1-6b59b579c51a"
    RICE_CODE_ID="adfcd002-ae3a-48f3-8ebd-05f1681902ae"
    
    # Create
    log_test "Create Sauda (exgodown type)"
    RESPONSE=$(curl -s -X POST "$BASE_URL/saudas" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_type\": \"exgodown\",
            \"rice_quality\": \"Test Rice Quality\",
            \"rice_code_id\": \"$RICE_CODE_ID\",
            \"rate\": 45.50,
            \"broker_id\": \"$BROKER_ID\",
            \"broker_commission\": 2.5,
            \"transporter_id\": \"$TRANSPORTER_ID\",
            \"transportation_cost\": 10000,
            \"cash_discount\": 20000,
            \"estimated_delivery_time\": 5,
            \"purchaser_id\": \"$VENDOR_ID\"
        }")
    
    SAUDA_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$SAUDA_ID" ] || [ "$SAUDA_ID" = "null" ]; then
        log_fail "Create sauda"
        echo "$RESPONSE" | jq
        return
    fi
    log_pass "Create sauda: $SAUDA_ID"
    
    # Verify all fields
    log_test "Verify Sauda fields"
    RESPONSE=$(curl -s -X GET "$BASE_URL/saudas/$SAUDA_ID" -H "Authorization: Bearer $TOKEN")
    CASH_DISCOUNT=$(echo "$RESPONSE" | jq -r '.data.cash_discount')
    BROKER_COMM=$(echo "$RESPONSE" | jq -r '.data.broker_commission')
    TRANS_COST=$(echo "$RESPONSE" | jq -r '.data.transportation_cost')
    
    if [ "$CASH_DISCOUNT" = "20000" ] && [ "$BROKER_COMM" = "2.5" ] && [ "$TRANS_COST" = "10000" ]; then
        log_pass "Sauda fields verified"
    else
        log_fail "Sauda fields verification"
    fi
    
    # Update
    log_test "Update Sauda"
    RESPONSE=$(curl -s -X PUT "$BASE_URL/saudas/$SAUDA_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"cash_discount": 25000}')
    UPDATED_DISCOUNT=$(echo "$RESPONSE" | jq -r '.data.cash_discount')
    if [ "$UPDATED_DISCOUNT" = "25000" ]; then
        log_pass "Update sauda"
    else
        log_fail "Update sauda"
    fi
    
    # Status update
    log_test "Update Sauda Status"
    RESPONSE=$(curl -s -X PATCH "$BASE_URL/saudas/$SAUDA_ID/status" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"status": "active"}')
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
        log_pass "Update sauda status"
    else
        log_fail "Update sauda status"
    fi
    
    # Test 'for' type (no transportation cost)
    log_test "Create Sauda (for type - no transportation cost)"
    RESPONSE=$(curl -s -X POST "$BASE_URL/saudas" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_type\": \"for\",
            \"rice_quality\": \"Test Rice FOR\",
            \"rate\": 45.50,
            \"purchaser_id\": \"$VENDOR_ID\"
        }")
    FOR_SAUDA_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -n "$FOR_SAUDA_ID" ] && [ "$FOR_SAUDA_ID" != "null" ]; then
        log_pass "Create 'for' type sauda (no transportation)"
    else
        log_fail "Create 'for' type sauda"
    fi
}

# Test 3: Inward Slip Pass CRUD
test_inward_slip_pass_crud() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 3: INWARD SLIP PASS CRUD OPERATIONS"
    echo "═══════════════════════════════════════════════════════════"
    
    # Get sauda
    SAUDA_ID=$(curl -s -X GET "$BASE_URL/saudas" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[] | select(.sauda_type == "exgodown") | .id' | head -1)
    
    # Create
    log_test "Create Inward Slip Pass with lots"
    RESPONSE=$(curl -s -X POST "$BASE_URL/inward-slip-passes" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"$SAUDA_ID\",
            \"slip_number\": \"ISP-TEST-001\",
            \"date\": \"2024-11-13\",
            \"vehicle_number\": \"TEST001\",
            \"party_name\": \"Test Vendor\",
            \"party_gst_number\": \"23TEST1234F1Z56\",
            \"lots\": [{
                \"lot_number\": \"LOT001\",
                \"item_name\": \"Test Rice\",
                \"no_of_bags\": 100,
                \"bag_weight\": 50,
                \"bill_weight\": 5000,
                \"received_weight\": 4950,
                \"rate\": 45.50
            }]
        }")
    
    ISP_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$ISP_ID" ] || [ "$ISP_ID" = "null" ]; then
        log_fail "Create inward slip pass"
        echo "$RESPONSE" | jq
        return
    fi
    log_pass "Create inward slip pass: $ISP_ID"
    
    # Verify lot calculations
    log_test "Verify Lot Calculations (total_weight and amount)"
    RESPONSE=$(curl -s -X GET "$BASE_URL/inward-slip-passes/$ISP_ID" -H "Authorization: Bearer $TOKEN")
    LOT_TOTAL_WEIGHT=$(echo "$RESPONSE" | jq -r '.data.lots[0].total_weight')
    LOT_AMOUNT=$(echo "$RESPONSE" | jq -r '.data.lots[0].amount')
    
    EXPECTED_WEIGHT=$(echo "100 * 50" | bc)
    EXPECTED_AMOUNT=$(echo "4950 * 45.50" | bc)
    
    if [ "$(echo "$LOT_TOTAL_WEIGHT == $EXPECTED_WEIGHT" | bc)" -eq 1 ] && \
       [ "$(echo "$LOT_AMOUNT == $EXPECTED_AMOUNT" | bc)" -eq 1 ]; then
        log_pass "Lot calculations verified (total_weight: $LOT_TOTAL_WEIGHT, amount: $LOT_AMOUNT)"
    else
        log_fail "Lot calculations (Expected: weight=$EXPECTED_WEIGHT, amount=$EXPECTED_AMOUNT, Got: weight=$LOT_TOTAL_WEIGHT, amount=$LOT_AMOUNT)"
    fi
    
    # Update
    log_test "Update Inward Slip Pass"
    RESPONSE=$(curl -s -X PUT "$BASE_URL/inward-slip-passes/$ISP_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"status": "completed"}')
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
        log_pass "Update inward slip pass"
    else
        log_fail "Update inward slip pass"
    fi
    
    # Create multiple lots
    log_test "Create Inward Slip Pass with multiple lots"
    RESPONSE=$(curl -s -X POST "$BASE_URL/inward-slip-passes" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"$SAUDA_ID\",
            \"slip_number\": \"ISP-TEST-002\",
            \"date\": \"2024-11-14\",
            \"vehicle_number\": \"TEST002\",
            \"party_name\": \"Test Vendor\",
            \"lots\": [
                {\"lot_number\": \"LOT002\", \"item_name\": \"Test Rice\", \"no_of_bags\": 50, \"bag_weight\": 50, \"bill_weight\": 2500, \"received_weight\": 2480, \"rate\": 45.50},
                {\"lot_number\": \"LOT003\", \"item_name\": \"Test Rice\", \"no_of_bags\": 30, \"bag_weight\": 50, \"bill_weight\": 1500, \"received_weight\": 1470, \"rate\": 45.50}
            ]
        }")
    ISP2_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -n "$ISP2_ID" ] && [ "$ISP2_ID" != "null" ]; then
        log_pass "Create inward slip pass with multiple lots"
    else
        log_fail "Create inward slip pass with multiple lots"
    fi
}

# Test 4: Purchase CRUD and Calculations
test_purchase_crud_and_calculations() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 4: PURCHASE CRUD AND CALCULATIONS"
    echo "═══════════════════════════════════════════════════════════"
    
    SAUDA_ID=$(curl -s -X GET "$BASE_URL/saudas" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[] | select(.sauda_type == "exgodown") | .id' | head -1)
    VENDOR_ID="f6d38f0f-22e6-4b91-85e9-5ffbd36def05"
    
    # Create
    log_test "Create Purchase"
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"vendor_id\": \"$VENDOR_ID\",
            \"sauda_id\": \"$SAUDA_ID\",
            \"purchase_date\": \"2024-11-15\",
            \"igst_percentage\": 1.8
        }")
    
    PURCHASE_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$PURCHASE_ID" ] || [ "$PURCHASE_ID" = "null" ]; then
        log_fail "Create purchase"
        echo "$RESPONSE" | jq
        return
    fi
    log_pass "Create purchase: $PURCHASE_ID"
    
    # Verify transport details auto-population
    log_test "Verify Transport Details Auto-Population"
    RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN")
    TRANSPORT_NAME=$(echo "$RESPONSE" | jq -r '.data.transport_name // empty')
    TRUCK_NUMBER=$(echo "$RESPONSE" | jq -r '.data.truck_number // empty')
    
    if [ -n "$TRANSPORT_NAME" ] && [ "$TRANSPORT_NAME" != "null" ] && \
       [ -n "$TRUCK_NUMBER" ] && [ "$TRUCK_NUMBER" != "null" ]; then
        log_pass "Transport details auto-populated (name: $TRANSPORT_NAME, truck: $TRUCK_NUMBER)"
    else
        log_fail "Transport details auto-population"
    fi
    
    # Trigger recalculation by deleting an inward slip pass
    log_test "Test Purchase Recalculation on Inward Slip Pass Deletion"
    ISP_ID=$(curl -s -X GET "$BASE_URL/inward-slip-passes?sauda_id=$SAUDA_ID" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[0].id')
    
    # Get purchase amount before deletion
    BEFORE_RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN")
    BEFORE_AMOUNT=$(echo "$BEFORE_RESPONSE" | jq -r '.data.total_amount // 0')
    
    # Delete inward slip pass
    curl -s -X DELETE "$BASE_URL/inward-slip-passes/$ISP_ID" -H "Authorization: Bearer $TOKEN" > /dev/null
    sleep 1
    
    # Get purchase amount after deletion
    AFTER_RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN")
    AFTER_AMOUNT=$(echo "$AFTER_RESPONSE" | jq -r '.data.total_amount // 0')
    
    if [ "$(echo "$BEFORE_AMOUNT != $AFTER_AMOUNT" | bc)" -eq 1 ]; then
        log_pass "Purchase amount recalculated (Before: ₹$BEFORE_AMOUNT, After: ₹$AFTER_AMOUNT)"
    else
        log_fail "Purchase amount recalculation"
    fi
    
    # Verify calculation includes all factors
    log_test "Verify Purchase Calculation Includes All Factors"
    SAUDA_DATA=$(curl -s -X GET "$BASE_URL/saudas/$SAUDA_ID" -H "Authorization: Bearer $TOKEN")
    BASE_AMOUNT=$(curl -s -X GET "$BASE_URL/inward-slip-passes?sauda_id=$SAUDA_ID" -H "Authorization: Bearer $TOKEN" | \
        jq '[.data[].lots[]] | [.[].amount] | add')
    CASH_DISCOUNT=$(echo "$SAUDA_DATA" | jq -r '.data.cash_discount')
    BROKER_COMM=$(echo "$SAUDA_DATA" | jq -r '.data.broker_commission')
    TRANS_COST=$(echo "$SAUDA_DATA" | jq -r '.data.transportation_cost')
    IGST_PCT=$(echo "$AFTER_RESPONSE" | jq -r '.data.igst_percentage')
    
    # Manual calculation
    AMOUNT_AFTER_DISCOUNT=$(echo "scale=2; $BASE_AMOUNT - $CASH_DISCOUNT" | bc)
    BROKER_AMT=$(echo "scale=2; $AMOUNT_AFTER_DISCOUNT * $BROKER_COMM / 100" | bc)
    AMOUNT_WITH_COMM=$(echo "scale=2; $AMOUNT_AFTER_DISCOUNT + $BROKER_AMT" | bc)
    AMOUNT_WITH_TRANS=$(echo "scale=2; $AMOUNT_WITH_COMM + $TRANS_COST" | bc)
    IGST_AMT=$(echo "scale=2; $AMOUNT_WITH_TRANS * $IGST_PCT / 100" | bc)
    EXPECTED_AMOUNT=$(echo "scale=2; $AMOUNT_WITH_TRANS + $IGST_AMT" | bc)
    
    # Compare (allow 0.01 difference for rounding)
    DIFF=$(echo "scale=2; $AFTER_AMOUNT - $EXPECTED_AMOUNT" | bc | sed 's/-//')
    if [ "$(echo "$DIFF < 0.02" | bc)" -eq 1 ]; then
        log_pass "Purchase calculation verified (Expected: ₹$EXPECTED_AMOUNT, Got: ₹$AFTER_AMOUNT)"
    else
        log_fail "Purchase calculation mismatch (Expected: ₹$EXPECTED_AMOUNT, Got: ₹$AFTER_AMOUNT)"
    fi
    
    # Update purchase
    log_test "Update Purchase"
    RESPONSE=$(curl -s -X PUT "$BASE_URL/purchases/$PURCHASE_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"invoice_number": "INV-TEST-001"}')
    INVOICE_NUM=$(echo "$RESPONSE" | jq -r '.data.invoice_number')
    if [ "$INVOICE_NUM" = "INV-TEST-001" ]; then
        log_pass "Update purchase"
    else
        log_fail "Update purchase"
    fi
    
    # Status update
    log_test "Update Purchase Status"
    RESPONSE=$(curl -s -X PATCH "$BASE_URL/purchases/$PURCHASE_ID/status" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"status": "in_transit"}')
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
        log_pass "Update purchase status"
    else
        log_fail "Update purchase status"
    fi
}

# Test 5: Payment Advice CRUD and Calculations
test_payment_advice_crud() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 5: PAYMENT ADVICE CRUD AND CALCULATIONS"
    echo "═══════════════════════════════════════════════════════════"
    
    PURCHASE_ID=$(curl -s -X GET "$BASE_URL/purchases" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[-1].id')
    USER_ID="14b4a292-ea4a-4a0b-92ff-1aca07907bde"
    VENDOR_ID="f6d38f0f-22e6-4b91-85e9-5ffbd36def05"
    
    PURCHASE_DATA=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN")
    PAYMENT_AMOUNT=$(echo "$PURCHASE_DATA" | jq -r '.data.total_amount // 0')
    
    # Skip if purchase amount is 0 or null
    if [ "$PAYMENT_AMOUNT" = "0" ] || [ "$PAYMENT_AMOUNT" = "null" ]; then
        log_info "Purchase amount is 0, skipping payment advice creation"
        return
    fi
    
    # Create
    log_test "Create Payment Advice with Charges"
    RESPONSE=$(curl -s -X POST "$BASE_URL/payment-advices" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"purchase_id\": \"$PURCHASE_ID\",
            \"payer_id\": \"$USER_ID\",
            \"recipient_id\": \"$VENDOR_ID\",
            \"sr_number\": \"SR-TEST-001\",
            \"amount\": $PAYMENT_AMOUNT,
            \"date_of_payment\": \"2024-11-15\",
            \"charges\": [
                {\"charge_name\": \"CD 2.0%\", \"charge_value\": $(echo "scale=2; $PAYMENT_AMOUNT * 0.02" | bc), \"charge_type\": \"fixed\"},
                {\"charge_name\": \"RTGS Charges\", \"charge_value\": 200, \"charge_type\": \"fixed\"}
            ]
        }")
    
    PAYMENT_ADVICE_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
    if [ -z "$PAYMENT_ADVICE_ID" ] || [ "$PAYMENT_ADVICE_ID" = "null" ]; then
        log_fail "Create payment advice"
        echo "$RESPONSE" | jq
        return
    fi
    log_pass "Create payment advice: $PAYMENT_ADVICE_ID"
    
    # Verify purchase is linked
    log_test "Verify Purchase-Payment Advice Link"
    PURCHASE_RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN")
    LINKED_PA_ID=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.payment_advice_id')
    if [ "$LINKED_PA_ID" = "$PAYMENT_ADVICE_ID" ]; then
        log_pass "Purchase-Payment Advice link verified"
    else
        log_fail "Purchase-Payment Advice link (Expected: $PAYMENT_ADVICE_ID, Got: $LINKED_PA_ID)"
    fi
    
    # Verify net payable calculation
    log_test "Verify Net Payable Calculation"
    RESPONSE=$(curl -s -X GET "$BASE_URL/payment-advices/$PAYMENT_ADVICE_ID" -H "Authorization: Bearer $TOKEN")
    NET_PAYABLE=$(echo "$RESPONSE" | jq -r '.data.net_payable')
    AMOUNT=$(echo "$RESPONSE" | jq -r '.data.amount')
    TOTAL_CHARGES=$(echo "$RESPONSE" | jq '[.data.charges[].charge_value] | add')
    EXPECTED_NET=$(echo "scale=2; $AMOUNT - $TOTAL_CHARGES" | bc)
    
    DIFF=$(echo "scale=2; $NET_PAYABLE - $EXPECTED_NET" | bc | sed 's/-//')
    if [ "$(echo "$DIFF < 0.02" | bc)" -eq 1 ]; then
        log_pass "Net payable calculation verified (Expected: ₹$EXPECTED_NET, Got: ₹$NET_PAYABLE)"
    else
        log_fail "Net payable calculation (Expected: ₹$EXPECTED_NET, Got: ₹$NET_PAYABLE)"
    fi
    
    # Update payment advice
    log_test "Update Payment Advice"
    RESPONSE=$(curl -s -X PUT "$BASE_URL/payment-advices/$PAYMENT_ADVICE_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"transaction_id": "TXN123456"}')
    TXN_ID=$(echo "$RESPONSE" | jq -r '.data.transaction_id')
    if [ "$TXN_ID" = "TXN123456" ]; then
        log_pass "Update payment advice"
    else
        log_fail "Update payment advice"
    fi
    
    # Verify status auto-update when transaction_id and payment_slip are provided
    log_test "Verify Status Auto-Update to 'completed'"
    RESPONSE=$(curl -s -X PUT "$BASE_URL/payment-advices/$PAYMENT_ADVICE_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"payment_slip_image_url": "https://example.com/slip.jpg", "transaction_id": "TXN123456"}')
    STATUS=$(echo "$RESPONSE" | jq -r '.data.status')
    if [ "$STATUS" = "completed" ]; then
        log_pass "Status auto-updated to 'completed'"
    else
        log_fail "Status auto-update (Expected: completed, Got: $STATUS)"
    fi
}

# Test 6: Edge Cases and Validations
test_edge_cases() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 6: EDGE CASES AND VALIDATIONS"
    echo "═══════════════════════════════════════════════════════════"
    
    # Test invalid UUID
    log_test "Test Invalid UUID Validation"
    RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/invalid-uuid" -H "Authorization: Bearer $TOKEN")
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "false" ]; then
        log_pass "Invalid UUID validation"
    else
        log_fail "Invalid UUID validation"
    fi
    
    # Test missing required fields
    log_test "Test Missing Required Fields"
    RESPONSE=$(curl -s -X POST "$BASE_URL/purchases" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"vendor_id": "test"}')
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "false" ]; then
        log_pass "Missing required fields validation"
    else
        log_fail "Missing required fields validation"
    fi
    
    # Test non-existent resource
    log_test "Test Non-Existent Resource"
    FAKE_UUID="00000000-0000-0000-0000-000000000000"
    RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$FAKE_UUID" -H "Authorization: Bearer $TOKEN")
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "false" ]; then
        log_pass "Non-existent resource handling"
    else
        log_fail "Non-existent resource handling"
    fi
    
    # Test zero values (should be rejected by validation)
    log_test "Test Zero Values Validation (Should Reject)"
    SAUDA_ID=$(curl -s -X GET "$BASE_URL/saudas" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[0].id')
    RESPONSE=$(curl -s -X POST "$BASE_URL/inward-slip-passes" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"$SAUDA_ID\",
            \"slip_number\": \"ISP-ZERO-TEST\",
            \"date\": \"2024-11-15\",
            \"vehicle_number\": \"TEST\",
            \"party_name\": \"Test\",
            \"lots\": [{
                \"lot_number\": \"ZERO\",
                \"item_name\": \"Test\",
                \"no_of_bags\": 0,
                \"bill_weight\": 0,
                \"received_weight\": 0,
                \"rate\": 0
            }]
        }")
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" = "false" ]; then
        log_pass "Zero values correctly rejected by validation"
    else
        log_fail "Zero values validation (should reject but didn't)"
    fi
}

# Test 7: Multiple Inward Slip Passes and Recalculation
test_multiple_isp_recalculation() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 7: MULTIPLE INWARD SLIP PASSES & RECALCULATION"
    echo "═══════════════════════════════════════════════════════════"
    
    SAUDA_ID=$(curl -s -X GET "$BASE_URL/saudas" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[] | select(.sauda_type == "exgodown") | .id' | head -1)
    
    # Create 3 inward slip passes
    log_test "Create Multiple Inward Slip Passes"
    for i in 1 2 3; do
        RESPONSE=$(curl -s -X POST "$BASE_URL/inward-slip-passes" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"sauda_id\": \"$SAUDA_ID\",
                \"slip_number\": \"ISP-MULTI-$i\",
                \"date\": \"2024-11-1$i\",
                \"vehicle_number\": \"MULTI$i\",
                \"party_name\": \"Test Vendor\",
                \"lots\": [{
                    \"lot_number\": \"MULTI$i\",
                    \"item_name\": \"Test\",
                    \"no_of_bags\": $((i * 50)),
                    \"bag_weight\": 50,
                    \"bill_weight\": $((i * 2500)),
                    \"received_weight\": $((i * 2475)),
                    \"rate\": 45.50
                }]
            }")
        ISP_ID=$(echo "$RESPONSE" | jq -r '.data.id')
        if [ -n "$ISP_ID" ] && [ "$ISP_ID" != "null" ]; then
            log_pass "Create ISP-MULTI-$i"
        else
            log_fail "Create ISP-MULTI-$i"
        fi
    done
    
    # Get purchase
    PURCHASE_ID=$(curl -s -X GET "$BASE_URL/purchases" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[-1].id')
    
    # Get totals before deletion
    log_test "Test Recalculation with Multiple ISPs"
    BEFORE_RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN")
    BEFORE_AMOUNT=$(echo "$BEFORE_RESPONSE" | jq -r '.data.total_amount // 0')
    BEFORE_WEIGHT=$(echo "$BEFORE_RESPONSE" | jq -r '.data.total_weight // 0')
    
    # Delete one ISP
    ISP_TO_DELETE=$(curl -s -X GET "$BASE_URL/inward-slip-passes?sauda_id=$SAUDA_ID" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[] | select(.slip_number == "ISP-MULTI-2") | .id')
    curl -s -X DELETE "$BASE_URL/inward-slip-passes/$ISP_TO_DELETE" -H "Authorization: Bearer $TOKEN" > /dev/null
    sleep 1
    
    # Get totals after deletion
    AFTER_RESPONSE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN")
    AFTER_AMOUNT=$(echo "$AFTER_RESPONSE" | jq -r '.data.total_amount // 0')
    AFTER_WEIGHT=$(echo "$AFTER_RESPONSE" | jq -r '.data.total_weight // 0')
    
    if [ "$(echo "$BEFORE_AMOUNT != $AFTER_AMOUNT" | bc)" -eq 1 ] && \
       [ "$(echo "$BEFORE_WEIGHT != $AFTER_WEIGHT" | bc)" -eq 1 ]; then
        log_pass "Recalculation works with multiple ISPs (Amount: ₹$BEFORE_AMOUNT → ₹$AFTER_AMOUNT, Weight: $BEFORE_WEIGHT → $AFTER_WEIGHT)"
    else
        log_fail "Recalculation with multiple ISPs"
    fi
}

# Test 8: Payment Advice Amount Update
test_payment_advice_amount_update() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 8: PAYMENT ADVICE AMOUNT UPDATE"
    echo "═══════════════════════════════════════════════════════════"
    
    PURCHASE_ID=$(curl -s -X GET "$BASE_URL/purchases" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[-1].id')
    PAYMENT_ADVICE_ID=$(curl -s -X GET "$BASE_URL/payment-advices" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[-1].id')
    
    if [ -z "$PAYMENT_ADVICE_ID" ] || [ "$PAYMENT_ADVICE_ID" = "null" ]; then
        log_info "No payment advice found, skipping test"
        return
    fi
    
    log_test "Verify Payment Advice Amount Updates When Purchase Amount Changes"
    
    # Get initial amounts
    BEFORE_PA_RESPONSE=$(curl -s -X GET "$BASE_URL/payment-advices/$PAYMENT_ADVICE_ID" -H "Authorization: Bearer $TOKEN")
    BEFORE_PA_AMOUNT=$(echo "$BEFORE_PA_RESPONSE" | jq -r '.data.amount')
    BEFORE_PURCHASE_AMOUNT=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data.total_amount')
    
    # Delete an inward slip pass to change purchase amount
    SAUDA_ID=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data.sauda_id')
    ISP_TO_DELETE=$(curl -s -X GET "$BASE_URL/inward-slip-passes?sauda_id=$SAUDA_ID" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[0].id')
    curl -s -X DELETE "$BASE_URL/inward-slip-passes/$ISP_TO_DELETE" -H "Authorization: Bearer $TOKEN" > /dev/null
    sleep 1
    
    # Get amounts after deletion
    AFTER_PA_RESPONSE=$(curl -s -X GET "$BASE_URL/payment-advices/$PAYMENT_ADVICE_ID" -H "Authorization: Bearer $TOKEN")
    AFTER_PA_AMOUNT=$(echo "$AFTER_PA_RESPONSE" | jq -r '.data.amount')
    AFTER_PURCHASE_AMOUNT=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data.total_amount')
    
    # Verify payment advice amount matches purchase amount
    DIFF=$(echo "scale=2; $AFTER_PA_AMOUNT - $AFTER_PURCHASE_AMOUNT" | bc | sed 's/-//')
    if [ "$(echo "$DIFF < 0.02" | bc)" -eq 1 ]; then
        log_pass "Payment advice amount updated (PA: ₹$AFTER_PA_AMOUNT, Purchase: ₹$AFTER_PURCHASE_AMOUNT)"
    else
        log_fail "Payment advice amount update (PA: ₹$AFTER_PA_AMOUNT, Purchase: ₹$AFTER_PURCHASE_AMOUNT)"
    fi
}

# Test 9: Status Transitions
test_status_transitions() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 9: STATUS TRANSITIONS"
    echo "═══════════════════════════════════════════════════════════"
    
    # Test purchase status auto-update on transportation bill upload
    log_test "Test Purchase Status Auto-Update on Transportation Bill Upload"
    PURCHASE_ID=$(curl -s -X GET "$BASE_URL/purchases" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[-1].id')
    
    # Get inward slip pass ID for this purchase's sauda
    SAUDA_ID=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data.sauda_id')
    INWARD_SLIP_PASS_ID=$(curl -s -X GET "$BASE_URL/inward-slip-passes?sauda_id=$SAUDA_ID" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[0].id')
    
    if [ -n "$INWARD_SLIP_PASS_ID" ] && [ "$INWARD_SLIP_PASS_ID" != "null" ]; then
        RESPONSE=$(curl -s -X PUT "$BASE_URL/inward-slip-passes/$INWARD_SLIP_PASS_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"transportation_bill_image_url": "https://example.com/bill.jpg"}')
        URL=$(echo "$RESPONSE" | jq -r '.data.transportation_bill_image_url')
        if [ "$URL" = "https://example.com/bill.jpg" ]; then
            log_pass "Transportation bill URL updated in inward slip pass"
    else
            log_fail "Transportation bill URL update (Expected: https://example.com/bill.jpg, Got: $URL)"
        fi
    else
        log_skip "No inward slip pass found for testing transportation bill upload"
    fi
    
    # Test payment advice status auto-update
    log_test "Test Payment Advice Status Auto-Update"
    PAYMENT_ADVICE_ID=$(curl -s -X GET "$BASE_URL/payment-advices" -H "Authorization: Bearer $TOKEN" | \
        jq -r '.data[-1].id')
    
    if [ -n "$PAYMENT_ADVICE_ID" ] && [ "$PAYMENT_ADVICE_ID" != "null" ]; then
        # Reset status first
        curl -s -X PUT "$BASE_URL/payment-advices/$PAYMENT_ADVICE_ID" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d '{"status": "pending", "transaction_id": null, "payment_slip_image_url": null}' > /dev/null
        
        # Update with both transaction_id and payment_slip
        RESPONSE=$(curl -s -X PUT "$BASE_URL/payment-advices/$PAYMENT_ADVICE_ID" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d '{"transaction_id": "TXN789", "payment_slip_image_url": "https://example.com/slip.jpg"}')
        STATUS=$(echo "$RESPONSE" | jq -r '.data.status')
        if [ "$STATUS" = "completed" ]; then
            log_pass "Payment advice status auto-updated to 'completed'"
        else
            log_fail "Payment advice status auto-update (Expected: completed, Got: $STATUS)"
        fi
    fi
}

# Test 10: Complete Flow Integration
test_complete_flow() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUITE 10: COMPLETE FLOW INTEGRATION"
    echo "═══════════════════════════════════════════════════════════"
    
    log_test "Complete Flow: Transporter → Sauda → ISP → Purchase → Payment Advice"
    
    # Create transporter
    TRANSPORTER_RESPONSE=$(curl -s -X POST "$BASE_URL/transporters" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "business_name": "Complete Flow Transport",
            "contact_person": "Test",
            "phone": "9876543210",
            "email": "complete@transport.com",
            "address": {"street": "Test", "city": "Test", "state": "Test", "pincode": "123456", "country": "India"},
            "vehicle_numbers": ["CF001"]
        }')
    TRANSPORTER_ID=$(echo "$TRANSPORTER_RESPONSE" | jq -r '.data.id')
    
    # Create sauda
    VENDOR_ID="f6d38f0f-22e6-4b91-85e9-5ffbd36def05"
    BROKER_ID="f4eb4f83-21cc-4d9f-b8b1-6b59b579c51a"
    RICE_CODE_ID="adfcd002-ae3a-48f3-8ebd-05f1681902ae"
    SAUDA_RESPONSE=$(curl -s -X POST "$BASE_URL/saudas" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_type\": \"exgodown\",
            \"rice_quality\": \"Complete Flow Rice\",
            \"rice_code_id\": \"$RICE_CODE_ID\",
            \"rate\": 45.50,
            \"broker_id\": \"$BROKER_ID\",
            \"broker_commission\": 2.5,
            \"transporter_id\": \"$TRANSPORTER_ID\",
            \"transportation_cost\": 10000,
            \"cash_discount\": 5000,
            \"purchaser_id\": \"$VENDOR_ID\"
        }")
    SAUDA_ID=$(echo "$SAUDA_RESPONSE" | jq -r '.data.id')
    
    # Create inward slip pass FIRST (before purchase)
    ISP_RESPONSE=$(curl -s -X POST "$BASE_URL/inward-slip-passes" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"$SAUDA_ID\",
            \"slip_number\": \"ISP-COMPLETE-001\",
            \"date\": \"2024-11-15\",
            \"vehicle_number\": \"CF001\",
            \"party_name\": \"Test Vendor\",
            \"lots\": [{
                \"lot_number\": \"COMPLETE001\",
                \"item_name\": \"Test Rice\",
                \"no_of_bags\": 100,
                \"bag_weight\": 50,
                \"bill_weight\": 5000,
                \"received_weight\": 4950,
                \"rate\": 45.50
            }]
        }")
    ISP_ID=$(echo "$ISP_RESPONSE" | jq -r '.data.id')
    
    # Create purchase
    PURCHASE_RESPONSE=$(curl -s -X POST "$BASE_URL/purchases" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"vendor_id\": \"$VENDOR_ID\",
            \"sauda_id\": \"$SAUDA_ID\",
            \"purchase_date\": \"2024-11-15\",
            \"igst_percentage\": 1.8
        }")
    PURCHASE_ID=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.id')
    
    # Trigger purchase calculation by deleting and recreating inward slip pass
    curl -s -X DELETE "$BASE_URL/inward-slip-passes/$ISP_ID" -H "Authorization: Bearer $TOKEN" > /dev/null
    sleep 1
    ISP_RESPONSE=$(curl -s -X POST "$BASE_URL/inward-slip-passes" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"sauda_id\": \"$SAUDA_ID\",
            \"slip_number\": \"ISP-COMPLETE-001\",
            \"date\": \"2024-11-15\",
            \"vehicle_number\": \"CF001\",
            \"party_name\": \"Test Vendor\",
            \"lots\": [{
                \"lot_number\": \"COMPLETE001\",
                \"item_name\": \"Test Rice\",
                \"no_of_bags\": 100,
                \"bag_weight\": 50,
                \"bill_weight\": 5000,
                \"received_weight\": 4950,
                \"rate\": 45.50
            }]
        }")
    sleep 1
    
    # Create payment advice
    PURCHASE_DATA=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN")
    PAYMENT_AMOUNT=$(echo "$PURCHASE_DATA" | jq -r '.data.total_amount // 0')
    USER_ID="14b4a292-ea4a-4a0b-92ff-1aca07907bde"
    
    # Skip if purchase amount is 0
    if [ "$PAYMENT_AMOUNT" = "0" ] || [ "$PAYMENT_AMOUNT" = "null" ]; then
        log_info "Purchase amount is 0, skipping payment advice creation in complete flow"
        return
    fi
    
    PAYMENT_ADVICE_RESPONSE=$(curl -s -X POST "$BASE_URL/payment-advices" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"purchase_id\": \"$PURCHASE_ID\",
            \"payer_id\": \"$USER_ID\",
            \"recipient_id\": \"$VENDOR_ID\",
            \"amount\": $PAYMENT_AMOUNT,
            \"date_of_payment\": \"2024-11-15\"
        }")
    PAYMENT_ADVICE_ID=$(echo "$PAYMENT_ADVICE_RESPONSE" | jq -r '.data.id // empty')
    
    if [ -z "$PAYMENT_ADVICE_ID" ] || [ "$PAYMENT_ADVICE_ID" = "null" ]; then
        ERROR_MSG=$(echo "$PAYMENT_ADVICE_RESPONSE" | jq -r '.error // "Unknown error"')
        log_fail "Complete flow verification (Payment advice creation failed: $ERROR_MSG, Amount: $PAYMENT_AMOUNT)"
        return
    fi
    
    # Wait a bit for linking
    sleep 1
    
    # Verify complete flow
    FINAL_PURCHASE=$(curl -s -X GET "$BASE_URL/purchases/$PURCHASE_ID" -H "Authorization: Bearer $TOKEN")
    FINAL_PA=$(curl -s -X GET "$BASE_URL/payment-advices/$PAYMENT_ADVICE_ID" -H "Authorization: Bearer $TOKEN")
    
    PURCHASE_AMOUNT=$(echo "$FINAL_PURCHASE" | jq -r '.data.total_amount // 0')
    PA_AMOUNT=$(echo "$FINAL_PA" | jq -r '.data.amount // 0')
    PURCHASE_PA_ID=$(echo "$FINAL_PURCHASE" | jq -r '.data.payment_advice_id // empty')
    PA_PURCHASE_ID=$(echo "$FINAL_PA" | jq -r '.data.purchase_id // empty')
    
    # Check linking
    LINK_OK=false
    AMOUNT_OK=false
    
    if [ "$PURCHASE_PA_ID" = "$PAYMENT_ADVICE_ID" ] && [ "$PA_PURCHASE_ID" = "$PURCHASE_ID" ]; then
        LINK_OK=true
    fi
    
    # Check amounts (allow small difference for rounding)
    if [ "$PURCHASE_AMOUNT" != "0" ] && [ "$PA_AMOUNT" != "0" ]; then
        DIFF=$(echo "scale=2; $PURCHASE_AMOUNT - $PA_AMOUNT" | bc | sed 's/-//')
        if [ "$(echo "$DIFF < 0.02" | bc)" -eq 1 ]; then
            AMOUNT_OK=true
        fi
    fi
    
    if [ "$LINK_OK" = true ] && [ "$AMOUNT_OK" = true ]; then
        log_pass "Complete flow verified (All entities linked, amounts match: ₹$PURCHASE_AMOUNT = ₹$PA_AMOUNT)"
    else
        log_fail "Complete flow verification (Link: $LINK_OK, Amount: $AMOUNT_OK, PA: ₹$PA_AMOUNT, Purchase: ₹$PURCHASE_AMOUNT)"
    fi
}

# Print summary
print_summary() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "TEST SUMMARY"
    echo "═══════════════════════════════════════════════════════════"
    echo "Total Tests: $TOTAL_TESTS"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
        exit 0
    else
        echo -e "${RED}❌ SOME TESTS FAILED${NC}"
        exit 1
    fi
}

# Main execution
main() {
    echo "═══════════════════════════════════════════════════════════"
    echo "COMPREHENSIVE PURCHASE FLOW TESTING"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    login
    cleanup
    
    test_transporter_crud
    test_sauda_crud
    test_inward_slip_pass_crud
    test_purchase_crud_and_calculations
    test_payment_advice_crud
    test_edge_cases
    test_multiple_isp_recalculation
    test_payment_advice_amount_update
    test_status_transitions
    test_complete_flow
    
    print_summary
}

# Run tests
main

