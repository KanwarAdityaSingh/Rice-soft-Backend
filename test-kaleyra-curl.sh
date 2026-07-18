#!/bin/bash

# Test Kaleyra API directly
# Usage: ./test-kaleyra-curl.sh <phone_number> <otp>
# Example: ./test-kaleyra-curl.sh 8708190168 123456

PHONE=${1:-8708190168}
OTP=${2:-123456}

# Normalize phone (add 91 prefix if 10 digits)
if [[ ${#PHONE} -eq 10 ]]; then
  PHONE="91${PHONE}"
fi

echo "Testing Kaleyra API..."
echo "Phone: ${PHONE}"
echo "OTP: ${OTP}"
echo ""

curl -X POST "https://api.kaleyra.io/v1/HXAP1679900797IN/messages" \
  -H "api-key: A7817538772624b312d23974ca14997bb" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "source=API" \
  --data-urlencode "to=${PHONE}" \
  --data-urlencode "sender=SNTREQ" \
  --data-urlencode $'body=AAAPL Rice Rewards\nYour verification code is '"${OTP}"$'. Enter it to access your rewards account. This code expires in 10 minutes. Never share this code with anyone.' \
  --data-urlencode "template_id=1077290810001122488" \
  --data-urlencode "type=OTP" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

