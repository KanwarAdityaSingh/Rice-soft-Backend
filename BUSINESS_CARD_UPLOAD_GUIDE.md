# Business Card Upload Feature - Implementation Guide

## Overview

This guide explains the business card upload feature implemented for vendors created through lead conversion. When converting a lead to a vendor, users can now upload a business card image that will be stored in AWS S3 and linked to the vendor record.

## Architecture

### Components

1. **Database Schema** - Added `business_card_url` column to vendors table
2. **S3 Integration** - AWS SDK for uploading files to S3
3. **File Upload Middleware** - Multer for handling multipart/form-data
4. **API Endpoint** - Updated `/convertLeadToVendor` endpoint to accept file uploads
5. **Models & DTOs** - Updated vendor interfaces to include business card URL

## Database Changes

### Migration: `022_add_business_card_to_vendors.sql`

```sql
-- Add business_card_url column to vendors table
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS business_card_url VARCHAR(500);

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_vendors_business_card ON vendors(business_card_url) 
WHERE business_card_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN vendors.business_card_url IS 'S3 URL of the uploaded business card image';
```

**To run the migration:**
```bash
npm run migrate
```

## Environment Configuration

### Add to `.env` file:

```env
# AWS S3 Configuration (For file uploads)
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_S3_BUCKET_NAME=rice-soft-uploads
AWS_S3_BUSINESS_CARDS_FOLDER=business-cards
```

### AWS S3 Setup Requirements:

1. **Create an S3 Bucket:**
   - Name: `rice-soft-uploads` (or your custom name)
   - Region: `ap-south-1` (or your preferred region)
   - Set appropriate permissions

