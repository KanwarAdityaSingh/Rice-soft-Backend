import dotenv from 'dotenv';

dotenv.config();

export const appConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || 'localhost',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production',
    /** Short-lived access token; use POST /auth/refreshToken to renew via httpOnly cookie. */
    expiresIn: process.env.JWT_EXPIRES_IN || '30m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '1d',
  },

  auth: {
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'refreshToken',
    refreshCookiePath: process.env.REFRESH_COOKIE_PATH || '/',
    refreshCookieSameSite: (process.env.REFRESH_COOKIE_SAME_SITE || 'lax') as
      | 'strict'
      | 'lax'
      | 'none',
    /** When true, refresh cookie is session-only (cleared when browser closes). */
    refreshCookieSession: process.env.REFRESH_COOKIE_SESSION !== 'false',
    /** Accept prior refresh hash briefly to tolerate concurrent refresh calls. */
    refreshGracePeriodSec: parseInt(process.env.REFRESH_GRACE_PERIOD_SEC || '30', 10),
  },
  
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs',
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  },
  
  // External API Configurations
  apis: {
    surepass: {
      panUrl:
        process.env.SUREPASS_PAN_API_URL ||
        'https://kyc-api.surepass.io/api/v1/pan/pan-comprehensive',
      bankVerificationUrl:
        process.env.SUREPASS_BANK_API_URL ||
        'https://kyc-api.surepass.io/api/v1/bank-verification/',
      aadhaarValidationUrl:
        process.env.SUREPASS_AADHAAR_API_URL ||
        'https://kyc-api.surepass.io/api/v1/aadhaar-validation/aadhaar-validation',
      emailCheckUrl:
        process.env.SUREPASS_EMAIL_API_URL ||
        'https://kyc-api.surepass.io/api/v1/employment/email-check',
      gstinAdvancedUrl:
        process.env.SUREPASS_GSTIN_ADVANCED_API_URL ||
        'https://kyc-api.surepass.io/api/v1/corporate/gstin-advanced',
      gstinByPanUrl:
        process.env.SUREPASS_GSTIN_BY_PAN_API_URL ||
        'https://kyc-api.surepass.io/api/v1/corporate/gstin-by-pan',
      panToEmailMobileUrl:
        process.env.SUREPASS_PAN_TO_EMAIL_MOBILE_API_URL ||
        'https://kyc-api.surepass.io/api/v1/pan-to-email-mobile/verification',
      rcVerificationUrl:
        process.env.SUREPASS_RC_API_URL ||
        'https://kyc-api.surepass.io/api/v1/rc-verification',
      rcChallanDetailsUrl:
        process.env.SUREPASS_RC_CHALLAN_API_URL ||
        'https://kyc-api.surepass.io/api/v1/rc/rc-related/challan-details',
      rcFullUrl:
        process.env.SUREPASS_RC_FULL_API_URL ||
        'https://kyc-api.surepass.io/api/v1/rc/rc-full',
      dlVerificationUrl:
        process.env.SUREPASS_DL_API_URL ||
        'https://kyc-api.surepass.app/api/v1/driving-license/driving-license',
      licenseOcrUrl:
        process.env.SUREPASS_LICENSE_OCR_API_URL ||
        'https://kyc-api.surepass.app/api/v1/ocr/license-v2',
      gstOcrUrl:
        process.env.SUREPASS_GST_OCR_API_URL ||
        'https://kyc-api.surepass.app/api/v1/ocr/gst',
      panOcrUrl:
        process.env.SUREPASS_PAN_OCR_API_URL ||
        'https://kyc-api.surepass.app/api/v1/ocr/pan',
      aadhaarOcrUrl:
        process.env.SUREPASS_AADHAAR_OCR_API_URL ||
        'https://kyc-api.surepass.app/api/v1/ocr/aadhaar',
      vehicleRcOcrUrl:
        process.env.SUREPASS_VEHICLE_RC_OCR_API_URL ||
        'https://kyc-api.surepass.app/api/v1/ocr/vehicle-rc',
      token: process.env.SUREPASS_API_TOKEN || '',
    },
    mastersIndia: {
      url: process.env.MASTERS_INDIA_API_URL || 'https://commonapi.mastersindia.co/commonapis/searchgstin/',
      authUrl: process.env.MASTERS_INDIA_AUTH_URL || 'https://pro.mastersindia.co/oauth/access_token',
      username: process.env.MASTERS_INDIA_USERNAME || '',
      password: process.env.MASTERS_INDIA_PASSWORD || '',
      clientId: process.env.MASTERS_INDIA_CLIENT_ID || '',
      clientSecret: process.env.MASTERS_INDIA_CLIENT_SECRET || '',
    },
    kaleyra: {
      url: process.env.KALEYRA_BASE_URL || 'https://api.kaleyra.io/v1/HXAP1679900797IN/messages',
      apiKey: process.env.KALEYRA_API_KEY || 'A7817538772624b312d23974ca14997bb',
      senderId: process.env.KALEYRA_SENDER_ID || 'SNTKRI',
      templateId: process.env.KALEYRA_TEMPLATE_ID || '1007162144526914389',
      // WhatsApp Configuration
      whatsappUrl: process.env.KALEYRA_WHATSAPP_URL || 'https://api.kaleyra.io/v1/HXAP1679900797IN/whatsapp',
      whatsappFromNumber: process.env.KALEYRA_WHATSAPP_FROM_NUMBER || '',
      whatsappTemplateName: process.env.KALEYRA_WHATSAPP_TEMPLATE_NAME || 'sauda_notification',
    },
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    /** gpt-4o-mini: cheap, no reasoning-token overhead; best for 0–100 name scoring. */
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    /** Only used for GPT-5 family if OPENAI_MODEL is overridden to gpt-5*. */
    maxCompletionTokens: parseInt(process.env.OPENAI_MAX_COMPLETION_TOKENS || '512', 10),
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || 'minimal',
    /** Minimum similarity score (0–100) to accept bank holder name via LLM fallback. */
    bankNameSimilarityThreshold: parseInt(
      process.env.BANK_NAME_SIMILARITY_THRESHOLD || '90',
      10
    ),
    enabled: process.env.OPENAI_NAME_SIMILARITY_ENABLED !== 'false',
    /** Vision extraction of kaanta slip weights (Gross/Tare/Net, ticket, vehicle). */
    kaantaExtractionEnabled: process.env.OPENAI_KAANTA_EXTRACTION_ENABLED !== 'false',
  },

  otp: {
    ttlMinutes: parseInt(process.env.OTP_TTL_MINUTES || '30', 10),
    length: parseInt(process.env.OTP_LENGTH || '6', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    resendCooldownSec: parseInt(process.env.OTP_RESEND_COOLDOWN_SEC || '45', 10),
  },
  
  aws: {
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    s3: {
      bucketName: process.env.AWS_S3_BUCKET_NAME || 'rice-soft-uploads',
      businessCardsFolder: process.env.AWS_S3_BUSINESS_CARDS_FOLDER || 'business-cards',
      purchaseBillsFolder: process.env.AWS_S3_PURCHASE_BILLS_FOLDER || 'purchase-bills',
      transportationBillsFolder: process.env.AWS_S3_TRANSPORTATION_BILLS_FOLDER || 'transportation-bills',
      biltiFolder: process.env.AWS_S3_BILTI_FOLDER || 'bilti',
      ewayBillsFolder: process.env.AWS_S3_EWAY_BILLS_FOLDER || 'eway-bills',
      paymentSlipsFolder: process.env.AWS_S3_PAYMENT_SLIPS_FOLDER || 'payment-slips',
      riceImagesFolder: process.env.AWS_S3_RICE_IMAGES_FOLDER || 'rice-images',
      inwardSlipBillsFolder: process.env.AWS_S3_INWARD_SLIP_BILLS_FOLDER || 'inward-slip-bills',
      kaantaParchisFolder: process.env.AWS_S3_KAANTA_PARCHIS_FOLDER || 'kaanta-parchis',
      packagingBillsFolder: process.env.AWS_S3_PACKAGING_BILLS_FOLDER || 'packaging-bills',
    },
    ses: {
      fromEmail: process.env.AWS_SES_FROM_EMAIL || 'info@santkripaequipment.com',
      fromName: process.env.AWS_SES_FROM_NAME || 'SantKripa Equipments',
    },
  },
  
  // Default Payment Advice Recipient
  defaultRecipient: {
    name: process.env.DEFAULT_RECIPIENT_NAME || 'ADHRA AMRIT AGRO PRODUCTS LLP',
    address: process.env.DEFAULT_RECIPIENT_ADDRESS || 'Plot No. 09, Sector 23, Phase-III, HSIIDC Industrial Estate, Barhi, Sonipat, Haryana, India-131101',
    llpin: process.env.DEFAULT_RECIPIENT_LLPIN || 'AAU-3262',
  },
};

export const isDevelopment = appConfig.env === 'development';
export const isProduction = appConfig.env === 'production';


