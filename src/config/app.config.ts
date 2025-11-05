import dotenv from 'dotenv';

dotenv.config();

export const appConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || 'localhost',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
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
      url: process.env.SUREPASS_API_URL || 'https://kyc-api.surepass.io/api/v1/pan/pan',
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
  },
};

export const isDevelopment = appConfig.env === 'development';
export const isProduction = appConfig.env === 'production';