2. **Configure Bucket Policy:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::rice-soft-uploads/*"
       }
     ]
   }
   ```

3. **Create IAM User with S3 Permissions:**
   - Create IAM user with programmatic access
   - Attach policy: `AmazonS3FullAccess` or custom policy
   - Save Access Key ID and Secret Access Key

4. **Configure CORS (if needed for direct browser uploads):**
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST"],
       "AllowedOrigins": ["*"],
       "ExposeHeaders": []
     }
   ]
   ```

## API Usage

### Endpoint: Convert Lead to Vendor with Business Card

**URL:** `POST /api/v1/leads/convertLeadToVendor`

**Authentication:** Required (Bearer token)

**Content-Type:** `multipart/form-data`

**Request Body Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| lead_id | string (UUID) | Yes | ID of the lead to convert |
| broker_id | string (UUID) | No | ID of the broker involved |
| conversion_value | number | No | Monetary value of the conversion |
| commission_rate | number | No | Commission rate percentage |
| notes | string | No | Additional notes |
| business_card | file | No | Business card image (JPEG, PNG, GIF) |

**File Requirements:**
- **Format:** JPEG, PNG, or GIF
- **Max Size:** 5MB
- **Field Name:** `business_card`

### Example Request using cURL:

```bash
curl -X POST "http://localhost:3000/api/v1/leads/convertLeadToVendor" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "lead_id=550e8400-e29b-41d4-a716-446655440000" \
  -F "broker_id=660e8400-e29b-41d4-a716-446655440001" \
  -F "conversion_value=100000" \
  -F "commission_rate=2.5" \
  -F "notes=Converted from marketing campaign" \
  -F "business_card=@/path/to/business-card.jpg"
```

### Example Request using JavaScript (Fetch API):

```javascript
const formData = new FormData();
formData.append('lead_id', '550e8400-e29b-41d4-a716-446655440000');
formData.append('broker_id', '660e8400-e29b-41d4-a716-446655440001');
formData.append('conversion_value', 100000);
formData.append('commission_rate', 2.5);
formData.append('notes', 'Converted from marketing campaign');
formData.append('business_card', businessCardFile); // File from input

const response = await fetch('http://localhost:3000/api/v1/leads/convertLeadToVendor', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  },
  body: formData
});

const result = await response.json();
console.log(result);
```

### Example Request using Axios:

```javascript
import axios from 'axios';

const formData = new FormData();
formData.append('lead_id', '550e8400-e29b-41d4-a716-446655440000');
formData.append('broker_id', '660e8400-e29b-41d4-a716-446655440001');
formData.append('conversion_value', 100000);
formData.append('commission_rate', 2.5);
formData.append('notes', 'Converted from marketing campaign');
formData.append('business_card', businessCardFile);

const response = await axios.post(
  'http://localhost:3000/api/v1/leads/convertLeadToVendor',
  formData,
  {
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'multipart/form-data'
    }
  }
);

console.log(response.data);
```

### Success Response:

```json
{
  "status": "success",
  "statusCode": 201,
  "message": "Lead converted to vendor successfully",
  "data": {
    "conversion": {
      "id": "abc123...",
      "lead_id": "550e8400-e29b-41d4-a716-446655440000",
      "vendor_id": "770e8400-e29b-41d4-a716-446655440002",
      "broker_id": "660e8400-e29b-41d4-a716-446655440001",
      "conversion_date": "2025-11-11T10:30:00Z",
      "conversion_value": 100000,
      "commission_rate": 2.5,
      "commission_amount": 2500,
      "notes": "Converted from marketing campaign"
    },
    "vendor": {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "business_name": "ABC Traders",
      "contact_person": "John Doe",
      "email": "john@abctraders.com",
      "phone": "+919876543210",
      "type": "both",
      "is_active": true,
      "business_card_url": "https://rice-soft-uploads.s3.ap-south-1.amazonaws.com/business-cards/abc123-def456-ghi789.jpg",
      "created_at": "2025-11-11T10:30:00Z"
    }
  }
}
```

### Error Responses:

**File Too Large (413):**
```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Business card upload failed: File size exceeds maximum allowed size of 5MB"
}
```

**Invalid File Type (400):**
```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Only image files are allowed (JPEG, PNG, GIF)"
}
```

**Lead Not Found (404):**
```json
{
  "status": "error",
  "statusCode": 404,
  "message": "Lead not found"
}
```

## Frontend Implementation Guide

### React Example with File Upload

```jsx
import React, { useState } from 'react';
import axios from 'axios';

const ConvertLeadForm = ({ leadId, onSuccess }) => {
  const [formData, setFormData] = useState({
    lead_id: leadId,
    broker_id: '',
    conversion_value: '',
    commission_rate: '',
    notes: ''
  });
  const [businessCard, setBusinessCard] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      
      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
        setError('Only JPEG, PNG, and GIF images are allowed');
        return;
      }

      setBusinessCard(file);
      setPreview(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key]) {
          data.append(key, formData[key]);
        }
      });
      
      if (businessCard) {
        data.append('business_card', businessCard);
      }

      const response = await axios.post(
        '/api/v1/leads/convertLeadToVendor',
        data,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      onSuccess(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Conversion failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Other form fields */}
      
      <div className="form-group">
        <label>Business Card (Optional)</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif"
          onChange={handleFileChange}
          disabled={loading}
        />
        {preview && (
          <div className="preview">
            <img src={preview} alt="Business card preview" style={{ maxWidth: '300px' }} />
          </div>
        )}
        <small>Max file size: 5MB. Formats: JPEG, PNG, GIF</small>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <button type="submit" disabled={loading}>
        {loading ? 'Converting...' : 'Convert to Vendor'}
      </button>
    </form>
  );
};

