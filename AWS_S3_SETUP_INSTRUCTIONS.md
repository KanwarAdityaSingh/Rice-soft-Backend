# AWS S3 Setup Instructions for Business Card Upload

## Quick Setup Guide

Follow these steps to configure AWS S3 for the business card upload feature.

---

## Step 1: Create S3 Bucket

1. **Log in to AWS Console:**
   - Go to https://console.aws.amazon.com/
   - Navigate to S3 service

2. **Create New Bucket:**
   - Click "Create bucket"
   - **Bucket name:** `rice-soft-uploads` (or your custom name)
   - **Region:** `ap-south-1` (Asia Pacific Mumbai) or your preferred region
   - **Object Ownership:** ACLs disabled (recommended)
   - **Block Public Access:** Uncheck "Block all public access"
     - ⚠️ Acknowledge that objects can be public
   - Click "Create bucket"

---

## Step 2: Configure Bucket Policy

1. **Navigate to Bucket:**
   - Click on your newly created bucket
   - Go to "Permissions" tab

2. **Add Bucket Policy:**
   - Scroll to "Bucket policy"
   - Click "Edit"
   - Paste the following policy (replace `rice-soft-uploads` with your bucket name):

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

3. **Save Changes**

**What this does:** Allows public read access to all objects in the bucket, so business card URLs will be accessible.

---

## Step 3: Create IAM User for Application

1. **Navigate to IAM:**
   - Go to AWS Console → IAM service
   - Click "Users" in the left sidebar
   - Click "Add users"

2. **Create User:**
   - **User name:** `rice-soft-app` (or your custom name)
   - **Access type:** Select "Programmatic access"
   - Click "Next: Permissions"

3. **Set Permissions:**
   - **Option A (Quick):** Attach existing policy directly
     - Search for "AmazonS3FullAccess"
     - Check the box
   
   - **Option B (Recommended - Least Privilege):** Create custom policy
     - Click "Create policy"
     - Select JSON tab
     - Paste the following:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::rice-soft-uploads/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::rice-soft-uploads"
    }
  ]
}
```

4. **Complete User Creation:**
   - Click "Next: Tags" (optional, skip if not needed)
   - Click "Next: Review"
   - Click "Create user"

5. **Save Credentials:**
   - ⚠️ **IMPORTANT:** Download or copy the credentials
   - **Access Key ID:** Save this
   - **Secret Access Key:** Save this (you won't see it again!)

---

## Step 4: Optional - Configure CORS

**When needed:** If you plan to upload files directly from browser (not needed for current backend implementation)

1. **Navigate to Bucket:**
   - Go to your S3 bucket
   - Click "Permissions" tab
   - Scroll to "Cross-origin resource sharing (CORS)"

2. **Add CORS Configuration:**
   - Click "Edit"
   - Paste the following:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

3. **For Production (More Restrictive):**

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": [
      "https://yourdomain.com",
      "https://www.yourdomain.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## Step 5: Create Folder Structure (Optional)

1. **Navigate to Bucket:**
   - Go to your S3 bucket
   - Click "Create folder"

2. **Create Folders:**
   - Create folder: `business-cards/`
   - Create folder: `documents/` (for future use)
   - Create folder: `temp/` (for temporary uploads)

**Note:** The application will automatically create the `business-cards/` folder when uploading, so this step is optional.

---

## Step 6: Configure Backend Environment Variables

1. **Edit `.env` file in your backend project:**

```env
# AWS S3 Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID_HERE
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_ACCESS_KEY_HERE
AWS_S3_BUCKET_NAME=rice-soft-uploads
AWS_S3_BUSINESS_CARDS_FOLDER=business-cards
```

2. **Replace placeholders:**
   - `YOUR_ACCESS_KEY_ID_HERE` → Your IAM user's Access Key ID
   - `YOUR_SECRET_ACCESS_KEY_HERE` → Your IAM user's Secret Access Key
   - Update bucket name if you used a different name
   - Update region if you chose a different region

---

## Step 7: Verify Setup

1. **Test Upload (using cURL):**

```bash
# First, get authentication token
TOKEN=$(curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}' \
  | jq -r '.data.token')

# Test business card upload
curl -X POST http://localhost:3000/api/v1/leads/convertLeadToVendor \
  -H "Authorization: Bearer $TOKEN" \
  -F "lead_id=VALID_LEAD_ID" \
  -F "business_card=@/path/to/test-image.jpg"
