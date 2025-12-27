#!/bin/bash

# Script to add packaging to products that don't have it
BASE_URL="http://localhost:3000/api/v1"

echo "=========================================="
echo "Adding Packaging to Products"
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

# Get all products
PRODUCTS_RESPONSE=$(curl -s "$BASE_URL/products" -H "Authorization: Bearer $TOKEN")

# Find products without packaging and add it
echo "$PRODUCTS_RESPONSE" | python3 << 'PYTHON_SCRIPT'
import sys
import json
import subprocess
import os

token = os.environ.get('TOKEN', '')
base_url = os.environ.get('BASE_URL', 'http://localhost:3000/api/v1')

data = json.load(sys.stdin)
products = data.get('data', [])

products_needing_packaging = []

for product in products:
    product_id = product['id']
    product_name = product['name']
    
    # Check if product has packaging
    result = subprocess.run(
        ['curl', '-s', f'{base_url}/packaging?product_id={product_id}', 
         '-H', f'Authorization: Bearer {token}'],
        capture_output=True,
        text=True
    )
    
    packaging_data = json.loads(result.stdout)
    packaging_count = len(packaging_data.get('data', []))
    
    if packaging_count == 0:
        products_needing_packaging.append({
            'id': product_id,
            'name': product_name,
            'packet_type': product.get('packet_type', 'PP Bag') or 'PP Bag'
        })

print(f"\nFound {len(products_needing_packaging)} products without packaging:")
for p in products_needing_packaging:
    print(f"  - {p['name']} (ID: {p['id'][:8]}...)")

# Add packaging to each product
for product in products_needing_packaging:
    print(f"\nAdding packaging to: {product['name']}")
    
    # Create 10kg, 25kg, 50kg packaging
    for weight in [10, 25, 50]:
        packaging_data = {
            "product_id": product['id'],
            "holding_capacity": weight,
            "packet_type": product['packet_type']
        }
        
        result = subprocess.run(
            ['curl', '-s', '-X', 'POST', f'{base_url}/packaging',
             '-H', f'Authorization: Bearer {token}',
             '-H', 'Content-Type: application/json',
             '-d', json.dumps(packaging_data)],
            capture_output=True,
            text=True
        )
        
        response = json.loads(result.stdout)
        if response.get('success'):
            print(f"  ✅ Created {weight}kg packaging")
        else:
            print(f"  ❌ Failed to create {weight}kg: {response.get('error', 'Unknown error')}")

PYTHON_SCRIPT

echo -e "\n=========================================="
echo "✅ Packaging addition complete!"
echo "=========================================="

