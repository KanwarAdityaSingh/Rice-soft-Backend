# Bank Account Verification API Guide

## Overview
This guide explains how to use the Surepass Bank Account Verification API integrated into the Rice-soft Backend system. The same Surepass account and API token used for PAN verification can be used for bank account verification.

## Configuration

### Environment Variables
Add these to your `.env` file:

```bash
# Surepass API Configuration (PAN & Bank Verification)
SUREPASS_PAN_API_URL=https://kyc-api.surepass.io/api/v1/pan/pan
SUREPASS_BANK_API_URL=https://kyc-api.surepass.io/api/v1/bank-verification
SUREPASS_API_TOKEN=your_surepass_api_token_here
```

**Note:** Use the same `SUREPASS_API_TOKEN` for both PAN and bank verification.

## API Endpoint

### Verify Bank Account

**Endpoint:** `GET /api/v1/vendors/verifyBankAccount`

**Authentication:** Required (JWT Bearer Token)

**Query Parameters:**
- `account_number` (required): Bank account number (9-18 digits)
- `ifsc_code` (required): IFSC code (11 characters, format: ABCD0123456)

**Example Request:**
```http
GET /api/v1/vendors/verifyBankAccount?account_number=1234567890&ifsc_code=SBIN0001234
Authorization: Bearer <your_jwt_token>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "account_exists": true,
    "account_holder_name": "JOHN DOE",
    "account_number": "1234567890",
    "ifsc_code": "SBIN0001234",
    "bank_name": "State Bank of India",
    "branch": "Main Branch"
  },
  "message": "Bank account verified successfully",
  "timestamp": "2025-12-22T11:30:00.000Z"
}
```

**Error Responses:**

**400 Bad Request - Missing Parameters:**
```json
{
  "success": false,
  "error": "Both account_number and ifsc_code are required",
  "timestamp": "2025-12-22T11:30:00.000Z"
}
```

**400 Bad Request - Invalid Format:**
```json
{
  "success": false,
  "error": "Invalid IFSC code format. Expected format: ABCD0123456",
  "timestamp": "2025-12-22T11:30:00.000Z"
}
```

**400 Bad Request - Account Not Found:**
```json
{
  "success": false,
  "error": "Bank account does not exist or is inactive",
  "timestamp": "2025-12-22T11:30:00.000Z"
}
```

**500 Internal Server Error - API Configuration:**
```json
{
  "success": false,
  "error": "Surepass API token not configured",
  "timestamp": "2025-12-22T11:30:00.000Z"
}
```

## Validation Rules

### Account Number
- **Length:** 9-18 digits
- **Format:** Numeric only
- **Example:** `1234567890`

### IFSC Code
- **Length:** Exactly 11 characters
- **Format:** `ABCD0123456` where:
  - First 4 characters: Bank code (alphabets, uppercase)
  - 5th character: Always `0`
  - Last 6 characters: Branch code (alphanumeric, uppercase)
- **Example:** `SBIN0001234`

## Usage Examples

### JavaScript/TypeScript (Frontend)
```typescript
async function verifyBankAccount(accountNumber: string, ifscCode: string) {
  try {
    const response = await fetch(
      `/api/v1/vendors/verifyBankAccount?account_number=${accountNumber}&ifsc_code=${ifscCode}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    
    if (data.success) {
      console.log('Account verified:', data.data.account_holder_name);
      return data.data;
    } else {
      console.error('Verification failed:', data.error);
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error verifying bank account:', error);
    throw error;
  }
}

// Usage
verifyBankAccount('1234567890', 'SBIN0001234')
  .then(result => {
    console.log('Verified account holder:', result.account_holder_name);
  })
  .catch(error => {
    console.error('Verification error:', error);
  });
```

### cURL
```bash
curl -X GET \
  'http://localhost:3000/api/v1/vendors/verifyBankAccount?account_number=1234567890&ifsc_code=SBIN0001234' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

## Integration Points

The bank verification can be used in the following scenarios:

### 1. Vendor Creation/Update
Verify bank details when adding or updating vendor information:
```typescript
// Before saving vendor
const bankVerification = await verifyBankAccount(
  vendor.bank_details.account_number,
  vendor.bank_details.ifsc_code
);

// Check if account holder name matches business name
if (bankVerification.account_holder_name !== vendor.business_name) {
  console.warn('Account holder name mismatch!');
}
```

### 2. Broker Bank Details
Verify broker bank account details for commission payments.

### 3. Transporter Bank Details
Verify transporter bank account details for transportation cost payments.

### 4. Payment Processing
Verify recipient bank details before processing payments.

## Security Considerations

1. **Account Number Masking:** Account numbers are automatically masked in logs (e.g., `1234****`)
2. **HTTPS Required:** Always use HTTPS in production to protect sensitive data
3. **Token Security:** Keep your Surepass API token secure and never expose it in frontend code
4. **Rate Limiting:** Be aware of Surepass API rate limits based on your plan
5. **Error Handling:** Never expose internal error details to end users

## API Credits

- Each bank verification call consumes API credits from your Surepass account
- Check your Surepass dashboard for credit balance and usage
- Consider caching verification results to reduce API calls

## Troubleshooting

### Common Issues

**Issue:** "Surepass API token not configured"
- **Solution:** Ensure `SUREPASS_API_TOKEN` is set in your `.env` file

**Issue:** "Invalid IFSC code format"
- **Solution:** Verify the IFSC code follows the format: 4 letters + 0 + 6 alphanumeric characters

**Issue:** "Bank account does not exist or is inactive"
- **Solution:** Double-check the account number and IFSC code. The account may be closed or inactive.

**Issue:** API returns 401 Unauthorized
- **Solution:** Check if your Surepass API token is valid and has sufficient credits

## Support

For Surepass API-specific issues:
- Visit: https://surepass.io
- Contact: Surepass support team
- Documentation: https://surepass.io/docs

For application integration issues:
- Check application logs in `./logs/combined.log`
- Review error messages in the API response
- Verify environment configuration

## Changelog

### Version 1.0.0 (2025-12-22)
- Initial implementation of bank account verification
- Integration with Surepass API
- Added validation for account number and IFSC code
- Added security features (account number masking)
- Added comprehensive error handling


