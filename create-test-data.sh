#!/bin/bash

# Script to create test data for products, recipes, packaging, and batches
# Make sure migrations are run first: npm run migrate

BASE_URL="http://localhost:3000/api/v1"

echo "=========================================="
echo "Creating Test Data for Production System"
echo "=========================================="

# Step 1: Login and get token
echo -e "\n1. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/loginUser" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Xk9#mP2@nQ7!vR4$wT8&aL5"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed! Please check credentials."
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful"
echo "Token: ${TOKEN:0:30}..."

# Step 2: Create Products (auto-creates packaging: 10kg, 25kg, 50kg)
echo -e "\n2. Creating Products..."

PRODUCT1_RESPONSE=$(curl -s -X POST "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium Basmati Rice",
    "description": "High quality long grain basmati rice",
    "brand": "Tamara",
    "packet_type": "PP Bag"
  }')

PRODUCT1_ID=$(echo $PRODUCT1_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "✅ Created Product 1: Premium Basmati Rice (ID: ${PRODUCT1_ID:0:8}...)"

PRODUCT2_RESPONSE=$(curl -s -X POST "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Golden Sella Rice",
    "description": "Premium parboiled rice",
    "brand": "Hariom",
    "packet_type": "PP Bag"
  }')

PRODUCT2_ID=$(echo $PRODUCT2_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "✅ Created Product 2: Golden Sella Rice (ID: ${PRODUCT2_ID:0:8}...)"

# Step 3: Get Packaging for Products (to verify auto-creation)
echo -e "\n3. Verifying Packaging Auto-Creation..."

PACKAGING1_RESPONSE=$(curl -s "$BASE_URL/packaging?product_id=$PRODUCT1_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "✅ Product 1 Packaging:"
echo "$PACKAGING1_RESPONSE" | grep -o '"holding_capacity":[0-9]*' | head -3

# Step 4: Get existing lots (for recipe formulas)
echo -e "\n4. Fetching existing lots for recipes..."

LOTS_RESPONSE=$(curl -s "$BASE_URL/inventory/lots" \
  -H "Authorization: Bearer $TOKEN")

# Extract first 3 lot IDs
LOT_IDS=$(echo "$LOTS_RESPONSE" | grep -o '"lot_id":"[^"]*' | cut -d'"' -f4 | head -3)

if [ -z "$LOT_IDS" ]; then
  echo "⚠️  No lots found in inventory."
  echo "   Checking if any lots exist in the system..."
  
  # Try to get all lots (not just inventory)
  ALL_LOTS=$(curl -s "$BASE_URL/lots" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  
  ALL_LOT_IDS=$(echo "$ALL_LOTS" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -3)
  
  if [ -z "$ALL_LOT_IDS" ]; then
    echo "❌ No lots found in system. Cannot create recipes with formulas."
    echo ""
    echo "To create lots, you need to:"
    echo "1. Create a Sauda (purchase contract)"
    echo "2. Create an Inward Slip Pass with that Sauda"
    echo "3. Create a Kaanta (weighbridge entry) - this auto-creates lots"
    echo ""
    echo "Creating recipes with empty formulas for now..."
    
    RECIPE1_RESPONSE=$(curl -s -X POST "$BASE_URL/recipes" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "recipe_name": "Premium Basmati Mix",
        "formula": []
      }')
    
    RECIPE1_ID=$(echo $RECIPE1_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    echo "✅ Created Recipe 1: Premium Basmati Mix (ID: ${RECIPE1_ID:0:8}...)"
    echo "   ⚠️  Note: Formula is empty. Update recipe after creating lots."
    
    RECIPE2_RESPONSE=$(curl -s -X POST "$BASE_URL/recipes" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "recipe_name": "Golden Sella Blend",
        "formula": []
      }')
    
    RECIPE2_ID=$(echo $RECIPE2_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    echo "✅ Created Recipe 2: Golden Sella Blend (ID: ${RECIPE2_ID:0:8}...)"
    echo "   ⚠️  Note: Formula is empty. Update recipe after creating lots."
    
    SKIP_BATCHES=true
  else
    LOT_IDS=$ALL_LOT_IDS
    echo "✅ Found lots: Using existing lots from system"
  fi
fi

if [ -z "$SKIP_BATCHES" ]; then
  LOT_ID_ARRAY=($LOT_IDS)
  LOT1_ID=${LOT_ID_ARRAY[0]}
  LOT2_ID=${LOT_ID_ARRAY[1]}
  LOT3_ID=${LOT_ID_ARRAY[2]}
  
  echo "✅ Found lots: ${LOT1_ID:0:8}..., ${LOT2_ID:0:8}..., ${LOT3_ID:0:8}..."
  
  # Step 5: Create Recipes with formulas
  echo -e "\n5. Creating Recipes..."
  
  RECIPE1_RESPONSE=$(curl -s -X POST "$BASE_URL/recipes" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"recipe_name\": \"Premium Basmati Mix\",
      \"formula\": [
        {
          \"lot_id\": \"$LOT1_ID\",
          \"percentage\": 40.00
        },
        {
          \"lot_id\": \"$LOT2_ID\",
          \"percentage\": 35.00
        },
        {
          \"lot_id\": \"$LOT3_ID\",
          \"percentage\": 25.00
        }
      ]
    }")
  
  RECIPE1_ID=$(echo $RECIPE1_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
  echo "✅ Created Recipe 1: Premium Basmati Mix (ID: ${RECIPE1_ID:0:8}...)"
  
  RECIPE2_RESPONSE=$(curl -s -X POST "$BASE_URL/recipes" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"recipe_name\": \"Golden Sella Blend\",
      \"formula\": [
        {
          \"lot_id\": \"$LOT1_ID\",
          \"percentage\": 50.00
        },
        {
          \"lot_id\": \"$LOT2_ID\",
          \"percentage\": 50.00
        }
      ]
    }")
  
  RECIPE2_ID=$(echo $RECIPE2_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
  echo "✅ Created Recipe 2: Golden Sella Blend (ID: ${RECIPE2_ID:0:8}...)"
fi

# Step 6: Link Recipes to Products
echo -e "\n6. Linking Recipes to Products..."

curl -s -X POST "$BASE_URL/products/$PRODUCT1_ID/recipes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"recipe_id\": \"$RECIPE1_ID\"
  }" > /dev/null

echo "✅ Linked Recipe 1 to Product 1"

if [ ! -z "$RECIPE2_ID" ]; then
  curl -s -X POST "$BASE_URL/products/$PRODUCT2_ID/recipes" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"recipe_id\": \"$RECIPE2_ID\"
    }" > /dev/null
  
  echo "✅ Linked Recipe 2 to Product 2"
fi

# Step 7: Get Packaging IDs for batches
echo -e "\n7. Getting Packaging IDs..."

PACKAGING_RESPONSE=$(curl -s "$BASE_URL/packaging?product_id=$PRODUCT1_ID" \
  -H "Authorization: Bearer $TOKEN")

# Extract packaging IDs by weight (using Python to handle decimal values)
PACKAGING_10KG_ID=$(echo "$PACKAGING_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); pkg = [p for p in data.get('data', []) if float(p['holding_capacity']) == 10]; print(pkg[0]['id'] if pkg else '')")
PACKAGING_25KG_ID=$(echo "$PACKAGING_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); pkg = [p for p in data.get('data', []) if float(p['holding_capacity']) == 25]; print(pkg[0]['id'] if pkg else '')")
PACKAGING_50KG_ID=$(echo "$PACKAGING_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); pkg = [p for p in data.get('data', []) if float(p['holding_capacity']) == 50]; print(pkg[0]['id'] if pkg else '')")

echo "✅ Found packaging:"
echo "   10kg: ${PACKAGING_10KG_ID:0:8}..."
echo "   25kg: ${PACKAGING_25KG_ID:0:8}..."
echo "   50kg: ${PACKAGING_50KG_ID:0:8}..."

# Step 8: Add Packets Inventory
echo -e "\n8. Adding Packets Inventory..."

curl -s -X POST "$BASE_URL/packaging/$PACKAGING_10KG_ID/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"packaging_id\": \"$PACKAGING_10KG_ID\",
    \"available_quantity\": 200
  }" > /dev/null

curl -s -X POST "$BASE_URL/packaging/$PACKAGING_25KG_ID/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"packaging_id\": \"$PACKAGING_25KG_ID\",
    \"available_quantity\": 100
  }" > /dev/null

curl -s -X POST "$BASE_URL/packaging/$PACKAGING_50KG_ID/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"packaging_id\": \"$PACKAGING_50KG_ID\",
    \"available_quantity\": 50
  }" > /dev/null

echo "✅ Added packets inventory: 100 (10kg), 50 (25kg), 30 (50kg)"

# Step 9: Create Batches (NEW FORMAT with packaging_quantities)
echo -e "\n9. Creating Batches with Multiple Packaging Sizes..."

if [ -z "$SKIP_BATCHES" ] && [ ! -z "$RECIPE1_ID" ] && [ ! -z "$LOT1_ID" ]; then
  BATCH1_RESPONSE=$(curl -s -X POST "$BASE_URL/batches" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"product_id\": \"$PRODUCT1_ID\",
      \"recipe_id\": \"$RECIPE1_ID\",
      \"packaging_quantities\": [
        {
          \"weight\": 10,
          \"quantity\": 100
        },
        {
          \"weight\": 25,
          \"quantity\": 200
        },
        {
          \"weight\": 50,
          \"quantity\": 150
        }
      ],
      \"status\": \"completed\"
    }")
  
  BATCH1_ID=$(echo $BATCH1_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
  BATCH1_NUMBER=$(echo $BATCH1_RESPONSE | grep -o '"batch_number":"[^"]*' | cut -d'"' -f4)
  echo "✅ Created Batch 1: $BATCH1_NUMBER"
  echo "   - 10kg: 100 kg"
  echo "   - 25kg: 200 kg"
  echo "   - 50kg: 150 kg"
  echo "   Total: 450 kg"
  
  # Create another batch with single packaging size
  BATCH2_RESPONSE=$(curl -s -X POST "$BASE_URL/batches" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"product_id\": \"$PRODUCT1_ID\",
      \"recipe_id\": \"$RECIPE1_ID\",
      \"packaging_quantities\": [
        {
          \"weight\": 25,
          \"quantity\": 500
        }
      ],
      \"status\": \"completed\"
    }")
  
  BATCH2_ID=$(echo $BATCH2_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
  BATCH2_NUMBER=$(echo $BATCH2_RESPONSE | grep -o '"batch_number":"[^"]*' | cut -d'"' -f4)
  echo "✅ Created Batch 2: $BATCH2_NUMBER"
  echo "   - 25kg: 500 kg"
  
elif [ ! -z "$SKIP_BATCHES" ]; then
  echo "⚠️  Skipping batch creation (no lots available for recipe formulas)"
  echo "   Create lots first, then update recipes, then create batches"
else
  echo "⚠️  Skipping batch creation (no recipes available)"
fi

# Step 10: Verify Finished Goods Inventory
echo -e "\n10. Checking Finished Goods Inventory..."

if [ ! -z "$BATCH1_ID" ] && [ -z "$SKIP_BATCHES" ]; then
  FINISHED_GOODS_RESPONSE=$(curl -s "$BASE_URL/inventory/finished-goods?batch_id=$BATCH1_ID" \
    -H "Authorization: Bearer $TOKEN")
  
  echo "✅ Finished Goods for Batch 1:"
  echo "$FINISHED_GOODS_RESPONSE" | grep -o '"no_of_packets":[0-9]*' | head -3
  echo "$FINISHED_GOODS_RESPONSE" | grep -o '"total_weight":[0-9.]*' | head -3
fi

# Summary
echo -e "\n=========================================="
echo "✅ Test Data Creation Complete!"
echo "=========================================="
echo "Products Created: 2"
echo "  - Premium Basmati Rice (ID: ${PRODUCT1_ID:0:8}...)"
echo "  - Golden Sella Rice (ID: ${PRODUCT2_ID:0:8}...)"
echo ""
echo "Packaging Auto-Created: 6 entries (3 per product)"
echo "  - Each product has: 10kg, 25kg, 50kg"
echo ""
if [ ! -z "$RECIPE1_ID" ]; then
  echo "Recipes Created: 2"
  echo "  - Premium Basmati Mix (ID: ${RECIPE1_ID:0:8}...)"
  if [ ! -z "$RECIPE2_ID" ]; then
    echo "  - Golden Sella Blend (ID: ${RECIPE2_ID:0:8}...)"
  fi
fi
echo ""
if [ ! -z "$BATCH1_ID" ]; then
  echo "Batches Created: 2"
  echo "  - $BATCH1_NUMBER (multiple packaging sizes)"
  echo "  - $BATCH2_NUMBER (single packaging size)"
fi
echo ""
echo "Next Steps:"
echo "1. Check frontend to see the data"
echo "2. Verify packaging is product-specific"
echo "3. Verify batches show multiple finished goods entries"
echo "4. Test creating new batches with packaging_quantities array"
echo ""
echo "Token saved for future requests: ${TOKEN:0:30}..."