```

2. **Check S3 Bucket:**
   - Go to AWS Console → S3
   - Open your bucket
   - Navigate to `business-cards/` folder
   - You should see the uploaded file

3. **Test URL Access:**
   - Copy the URL from the API response
   - Open it in a browser
   - You should see the uploaded image

---

## Common Issues & Solutions

### Issue: "Access Denied" when uploading
**Solutions:**
1. Verify IAM user has correct permissions
2. Check AWS credentials in `.env` are correct
3. Ensure bucket policy allows PutObject

### Issue: "Bucket does not exist"
**Solutions:**
1. Verify bucket name in `.env` matches actual bucket name
2. Check region is correct
3. Ensure bucket was created successfully

### Issue: Uploaded files not accessible via URL
**Solutions:**
1. Check bucket policy allows public GetObject
2. Ensure "Block Public Access" is disabled
3. Verify URL is correctly formatted

### Issue: CORS errors
**Solutions:**
1. Configure CORS on S3 bucket (see Step 4)
2. Add your frontend domain to AllowedOrigins
3. Clear browser cache and retry

---

## Security Best Practices

1. **Use Least Privilege:**
   - Don't use root AWS account credentials
   - Create IAM user with minimal required permissions
   - Use custom IAM policy instead of AmazonS3FullAccess

2. **Protect Credentials:**
   - Never commit `.env` file to version control
   - Add `.env` to `.gitignore`
   - Use environment variables in production
   - Rotate credentials periodically

3. **Enable Logging:**
   - Enable S3 access logging
   - Monitor CloudWatch metrics
   - Set up alarms for unusual activity

4. **Backup Strategy:**
   - Enable S3 versioning (optional)
   - Set up lifecycle policies for old files
   - Configure cross-region replication (for critical data)

5. **Cost Management:**
   - Monitor S3 storage costs
   - Set up lifecycle policies to move old files to cheaper storage classes
   - Delete unused files regularly

---

## Cost Estimation

### S3 Pricing (ap-south-1 region, approximate):
- **Storage:** $0.023 per GB/month
- **PUT Requests:** $0.005 per 1,000 requests
- **GET Requests:** $0.0004 per 1,000 requests
- **Data Transfer:** First 1 GB free, then $0.109 per GB

### Example Monthly Cost (Estimated):
- **Scenario:** 1,000 vendors, 500KB average business card size
  - Storage: ~0.5 GB = $0.012/month
  - PUT requests: 1,000 uploads = $0.005
  - GET requests: 10,000 views = $0.004
  - **Total:** ~$0.02/month (negligible)

### Monitoring Costs:
- AWS Console → Billing Dashboard → Cost Explorer
- Set up budget alerts for unexpected usage

---

## Advanced Configuration (Optional)

### 1. Enable Versioning
- Keeps multiple versions of each file
- Useful for recovery from accidental deletions

### 2. Lifecycle Policies
- Automatically transition old files to cheaper storage (Glacier)
- Delete files after certain period

### 3. CloudFront CDN
- Speed up file delivery globally
- Reduce S3 bandwidth costs
- Enable HTTPS for better security

### 4. Server-Side Encryption
- Encrypt files at rest
- Use AWS KMS for key management

---

## Testing Checklist

- [ ] S3 bucket created successfully
- [ ] Bucket policy configured for public read
- [ ] IAM user created with S3 permissions
- [ ] Credentials saved securely
- [ ] Environment variables configured in `.env`
- [ ] Test upload successful
- [ ] Uploaded file accessible via URL
- [ ] Test with different image formats (JPEG, PNG, GIF)
- [ ] Test file size validation (try file > 5MB)
- [ ] Test file type validation (try non-image file)

---

## Production Deployment

Before deploying to production:

1. **Use Production Bucket:**
   - Create separate bucket: `rice-soft-uploads-prod`
   - Configure same permissions
   - Update production `.env`

2. **Secure Credentials:**
   - Use AWS Secrets Manager or Parameter Store
   - Don't store credentials in code
   - Use IAM roles if deploying on AWS (EC2, ECS, Lambda)

3. **Enable CloudWatch Logs:**
   - Monitor application S3 errors
   - Set up alarms for failures

4. **Test Thoroughly:**
   - Test all upload scenarios
   - Verify public access works
   - Check error handling

---

## Support Resources

- **AWS S3 Documentation:** https://docs.aws.amazon.com/s3/
- **AWS IAM Documentation:** https://docs.aws.amazon.com/iam/
- **AWS SDK for JavaScript:** https://docs.aws.amazon.com/sdk-for-javascript/

---

**Setup Completion Time:** ~15-20 minutes

**Status:** Ready to use after following all steps above

