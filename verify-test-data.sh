#!/bin/bash

# Script to verify test data created
BASE_URL="http://localhost:3000/api/v1"

echo "=========================================="
echo "Verifying Test Data"
echo "=========================================="

# Login
TOKEN=$(curl -s -X POST "$BASE_URL/auth/loginUser" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Xk9#mP2@nQ7!vR4$wT8&aL5"
  }' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo -e "\n1. Products:"
curl -s "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('data', []):
    print(f\"  - {p['name']} (ID: {p['id'][:8]}...)\")
"

echo -e "\n2. Packaging (Product-specific):"
PRODUCT_ID=$(curl -s "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
products = [p for p in data.get('data', []) if 'Premium Basmati' in p.get('name', '')]
print(products[0]['id'] if products else '')
")

if [ ! -z "$PRODUCT_ID" ]; then
  curl -s "$BASE_URL/packaging?product_id=$PRODUCT_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('data', []):
    print(f\"  - {p['holding_capacity']}kg {p['packet_type']} (ID: {p['id'][:8]}...)\")
"
fi

echo -e "\n3. Recipes:"
curl -s "$BASE_URL/recipes" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('data', []):
    formula_count = len(r.get('formula', []))
    print(f\"  - {r['recipe_name']} (ID: {r['id'][:8]}...) - {formula_count} lots in formula\")
"

echo -e "\n4. Batches (Latest 3):"
curl -s "$BASE_URL/batches" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
batches = sorted(data.get('data', []), key=lambda x: x.get('created_at', ''), reverse=True)[:3]
for b in batches:
    print(f\"  - {b.get('batch_number')} | Quantity: {b.get('quantity')} kg | Status: {b.get('status')}\")
"

echo -e "\n5. Finished Goods (showing multiple entries per batch):"
BATCH_ID=$(curl -s "$BASE_URL/batches" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
batches = sorted(data.get('data', []), key=lambda x: x.get('created_at', ''), reverse=True)
print(batches[0]['id'] if batches else '')
")

if [ ! -z "$BATCH_ID" ]; then
  echo "   Batch ID: ${BATCH_ID:0:8}..."
  curl -s "$BASE_URL/inventory/finished-goods?batch_id=$BATCH_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
entries = data.get('data', [])
print(f\"   Found {len(entries)} finished goods entries for this batch:\")
for fg in entries:
    pkg = fg.get('packaging', {})
    print(f\"     - {pkg.get('holding_capacity')}kg: {fg.get('no_of_packets')} packets, {fg.get('total_weight')} kg\")
"
fi

echo -e "\n6. Packets Inventory:"
curl -s "$BASE_URL/inventory/packets" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for pi in data.get('data', []):
    pkg = pi.get('packaging', {})
    if pkg:
        print(f\"  - {pkg.get('holding_capacity')}kg {pkg.get('packet_type')}: {pi.get('available_quantity')} packets\")
"

echo -e "\n✅ Verification complete!"

