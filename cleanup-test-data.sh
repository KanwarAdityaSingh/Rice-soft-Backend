#!/bin/bash

# Script to delete all test data including Legacy Product
BASE_URL="http://localhost:3000/api/v1"

echo "=========================================="
echo "Cleaning Up Test Data"
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

# Delete all batches
echo -e "\n1. Deleting all batches..."
BATCHES=$(curl -s "$BASE_URL/batches" -H "Authorization: Bearer $TOKEN")
BATCH_IDS=$(echo "$BATCHES" | python3 -c "import sys, json; data = json.load(sys.stdin); [print(b['id']) for b in data.get('data', [])]")

for BATCH_ID in $BATCH_IDS; do
  curl -s -X DELETE "$BASE_URL/batches/$BATCH_ID" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "  Deleted batch: ${BATCH_ID:0:8}..."
done
echo "✅ Batches deleted"

# Delete all recipes
echo -e "\n2. Deleting all recipes..."
RECIPES=$(curl -s "$BASE_URL/recipes" -H "Authorization: Bearer $TOKEN")
RECIPE_IDS=$(echo "$RECIPES" | python3 -c "import sys, json; data = json.load(sys.stdin); [print(r['id']) for r in data.get('data', [])]")

for RECIPE_ID in $RECIPE_IDS; do
  curl -s -X DELETE "$BASE_URL/recipes/$RECIPE_ID" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "  Deleted recipe: ${RECIPE_ID:0:8}..."
done
echo "✅ Recipes deleted"

# Delete all products (including Legacy Product)
echo -e "\n3. Deleting all products (including Legacy Product)..."
PRODUCTS=$(curl -s "$BASE_URL/products" -H "Authorization: Bearer $TOKEN")
PRODUCT_IDS=$(echo "$PRODUCTS" | python3 -c "import sys, json; data = json.load(sys.stdin); [print(p['id']) for p in data.get('data', [])]")

for PRODUCT_ID in $PRODUCT_IDS; do
  PRODUCT_NAME=$(echo "$PRODUCTS" | python3 -c "import sys, json; data = json.load(sys.stdin); p = [p for p in data.get('data', []) if p['id'] == '$PRODUCT_ID']; print(p[0]['name'] if p else '')")
  curl -s -X DELETE "$BASE_URL/products/$PRODUCT_ID" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "  Deleted product: $PRODUCT_NAME (${PRODUCT_ID:0:8}...)"
done
echo "✅ Products deleted (packaging auto-deleted via cascade)"

echo -e "\n=========================================="
echo "✅ Cleanup Complete!"
echo "=========================================="