export default ConvertLeadForm;
```

## Retrieving Business Card URLs

Business card URLs are automatically included in all vendor responses:

### Get All Vendors
```javascript
const response = await fetch('/api/v1/vendors/getAllVendors', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const vendors = await response.json();
// vendors.data[0].business_card_url contains the S3 URL
```

### Get Vendor by ID
```javascript
const response = await fetch(`/api/v1/vendors/getVendorById/${vendorId}`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const vendor = await response.json();
// vendor.data.business_card_url contains the S3 URL
```

## S3 Upload Utility Functions

The S3 upload utility (`src/utils/s3-upload.ts`) provides these functions:

### uploadToS3
Uploads a file to S3 and returns the public URL.

```typescript
import { uploadToS3 } from '../utils/s3-upload';

const result = await uploadToS3(
  fileBuffer,           // File buffer
  'business-card.jpg',  // Original filename
  'business-cards'      // Folder in S3 (optional)
);

// result = {
//   url: 'https://bucket.s3.region.amazonaws.com/business-cards/uuid.jpg',
//   key: 'business-cards/uuid.jpg',
//   bucket: 'rice-soft-uploads'
// }
```

### deleteFromS3
Deletes a file from S3 (useful for cleanup).

```typescript
import { deleteFromS3 } from '../utils/s3-upload';

await deleteFromS3('business-cards/uuid.jpg');
```

### validateFileSize
Validates file size before upload.

```typescript
import { validateFileSize } from '../utils/s3-upload';

validateFileSize(fileSize, 5); // throws error if > 5MB
```

### validateFileType
Validates file MIME type.

```typescript
import { validateFileType } from '../utils/s3-upload';

validateFileType(
  'image/jpeg',
  ['image/jpeg', 'image/png', 'image/gif']
); // throws error if not in allowed types
```

## Testing

### Manual Testing with Postman

1. Create a new POST request to `http://localhost:3000/api/v1/leads/convertLeadToVendor`
2. Set Authorization header with Bearer token
3. Select Body → form-data
4. Add fields:
   - `lead_id` (text) - UUID of the lead
   - `business_card` (file) - Select an image file
5. Click Send

### Testing with cURL

```bash
# Get authentication token first
TOKEN=$(curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}' \
  | jq -r '.data.token')

# Convert lead with business card
curl -X POST http://localhost:3000/api/v1/leads/convertLeadToVendor \
  -H "Authorization: Bearer $TOKEN" \
  -F "lead_id=YOUR_LEAD_ID" \
  -F "business_card=@/path/to/image.jpg"
```

## Security Considerations

1. **File Size Limit:** Maximum 5MB to prevent abuse
2. **File Type Validation:** Only images (JPEG, PNG, GIF) are accepted
3. **Authentication Required:** All endpoints require valid JWT token
4. **S3 Bucket Security:**
   - Public read access for uploaded files
   - Write access only through backend with IAM credentials
   - Consider enabling versioning for backup
5. **Unique Filenames:** Files are renamed with UUID to prevent conflicts and expose original filenames

## Troubleshooting

### Issue: "Failed to upload file to S3"
**Solution:** Check AWS credentials and S3 bucket permissions in `.env` file

### Issue: "Only image files are allowed"
**Solution:** Ensure the uploaded file is JPEG, PNG, or GIF format

### Issue: "File size exceeds maximum allowed size"
**Solution:** Compress the image or use a smaller file (max 5MB)

### Issue: S3 URLs not accessible
**Solution:** Check S3 bucket policy allows public read access for uploaded files

### Issue: CORS errors when uploading
**Solution:** Configure CORS on S3 bucket to allow requests from your frontend domain

## Future Enhancements

1. **Image Compression:** Automatically compress images before uploading
2. **Multiple File Upload:** Allow uploading multiple business cards
3. **File Preview:** Generate thumbnails for faster loading
4. **OCR Integration:** Extract text from business cards automatically
5. **CDN Integration:** Use CloudFront for faster content delivery
6. **Backup & Versioning:** Enable S3 versioning for file history

## Support

For issues or questions, please contact the development team or refer to:
- AWS S3 Documentation: https://docs.aws.amazon.com/s3/
- Multer Documentation: https://github.com/expressjs/multer

