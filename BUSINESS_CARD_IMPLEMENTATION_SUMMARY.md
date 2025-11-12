# Business Card Upload Feature - Implementation Summary

## Overview
Successfully implemented business card upload functionality for vendors created through lead conversion. Business cards are uploaded to AWS S3 and the URL is stored in the vendor record.

---

## Changes Made

### 1. Database Migration
**File:** `src/database/migrations/022_add_business_card_to_vendors.sql`
- Added `business_card_url` column to the `vendors` table (VARCHAR(500))
- Added index for efficient queries
- Added column documentation

**Action Required:** Run migration with `npm run migrate`

---

### 2. Vendor Model Updates
**File:** `src/models/vendor.model.ts`
- Added `business_card_url: string | null` to `Vendor` interface
- Added `business_card_url?: string` to `CreateVendorDTO` interface
- Added `business_card_url?: string` to `UpdateVendorDTO` interface
- Added `business_card_url: string | null` to `VendorResponse` interface

---

### 3. Vendor DAO Updates
**File:** `src/dao/vendor.dao.ts`
- Updated all SELECT queries to include `business_card_url`
- Updated INSERT query in `create()` method to handle `business_card_url`
- Updated UPDATE query in `update()` method to handle `business_card_url`
- All vendor queries now return the business card URL

---

### 4. S3 Upload Utility
**File:** `src/utils/s3-upload.ts` (NEW)

**Functions:**
- `uploadToS3()` - Upload file to S3, returns URL, key, and bucket
- `deleteFromS3()` - Delete file from S3
- `extractKeyFromUrl()` - Extract S3 key from URL
- `validateFileSize()` - Validate file size before upload (default 5MB)
- `validateFileType()` - Validate file MIME type

**Features:**
- Automatic unique filename generation (UUID)
- Public read access for uploaded files
- Content-Type detection based on file extension
- Comprehensive error handling and logging

---

### 5. File Upload Middleware
**File:** `src/middleware/upload.middleware.ts` (NEW)

**Exports:**
- `businessCardUpload` - Configured multer instance for business cards
  - Memory storage
  - 5MB file size limit
  - Image-only file filter (JPEG, PNG, GIF)
- `documentUpload` - Generic file upload (10MB limit)

---

### 6. Lead Service Updates
**File:** `src/services/lead.service.ts`
- Updated `convertLeadToVendor()` method signature to accept optional `businessCardUrl` parameter
- Added `business_card_url` to vendor creation data

---

### 7. Lead Controller Updates
**File:** `src/controllers/lead.controller.ts`
- Added import for S3 upload utilities
- Updated `convertLeadToVendor()` method to:
  - Handle `req.file` from multer
  - Validate uploaded file (size and type)
  - Upload file to S3 if provided
  - Pass S3 URL to vendor creation
  - Provide meaningful error messages for upload failures

---

### 8. Lead Routes Updates
**File:** `src/routes/lead.routes.ts`
- Added import for `businessCardUpload` middleware
- Updated `/convertLeadToVendor` route to use `businessCardUpload.single('business_card')` middleware
- Route now accepts multipart/form-data with optional business card file

---

### 9. Vendor Controller Updates
**File:** `src/controllers/vendor.controller.ts`
- Added `business_card_url` to all vendor response objects in:
  - `getAll()` method
  - `getById()` method
  - `create()` method
  - `update()` method
  - `createFromGST()` method
  - `createFromPAN()` method
  - `checkVendorExists()` method

---

### 10. Configuration Updates
**File:** `src/config/app.config.ts`
- Added AWS configuration section with:
  - `region` - AWS region (default: ap-south-1)
  - `accessKeyId` - AWS access key ID
  - `secretAccessKey` - AWS secret access key
  - `s3.bucketName` - S3 bucket name (default: rice-soft-uploads)
  - `s3.businessCardsFolder` - Folder for business cards (default: business-cards)

**File:** `env.template`
- Added AWS S3 configuration section with placeholders

---

### 11. Package Dependencies
**Installed via npm:**
- `@aws-sdk/client-s3` - AWS SDK v3 for S3 operations
- `multer` - Middleware for handling multipart/form-data
- `@types/multer` - TypeScript types for multer

---

### 12. Documentation
**Files Created:**
- `BUSINESS_CARD_UPLOAD_GUIDE.md` - Comprehensive guide with:
  - Architecture overview
  - Database changes
  - Environment configuration
  - AWS S3 setup instructions
  - API usage examples (cURL, JavaScript, React)
  - Frontend implementation guide
  - Security considerations
  - Troubleshooting guide
  - Future enhancement suggestions

- `BUSINESS_CARD_IMPLEMENTATION_SUMMARY.md` (this file) - Quick reference of all changes

---

## API Endpoint Changes

### Updated Endpoint: Convert Lead to Vendor
**Endpoint:** `POST /api/v1/leads/convertLeadToVendor`

**Before:**
- Content-Type: `application/json`
- Body: JSON with lead_id, broker_id, etc.

**After:**
- Content-Type: `multipart/form-data`
- Body: Form data with all previous fields PLUS optional `business_card` file
- File Requirements:
  - Field name: `business_card`
  - Max size: 5MB
  - Allowed types: JPEG, PNG, GIF

**Response Changes:**
- Vendor object now includes `business_card_url` field with S3 URL

---

## Testing Checklist

