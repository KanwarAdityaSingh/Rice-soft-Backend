#!/bin/bash

# Script to create realistic rice business data
BASE_URL="http://localhost:3000/api/v1"

echo "=========================================="
echo "Creating Realistic Rice Business Data"
echo "=========================================="

# Login
TOKEN=$(curl -s -X POST "$BASE_URL/auth/loginUser" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Xk9#mP2@nQ7!vR4$wT8&aL5"
  }' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  exit 1
fi

echo "✅ Logged in"

# Step 1: Create realistic products
echo -e "\n1. Creating Products..."

PRODUCT1_RESPONSE=$(curl -s -X POST "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "India Gate Classic Basmati",
    "description": "Premium long grain basmati rice, aged for superior aroma and taste",
    "brand": "Tamara",
    "packet_type": "PP Bag"
  }')

PRODUCT1_ID=$(echo $PRODUCT1_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', '') if data.get('success') else '')")
echo "✅ Created: India Gate Classic Basmati"

PRODUCT2_RESPONSE=$(curl -s -X POST "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kohinoor Super Basmati",
    "description": "Extra long grain basmati rice with exceptional cooking quality",
    "brand": "Hariom",
    "packet_type": "PP Bag"
  }')

PRODUCT2_ID=$(echo $PRODUCT2_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', '') if data.get('success') else '')")
echo "✅ Created: Kohinoor Super Basmati"

PRODUCT3_RESPONSE=$(curl -s -X POST "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fortune Sella Basmati",
    "description": "Parboiled basmati rice, ideal for biryani and pulao",
    "brand": "Tamara",
    "packet_type": "PP Bag"
  }')

PRODUCT3_ID=$(echo $PRODUCT3_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', '') if data.get('success') else '')")
echo "✅ Created: Fortune Sella Basmati"

PRODUCT4_RESPONSE=$(curl -s -X POST "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tilda Pure Basmati",
    "description": "Premium basmati rice, known for its delicate fragrance and long grains",
    "brand": "Hariom",
    "packet_type": "PP Bag"
  }')

PRODUCT4_ID=$(echo $PRODUCT4_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', '') if data.get('success') else '')")
echo "✅ Created: Tilda Pure Basmati"

# Step 2: Get existing lots for recipes
echo -e "\n2. Fetching lots for recipes..."
LOTS_RESPONSE=$(curl -s "$BASE_URL/inventory/lots" \
  -H "Authorization: Bearer $TOKEN")

LOT_IDS=$(echo "$LOTS_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); lots = data.get('data', []); [print(l['lot_id']) for l in lots[:5]]")

LOT_ARRAY=($LOTS_RESPONSE)
LOT1_ID=$(echo "$LOTS_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); lots = data.get('data', []); print(lots[0]['lot_id'] if lots else '')")
LOT2_ID=$(echo "$LOTS_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); lots = data.get('data', []); print(lots[1]['lot_id'] if lots and len(lots) > 1 else '')")
LOT3_ID=$(echo "$LOTS_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); lots = data.get('data', []); print(lots[2]['lot_id'] if lots and len(lots) > 2 else '')")
LOT4_ID=$(echo "$LOTS_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); lots = data.get('data', []); print(lots[3]['lot_id'] if lots and len(lots) > 3 else '')")

if [ -z "$LOT1_ID" ]; then
  echo "⚠️  No lots found. Creating recipes with empty formulas..."
  SKIP_RECIPES=true
else
  echo "✅ Found lots for recipes"
fi

# Step 3: Create realistic recipes
if [ -z "$SKIP_RECIPES" ] && [ ! -z "$LOT1_ID" ]; then
  echo -e "\n3. Creating Recipes..."
  
  RECIPE1_RESPONSE=$(curl -s -X POST "$BASE_URL/recipes" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"recipe_name\": \"Premium Basmati Blend 60-40\",
      \"formula\": [
        {
          \"lot_id\": \"$LOT1_ID\",
          \"percentage\": 60.00
        },
        {
          \"lot_id\": \"$LOT2_ID\",
          \"percentage\": 40.00
        }
      ]
    }")
  
  RECIPE1_ID=$(echo $RECIPE1_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', '') if data.get('success') else '')")
  echo "✅ Created: Premium Basmati Blend 60-40"
  
  if [ ! -z "$LOT3_ID" ]; then
    RECIPE2_RESPONSE=$(curl -s -X POST "$BASE_URL/recipes" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"recipe_name\": \"Classic Basmati Mix 50-30-20\",
        \"formula\": [
          {
            \"lot_id\": \"$LOT1_ID\",
            \"percentage\": 50.00
          },
          {
            \"lot_id\": \"$LOT2_ID\",
            \"percentage\": 30.00
          },
          {
            \"lot_id\": \"$LOT3_ID\",
            \"percentage\": 20.00
          }
        ]
      }")
    
    RECIPE2_ID=$(echo $RECIPE2_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', '') if data.get('success') else '')")
    echo "✅ Created: Classic Basmati Mix 50-30-20"
  fi
  
  if [ ! -z "$LOT4_ID" ]; then
    RECIPE3_RESPONSE=$(curl -s -X POST "$BASE_URL/recipes" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"recipe_name\": \"Super Basmati Blend 70-30\",
        \"formula\": [
          {
            \"lot_id\": \"$LOT1_ID\",
            \"percentage\": 70.00
          },
          {
            \"lot_id\": \"$LOT2_ID\",
            \"percentage\": 30.00
          }
        ]
      }")
    
    RECIPE3_ID=$(echo $RECIPE3_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', '') if data.get('success') else '')")
    echo "✅ Created: Super Basmati Blend 70-30"
  fi
fi

# Step 4: Link recipes to products
if [ ! -z "$RECIPE1_ID" ]; then
  echo -e "\n4. Linking Recipes to Products..."
  
  curl -s -X POST "$BASE_URL/products/$PRODUCT1_ID/recipes" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"recipe_id\": \"$RECIPE1_ID\"}" > /dev/null
  echo "✅ Linked recipe to India Gate Classic Basmati"
  
  if [ ! -z "$RECIPE2_ID" ]; then
    curl -s -X POST "$BASE_URL/products/$PRODUCT2_ID/recipes" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"recipe_id\": \"$RECIPE2_ID\"}" > /dev/null
    echo "✅ Linked recipe to Kohinoor Super Basmati"
  fi
  
  if [ ! -z "$RECIPE3_ID" ]; then
    curl -s -X POST "$BASE_URL/products/$PRODUCT3_ID/recipes" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"recipe_id\": \"$RECIPE3_ID\"}" > /dev/null
    echo "✅ Linked recipe to Fortune Sella Basmati"
  fi
fi

# Step 5: Add packets inventory
echo -e "\n5. Adding Packets Inventory..."

# Get packaging for Product 1
PACKAGING_DATA=$(curl -s "$BASE_URL/packaging?product_id=$PRODUCT1_ID" \
  -H "Authorization: Bearer $TOKEN")

P10_1=$(echo "$PACKAGING_DATA" | python3 -c "import sys, json; data = json.load(sys.stdin); pkg = [p for p in data.get('data', []) if float(p['holding_capacity']) == 10]; print(pkg[0]['id'] if pkg else '')")
P25_1=$(echo "$PACKAGING_DATA" | python3 -c "import sys, json; data = json.load(sys.stdin); pkg = [p for p in data.get('data', []) if float(p['holding_capacity']) == 25]; print(pkg[0]['id'] if pkg else '')")
P50_1=$(echo "$PACKAGING_DATA" | python3 -c "import sys, json; data = json.load(sys.stdin); pkg = [p for p in data.get('data', []) if float(p['holding_capacity']) == 50]; print(pkg[0]['id'] if pkg else '')")

# Add realistic inventory (more 25kg and 50kg, less 10kg)
curl -s -X POST "http://localhost:3000/api/v1/packaging/$P10_1/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"packaging_id\": \"$P10_1\", \"available_quantity\": 500}" > /dev/null

curl -s -X POST "http://localhost:3000/api/v1/packaging/$P25_1/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"packaging_id\": \"$P25_1\", \"available_quantity\": 1000}" > /dev/null

curl -s -X POST "http://localhost:3000/api/v1/packaging/$P50_1/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"packaging_id\": \"$P50_1\", \"available_quantity\": 800}" > /dev/null

echo "✅ Added inventory for India Gate Classic Basmati"

# Get packaging for Product 2
PACKAGING_DATA2=$(curl -s "$BASE_URL/packaging?product_id=$PRODUCT2_ID" \
  -H "Authorization: Bearer $TOKEN")

P10_2=$(echo "$PACKAGING_DATA2" | python3 -c "import sys, json; data = json.load(sys.stdin); pkg = [p for p in data.get('data', []) if float(p['holding_capacity']) == 10]; print(pkg[0]['id'] if pkg else '')")
P25_2=$(echo "$PACKAGING_DATA2" | python3 -c "import sys, json; data = json.load(sys.stdin); pkg = [p for p in data.get('data', []) if float(p['holding_capacity']) == 25]; print(pkg[0]['id'] if pkg else '')")
P50_2=$(echo "$PACKAGING_DATA2" | python3 -c "import sys, json; data = json.load(sys.stdin); pkg = [p for p in data.get('data', []) if float(p['holding_capacity']) == 50]; print(pkg[0]['id'] if pkg else '')")

curl -s -X POST "http://localhost:3000/api/v1/packaging/$P10_2/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"packaging_id\": \"$P10_2\", \"available_quantity\": 300}" > /dev/null

curl -s -X POST "http://localhost:3000/api/v1/packaging/$P25_2/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"packaging_id\": \"$P25_2\", \"available_quantity\": 750}" > /dev/null

curl -s -X POST "http://localhost:3000/api/v1/packaging/$P50_2/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"packaging_id\": \"$P50_2\", \"available_quantity\": 600}" > /dev/null

echo "✅ Added inventory for Kohinoor Super Basmati"

# Step 6: Create realistic batches
if [ ! -z "$RECIPE1_ID" ] && [ ! -z "$PRODUCT1_ID" ]; then
  echo -e "\n6. Creating Batches..."
  
  # Batch 1: Large production run (mostly 25kg and 50kg)
  BATCH1_RESPONSE=$(curl -s -X POST "$BASE_URL/batches" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"product_id\": \"$PRODUCT1_ID\",
      \"recipe_id\": \"$RECIPE1_ID\",
      \"packaging_quantities\": [
        {
          \"weight\": 10,
          \"quantity\": 200
        },
        {
          \"weight\": 25,
          \"quantity\": 1500
        },
        {
          \"weight\": 50,
          \"quantity\": 2000
        }
      ],
      \"status\": \"completed\"
    }")
  
  BATCH1_NUMBER=$(echo $BATCH1_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('batch_number', '') if data.get('success') else '')")
  echo "✅ Created batch: $BATCH1_NUMBER (3700 kg total)"
  
  # Batch 2: Medium production (mostly 25kg)
  if [ ! -z "$RECIPE2_ID" ] && [ ! -z "$PRODUCT2_ID" ]; then
    BATCH2_RESPONSE=$(curl -s -X POST "$BASE_URL/batches" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"product_id\": \"$PRODUCT2_ID\",
        \"recipe_id\": \"$RECIPE2_ID\",
        \"packaging_quantities\": [
          {
            \"weight\": 25,
            \"quantity\": 1000
          },
          {
            \"weight\": 50,
            \"quantity\": 500
          }
        ],
        \"status\": \"completed\"
      }")
    
    BATCH2_NUMBER=$(echo $BATCH2_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('batch_number', '') if data.get('success') else '')")
    echo "✅ Created batch: $BATCH2_NUMBER (1500 kg total)"
  fi
  
  # Batch 3: Small retail batch (mostly 10kg)
  BATCH3_RESPONSE=$(curl -s -X POST "$BASE_URL/batches" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"product_id\": \"$PRODUCT1_ID\",
      \"recipe_id\": \"$RECIPE1_ID\",
      \"packaging_quantities\": [
        {
          \"weight\": 10,
          \"quantity\": 500
        },
        {
          \"weight\": 25,
          \"quantity\": 250
        }
      ],
      \"status\": \"completed\"
    }")
  
  BATCH3_NUMBER=$(echo $BATCH3_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('batch_number', '') if data.get('success') else '')")
  echo "✅ Created batch: $BATCH3_NUMBER (750 kg total)"
fi

echo -e "\n=========================================="
echo "✅ Realistic Data Creation Complete!"
echo "=========================================="
echo "Products: 4 premium rice brands"
echo "Recipes: 3 realistic blends"
echo "Batches: 3 production runs with realistic quantities"
echo ""
echo "Data is ready for frontend review!"

