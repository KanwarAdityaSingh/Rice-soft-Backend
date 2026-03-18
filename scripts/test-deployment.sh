#!/bin/bash
# Test deployment: hit production API (health + sales module). No SSH required.
# Run after deploy.sh to verify API and migrations (sales routes exist after migrations).
set -euo pipefail

BASE_URL="${API_BASE_URL:-https://api.adhraamrit.com/api/v1}"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "Testing deployment at $BASE_URL"
echo ""

# 1. Health
echo -n "GET /health ... "
CODE=$(curl -sk -o /tmp/health.json -w "%{http_code}" "$BASE_URL/health" || echo "000")
if [ "$CODE" = "200" ]; then
  echo -e "${GREEN}${CODE} OK${NC}"
else
  echo -e "${RED}${CODE} FAIL${NC}"
  exit 1
fi

# 2. Sales sauda list (expect 401 without auth or 200 with auth - both mean route exists)
echo -n "GET /sales-saudas (route exists) ... "
CODE=$(curl -sk -o /tmp/saudas.json -w "%{http_code}" "$BASE_URL/sales-saudas" || echo "000")
if [ "$CODE" = "200" ] || [ "$CODE" = "401" ]; then
  echo -e "${GREEN}${CODE} (route present)${NC}"
elif [ "$CODE" = "404" ]; then
  echo -e "${RED}404 - Sales module not deployed. Run: AWS_KEY_PATH=/path/to/key ./deploy.sh${NC}"
  exit 1
else
  echo -e "${RED}${CODE}${NC}"
  exit 1
fi

# 3. Invoice dispatches route
echo -n "GET /invoice-dispatches (route exists) ... "
CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE_URL/invoice-dispatches" || echo "000")
if [ "$CODE" = "200" ] || [ "$CODE" = "401" ]; then
  echo -e "${GREEN}${CODE} (route present)${NC}"
else
  echo -e "${RED}${CODE}${NC}"
  exit 1
fi

# 4. Inventory ledger route (created by migration 094)
echo -n "GET /inventory-ledger (route exists) ... "
CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE_URL/inventory-ledger" || echo "000")
if [ "$CODE" = "200" ] || [ "$CODE" = "401" ]; then
  echo -e "${GREEN}${CODE} (route present)${NC}"
else
  echo -e "${RED}${CODE}${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}Deployment test passed. API and sales module routes are live.${NC}"