### ✅ Before Testing
- [ ] Run database migration: `npm run migrate`
- [ ] Configure AWS credentials in `.env` file
- [ ] Create S3 bucket and configure permissions
- [ ] Install dependencies: `npm install`
- [ ] Build project: `npm run build`
- [ ] Start server: `npm start`

### ✅ Manual Testing
- [ ] Convert lead without business card (should work as before)
- [ ] Convert lead with business card (should upload to S3)
- [ ] Verify business card URL in vendor response
- [ ] Access business card URL directly (should be accessible)
- [ ] Test with oversized file (should reject with error)
- [ ] Test with non-image file (should reject with error)
- [ ] Get vendor by ID (should include business_card_url)
- [ ] Get all vendors (should include business_card_url for all)

### ✅ Error Scenarios
- [ ] Invalid AWS credentials (should fail gracefully)
- [ ] S3 bucket doesn't exist (should fail gracefully)
- [ ] Network error during upload (should fail gracefully)
- [ ] Invalid file type (should return 400 error)
- [ ] File too large (should return 400 error)

---

## Environment Variables Required

```env
# AWS S3 Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_S3_BUCKET_NAME=rice-soft-uploads
AWS_S3_BUSINESS_CARDS_FOLDER=business-cards
```

---

## AWS S3 Setup Steps

1. **Create S3 Bucket:**
   ```
   Bucket name: rice-soft-uploads
   Region: ap-south-1
   ```

2. **Set Bucket Policy (Public Read):**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "PublicReadGetObject",
       "Effect": "Allow",
       "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::rice-soft-uploads/*"
     }]
   }
   ```

3. **Create IAM User:**
   - User name: rice-soft-app
   - Access type: Programmatic access
   - Permissions: AmazonS3FullAccess
   - Save Access Key ID and Secret Access Key

4. **Optional: Configure CORS:**
   ```json
   [{
     "AllowedHeaders": ["*"],
     "AllowedMethods": ["GET", "PUT", "POST"],
     "AllowedOrigins": ["*"],
     "ExposeHeaders": []
   }]
   ```

---

## Frontend Integration

### HTML Form Example
```html
<form action="/api/v1/leads/convertLeadToVendor" method="POST" enctype="multipart/form-data">
  <input type="text" name="lead_id" required>
  <input type="file" name="business_card" accept="image/*">
  <button type="submit">Convert to Vendor</button>
</form>
```

### React/JavaScript Example
```javascript
const formData = new FormData();
formData.append('lead_id', leadId);
formData.append('business_card', file);

await fetch('/api/v1/leads/convertLeadToVendor', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

See `BUSINESS_CARD_UPLOAD_GUIDE.md` for complete examples.

---

## Security Features

1. **File Validation:**
   - Size limit: 5MB
   - Type restriction: Images only (JPEG, PNG, GIF)
   - MIME type verification

2. **Authentication:**
   - All endpoints require valid JWT token
   - Only authenticated users can upload files

3. **S3 Security:**
   - Files stored with unique UUID filenames
   - Public read access for file URLs
   - Write access only via backend IAM credentials

4. **Error Handling:**
   - Graceful failure on upload errors
   - No sensitive information in error messages
   - Detailed logging for debugging

---

## File Structure Summary

```
src/
├── config/
│   └── app.config.ts (updated)
├── controllers/
│   ├── lead.controller.ts (updated)
│   └── vendor.controller.ts (updated)
├── dao/
│   └── vendor.dao.ts (updated)
├── database/
│   └── migrations/
│       └── 022_add_business_card_to_vendors.sql (new)
├── middleware/
│   └── upload.middleware.ts (new)
├── models/
│   └── vendor.model.ts (updated)
├── routes/
│   └── lead.routes.ts (updated)
├── services/
│   └── lead.service.ts (updated)
└── utils/
    └── s3-upload.ts (new)

Documentation/
├── BUSINESS_CARD_UPLOAD_GUIDE.md (new)
└── BUSINESS_CARD_IMPLEMENTATION_SUMMARY.md (new)
```

---

## Next Steps

1. **Deploy:**
   - Update `.env` on production server with AWS credentials
   - Run database migration on production
   - Deploy updated code

2. **Frontend:**
   - Update lead conversion form to include file upload
   - Add image preview before upload
   - Display business card in vendor details view

3. **Monitoring:**
   - Monitor S3 storage usage
   - Track upload success/failure rates
   - Set up CloudWatch alarms for S3 errors

4. **Enhancements (Future):**
   - Image compression before upload
   - Multiple business cards per vendor
   - OCR for automatic data extraction
   - CDN integration (CloudFront)

---

## Success Metrics

✅ All TODOs completed:
1. ✅ Database migration created
2. ✅ Vendor model updated
3. ✅ AWS SDK and multer installed
4. ✅ S3 upload utility created
5. ✅ Vendor DAO updated
6. ✅ Lead service updated
7. ✅ Lead controller updated
8. ✅ Configuration added
9. ✅ Documentation completed
10. ✅ Build successful with no errors

---

## Support & Troubleshooting

For issues or questions:
1. Check `BUSINESS_CARD_UPLOAD_GUIDE.md` troubleshooting section
2. Review server logs for detailed error messages
3. Verify AWS credentials and S3 bucket configuration
4. Ensure S3 bucket policy allows public read access

---

**Implementation Date:** November 11, 2025
**Status:** ✅ Complete and Ready for Testing

