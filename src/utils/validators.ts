import Joi from 'joi';
import { ValidationError } from './errors';
import { BAG_TYPE_VALUES } from '../constants/bag-types';
import { normalizeDriverDobForSurepass } from './driver-license';

export const validate = <T>(schema: Joi.Schema, data: any): T => {
  const { error, value } = schema.validate(data, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map((detail) => detail.message).join(', ');
    throw new ValidationError(errors);
  }
  
  return value as T;
};

// User validation schemas
export const loginSchema = Joi.object({
  username: Joi.string().required().min(3).max(100),
  password: Joi.string().required().min(6),
});

export const changePasswordSchema = Joi.object({
  old_password: Joi.string().required(),
  new_password: Joi.string().required().min(6).max(100),
});

// OTP login schemas
// Accept Indian numbers: either 10 digits or 12 digits starting with 91, optional separators are removed client-side
const phoneSchema = Joi.string()
  .required()
  .custom((value, helpers) => {
    const digits = value.replace(/\D/g, '');
    if ((digits.startsWith('91') && digits.length === 12) || digits.length === 10) {
      return value;
    }
    return helpers.error('string.pattern.base', { name: 'phone' });
  }, 'Indian phone validation');

export const requestOtpSchema = Joi.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = Joi.object({
  phone: phoneSchema,
  otp: Joi.string().required().pattern(/^[0-9]{6}$/),
});

export const createUserSchema = Joi.object({
  username: Joi.string().required().min(3).max(100),
  email: Joi.string().optional().allow(null, '').email(),
  password: Joi.string().required().min(6).max(100),
  full_name: Joi.string().required().min(2).max(255),
  phone: Joi.string().optional().allow(null, '').max(20),
  user_type: Joi.string().optional().valid('admin', 'vendor', 'salesman', 'broker', 'custom'),
  is_active: Joi.boolean().optional(),
});

export const updateUserSchema = Joi.object({
  username: Joi.string().optional().min(3).max(100),
  email: Joi.string().optional().email(),
  password: Joi.string().optional().min(6).max(100),
  full_name: Joi.string().optional().min(2).max(255),
  phone: Joi.string().optional().allow(null, '').max(20),
  user_type: Joi.string().optional().valid('admin', 'vendor', 'salesman', 'broker', 'custom'),
  is_active: Joi.boolean().optional(),
}).min(1);

// UUID validation
export const uuidSchema = Joi.string().uuid();

// Salesman validation schemas
export const createSalesmanSchema = Joi.object({
  name: Joi.string().required().min(2).max(255),
  phone: Joi.string().required().max(20),
  email: Joi.string().optional().allow(null, '').email(),
  is_active: Joi.boolean().optional(),
});

export const updateSalesmanSchema = Joi.object({
  name: Joi.string().optional().min(2).max(255),
  phone: Joi.string().optional().max(20),
  email: Joi.string().optional().email(),
  is_active: Joi.boolean().optional(),
}).min(1);

// Address validation schema (reusable)
export const addressSchema = Joi.object({
  street: Joi.string().required().max(255),
  city: Joi.string().required().max(100),
  state: Joi.string().required().max(100),
  pincode: Joi.string().optional().allow('', null).max(10),
  country: Joi.string().required().max(100),
});

// Business details validation schema (reusable - for vendors, etc.)
const businessDetailsSchema = Joi.object({
  pan_number: Joi.string().optional().allow(null, '').length(10),
  gst_number: Joi.string().optional().allow(null, '').length(15),
  registration_number: Joi.string().optional().allow(null, '').max(50),
  business_type: Joi.string().optional().valid('individual', 'partnership', 'company', 'llp'),
});

const vendorAadharSchema = Joi.string()
  .optional()
  .allow(null, '')
  .length(12)
  .pattern(/^[0-9]{12}$/);

function validateVendorRegistrationFields(
  value: {
    registration_type?: string;
    business_details?: { pan_number?: string; gst_number?: string };
    aadhar_number?: string;
  },
  helpers: Joi.CustomHelpers
) {
  const registrationType = value.registration_type;
  if (!registrationType) {
    return value;
  }

  const hasPan = Boolean(value.business_details?.pan_number?.trim());
  const hasGst = Boolean(value.business_details?.gst_number?.trim());
  const hasAadhar = Boolean(value.aadhar_number?.trim());

  if (registrationType === 'registered' && !hasPan && !hasGst) {
    return helpers.error('custom.vendorGstOrPanRequired');
  }

  if (registrationType === 'unregistered' && !hasAadhar) {
    return helpers.error('custom.vendorAadharRequired');
  }

  return value;
}

// Business details validation schema for brokers
// - Individual: requires PAN or Aadhaar
// - Company: requires GST number
const brokerBusinessDetailsSchema = Joi.object({
  pan_number: Joi.string().optional().allow(null, '').length(10).uppercase(),
  aadhaar_number: Joi.string().optional().allow(null, '').pattern(/^[2-9]{1}[0-9]{11}$/).custom((value, helpers) => {
    // Remove spaces if present
    if (value) {
      const cleaned = value.replace(/\s/g, '');
      if (cleaned.length !== 12) {
        return helpers.error('string.length');
      }
      return cleaned;
    }
    return value;
  }, 'Aadhaar number validation'),
  gst_number: Joi.string().optional().allow(null, '').length(15).uppercase(),
  business_type: Joi.string().required().valid('individual', 'company'),
}).custom((value, helpers) => {
  const businessType = value.business_type;
  const hasPAN = value.pan_number && value.pan_number.trim() !== '';
  const hasAadhaar = value.aadhaar_number && value.aadhaar_number.trim() !== '';
  const hasGST = value.gst_number && value.gst_number.trim() !== '';
  
  // For individual brokers: require PAN or Aadhaar
  if (businessType === 'individual') {
    if (!hasPAN && !hasAadhaar) {
      return helpers.error('custom.panOrAadhaarRequired');
    }
  }
  
  // For company brokers: require GST
  if (businessType === 'company') {
    if (!hasGST) {
      return helpers.error('custom.gstRequired');
    }
  }
  
  return value;
}).messages({
  'custom.panOrAadhaarRequired': 'Either PAN number or Aadhaar number must be provided for individual brokers',
  'custom.gstRequired': 'GST number is required for company brokers'
});

// Bank details validation schema (reusable)
const bankDetailsSchema = Joi.object({
  account_holder_name: Joi.string().optional().allow(null, '').max(255),
  account_number: Joi.string().optional().allow(null, '').max(50),
  ifsc_code: Joi.string().optional().allow(null, '').length(11),
  bank_name: Joi.string().optional().allow(null, '').max(255),
  branch: Joi.string().optional().allow(null, '').max(255),
});

// Vendor validation schemas
/** Stricter bank_details when verify_bank is true (create/update vendor / quick create). */
export const bankDetailsForVerifySchema = Joi.object({
  account_holder_name: Joi.string().required().min(2).max(255),
  account_number: Joi.string().required().min(9).max(50),
  ifsc_code: Joi.string().required().length(11),
  bank_name: Joi.string().optional().allow(null, '').max(255),
  branch: Joi.string().optional().allow(null, '').max(255),
});

const surepassVerificationSnapshotSchema = Joi.object({
  provider: Joi.string().valid('surepass').optional(),
  verified_at: Joi.string().optional(),
  raw: Joi.any().optional(),
  mapped: Joi.any().optional(),
}).unknown(true);

/** Partial KYC snapshots merged into entity JSONB on create/update. */
export const kycVerificationDetailsSchema = Joi.object({
  pan: surepassVerificationSnapshotSchema.optional(),
  pan_comprehensive: surepassVerificationSnapshotSchema.optional(),
  pan_contact: surepassVerificationSnapshotSchema.optional(),
  gst: surepassVerificationSnapshotSchema.optional(),
  gst_advanced: surepassVerificationSnapshotSchema.optional(),
  gstin_by_pan: surepassVerificationSnapshotSchema.optional(),
  aadhaar: surepassVerificationSnapshotSchema.optional(),
  bank: surepassVerificationSnapshotSchema.optional(),
  driving_license: surepassVerificationSnapshotSchema.optional(),
  emails: Joi.object()
    .pattern(Joi.string(), surepassVerificationSnapshotSchema)
    .optional(),
}).optional();

export const vehicleVerificationDetailsSchema = Joi.object({
  rc: surepassVerificationSnapshotSchema.optional(),
  rc_full: surepassVerificationSnapshotSchema.optional(),
  rc_challan: surepassVerificationSnapshotSchema.optional(),
}).optional();

export const createVendorSchema = Joi.object({
  business_name: Joi.string().required().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).required().min(1),
  address: addressSchema.required(),
  business_details: businessDetailsSchema.required(),
  aadhar_number: vendorAadharSchema,
  registration_type: Joi.string().required().valid('registered', 'unregistered'),
  bank_details: Joi.when('verify_bank', {
    is: true,
    then: bankDetailsForVerifySchema.required(),
    otherwise: bankDetailsSchema.optional(),
  }),
  verify_bank: Joi.boolean().optional(),
  type: Joi.string().required().valid('purchaser', 'seller', 'both'),
  is_active: Joi.boolean().optional(),
  is_verified: Joi.boolean().optional(),
  verified_at: Joi.string().optional().allow(null, ''),
  google_location_link: Joi.string().optional().allow(null, '').max(500),
  kyc_verification_details: kycVerificationDetailsSchema,
})
  .custom(validateVendorRegistrationFields)
  .messages({
    'custom.vendorGstOrPanRequired':
      'Registered vendors require GST or PAN in business_details',
    'custom.vendorAadharRequired': 'Unregistered vendors require aadhar_number',
  });

export const updateVendorSchema = Joi.object({
  business_name: Joi.string().optional().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).optional().min(1),
  address: addressSchema.optional(),
  business_details: businessDetailsSchema.optional(),
  aadhar_number: vendorAadharSchema,
  registration_type: Joi.string().optional().valid('registered', 'unregistered'),
  bank_details: Joi.when('verify_bank', {
    is: true,
    then: bankDetailsForVerifySchema.required(),
    otherwise: bankDetailsSchema.optional(),
  }),
  verify_bank: Joi.boolean().optional(),
  type: Joi.string().optional().valid('purchaser', 'seller', 'both'),
  is_active: Joi.boolean().optional(),
  is_verified: Joi.boolean().optional(),
  verified_at: Joi.string().optional().allow(null, ''),
  google_location_link: Joi.string().optional().allow(null, '').max(500),
  kyc_verification_details: kycVerificationDetailsSchema,
})
  .min(1);

function validateSalesPartyRegistrationFields(
  value: {
    registration_type?: string;
    business_details?: { pan_number?: string; gst_number?: string };
    aadhar_number?: string;
  },
  helpers: Joi.CustomHelpers
) {
  const registrationType = value.registration_type;
  if (!registrationType) {
    return value;
  }

  const hasPan = Boolean(value.business_details?.pan_number?.trim());
  const hasGst = Boolean(value.business_details?.gst_number?.trim());
  const hasAadhar = Boolean(value.aadhar_number?.trim());

  if (registrationType === 'registered' && !hasPan && !hasGst) {
    return helpers.error('custom.salesPartyGstOrPanRequired');
  }

  if (registrationType === 'unregistered' && !hasAadhar) {
    return helpers.error('custom.salesPartyAadharRequired');
  }

  return value;
}

// Sales Party validation schemas (no type — sales parties are always buyers)
export const createSalesPartySchema = Joi.object({
  business_name: Joi.string().required().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).required().min(1),
  address: addressSchema.required(),
  business_details: businessDetailsSchema.required(),
  aadhar_number: vendorAadharSchema,
  registration_type: Joi.string().required().valid('registered', 'unregistered'),
  bank_details: bankDetailsSchema.optional(),
  is_active: Joi.boolean().optional(),
  is_verified: Joi.boolean().optional(),
  verified_at: Joi.string().optional().allow(null, ''),
  google_location_link: Joi.string().optional().allow(null, '').max(500),
  kyc_verification_details: kycVerificationDetailsSchema,
})
  .custom(validateSalesPartyRegistrationFields)
  .messages({
    'custom.salesPartyGstOrPanRequired':
      'Registered sales parties require GST or PAN in business_details',
    'custom.salesPartyAadharRequired': 'Unregistered sales parties require aadhar_number',
  });

export const updateSalesPartySchema = Joi.object({
  business_name: Joi.string().optional().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).optional().min(1),
  address: addressSchema.optional(),
  business_details: businessDetailsSchema.optional(),
  aadhar_number: vendorAadharSchema,
  registration_type: Joi.string().optional().valid('registered', 'unregistered'),
  bank_details: bankDetailsSchema.optional(),
  is_active: Joi.boolean().optional(),
  is_verified: Joi.boolean().optional(),
  verified_at: Joi.string().optional().allow(null, ''),
  google_location_link: Joi.string().optional().allow(null, '').max(500),
  kyc_verification_details: kycVerificationDetailsSchema,
})
  .custom(validateSalesPartyRegistrationFields)
  .messages({
    'custom.salesPartyGstOrPanRequired':
      'Registered sales parties require GST or PAN in business_details',
    'custom.salesPartyAadharRequired': 'Unregistered sales parties require aadhar_number',
  })
  .min(1);

// Broker details validation schema
const brokerDetailsSchema = Joi.object({
  commission_rate: Joi.number().optional().min(0).max(100),
  specialization: Joi.string().optional().allow(null, '').max(255),
  experience_years: Joi.string().optional().allow(null, '').max(100),
});

// Broker validation schemas
export const createBrokerSchema = Joi.object({
  business_name: Joi.string().optional().min(2).max(255).allow(null, ''),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).required().min(1),
  address: addressSchema.required(),
  business_details: brokerBusinessDetailsSchema.required(),
  bank_details: Joi.when('verify_bank', {
    is: true,
    then: bankDetailsForVerifySchema.required(),
    otherwise: bankDetailsSchema.optional(),
  }),
  verify_bank: Joi.boolean().optional(),
  broker_details: brokerDetailsSchema.optional(),
  type: Joi.string().required().valid('purchase', 'sale', 'both'),
  is_active: Joi.boolean().optional(),
  kyc_verification_details: kycVerificationDetailsSchema,
});

/** Query for GET /brokers/:brokerId/brokerage-commission-summary */
export const brokerBrokerageCommissionSummaryQuerySchema = Joi.object({
  godown_id: Joi.string().optional().empty(['', null]).uuid(),
  status: Joi.string().optional().valid('draft', 'active', 'completed', 'cancelled'),
  from_date: Joi.string().optional().empty(['', null]).isoDate(),
  to_date: Joi.string().optional().empty(['', null]).isoDate(),
});

export const updateBrokerSchema = Joi.object({
  business_name: Joi.string().optional().min(2).max(255).allow(null, ''),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).optional().min(1),
  address: addressSchema.optional(),
  business_details: brokerBusinessDetailsSchema.optional(),
  bank_details: Joi.when('verify_bank', {
    is: true,
    then: bankDetailsForVerifySchema.required(),
    otherwise: bankDetailsSchema.optional(),
  }),
  verify_bank: Joi.boolean().optional(),
  broker_details: brokerDetailsSchema.optional(),
  type: Joi.string().optional().valid('purchase', 'sale', 'both'),
  is_active: Joi.boolean().optional(),
  kyc_verification_details: kycVerificationDetailsSchema,
}).min(1);

// Lead validation schemas
export const createLeadSchema = Joi.object({
  company_name: Joi.string().required().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).required().min(1),
  address: addressSchema.optional(),
  business_details: Joi.object({
    pan_number: Joi.string().optional().allow(null, '').length(10),
    gst_number: Joi.string().optional().allow(null, '').length(15),
    business_type: Joi.string().optional().valid('individual', 'partnership', 'company', 'llp').allow(null, ''),
    industry: Joi.string().optional().max(100).allow(null, ''),
    company_size: Joi.string().optional().max(50).allow(null, ''),
    annual_revenue: Joi.number().optional().min(0).allow(null),
  }).optional().unknown(true),
  is_existing_customer: Joi.boolean().optional(),
  lead_status: Joi.string().optional().valid('new', 'contacted', 'engaged', 'converted', 'rejected'),
  customer_status: Joi.string().optional().max(100),
  assigned_to: Joi.string().optional().uuid().allow(null, ''),
  broker_id: Joi.string().optional().uuid().allow(null, ''),
  rice_code_id: Joi.string().optional().uuid().allow(null, ''),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella').allow(null, ''),
  notes: Joi.string().optional().max(1000),
  priority: Joi.string().optional().valid('low', 'medium', 'high', 'urgent'),
  source: Joi.string().optional().max(100),
  estimated_value: Joi.number().optional().min(0),
  expected_close_date: Joi.date().optional(),
  salesman_latitude: Joi.number().optional().allow(null, '').precision(8),
  salesman_longitude: Joi.number().optional().allow(null, '').precision(8),
  google_location_link: Joi.string().optional().allow(null, '').max(500),
});

export const updateLeadSchema = Joi.object({
  company_name: Joi.string().optional().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).optional().min(1),
  address: addressSchema.optional().allow(null),
  business_details: Joi.object({
    pan_number: Joi.string().optional().length(10).allow(null, ''),
    gst_number: Joi.string().optional().length(15).allow(null, ''),
    business_type: Joi.string().optional().valid('individual', 'partnership', 'company', 'llp').allow(null, ''),
    industry: Joi.string().optional().max(100).allow(null, ''),
    company_size: Joi.string().optional().max(50).allow(null, ''),
    annual_revenue: Joi.number().optional().min(0).allow(null),
  }).optional().allow(null).unknown(true),
  is_existing_customer: Joi.boolean().optional(),
  lead_status: Joi.string().optional().valid('new', 'contacted', 'engaged', 'converted', 'rejected'),
  customer_status: Joi.string().optional().allow(null, '').max(100),
  assigned_to: Joi.alternatives().try(
    Joi.string().uuid(),
    Joi.valid(null, '')
  ).optional(),
  broker_id: Joi.alternatives().try(
    Joi.string().uuid(),
    Joi.valid(null, '')
  ).optional(),
  rice_code_id: Joi.string().optional().uuid().allow(null, ''),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella').allow(null, ''),
  notes: Joi.string().optional().allow(null, '').max(1000),
  priority: Joi.string().optional().valid('low', 'medium', 'high', 'urgent'),
  source: Joi.string().optional().allow(null, '').max(100),
  estimated_value: Joi.number().optional().allow(null).min(0),
  expected_close_date: Joi.date().optional().allow(null),
  revenue: Joi.number().optional().allow(null).min(0),
  salesman_latitude: Joi.number().optional().allow(null).precision(8),
  salesman_longitude: Joi.number().optional().allow(null).precision(8),
  google_location_link: Joi.string().optional().allow(null, '').max(500),
}).min(1);

// Lead Event validation schemas
export const createLeadEventSchema = Joi.object({
  lead_id: Joi.string().required().uuid(),
  event_type: Joi.string().required().max(50),
  event_description: Joi.string().optional().max(500),
  metadata: Joi.object().optional(),
});

// Conversion validation schemas
export const createConversionSchema = Joi.object({
  lead_id: Joi.string().required().uuid(),
  vendor_id: Joi.string().required().uuid(),
  broker_id: Joi.string().optional().uuid(),
  conversion_value: Joi.number().optional().min(0),
  commission_rate: Joi.number().optional().min(0).max(100),
  commission_amount: Joi.number().optional().min(0),
  notes: Joi.string().optional().max(1000),
});

export const updateConversionSchema = Joi.object({
  conversion_value: Joi.number().optional().min(0),
  commission_rate: Joi.number().optional().min(0).max(100),
  commission_amount: Joi.number().optional().min(0),
  notes: Joi.string().optional().max(1000),
}).min(1);

export const convertLeadToVendorSchema = Joi.object({
  lead_id: Joi.string().required().uuid(),
  broker_id: Joi.string().optional().uuid().allow(null),
  conversion_value: Joi.number().optional().min(0),
  commission_rate: Joi.number().optional().min(0).max(100),
  notes: Joi.string().optional().allow(null, '').max(1000),
});

// Rice code validation schemas
export const createRiceCodeSchema = Joi.object({
  rice_code_name: Joi.string().required().min(1).max(255),
  created_by: Joi.string().optional().uuid(),
});

export const updateRiceCodeSchema = Joi.object({
  rice_code_name: Joi.string().optional().min(1).max(255),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Custom user permissions schema
const crudPermSchema = Joi.object({
  create: Joi.boolean().required(),
  read: Joi.boolean().required(),
  update: Joi.boolean().required(),
  delete: Joi.boolean().required(),
});

export const updateCustomPermissionsSchema = Joi.object({
  salesman: crudPermSchema.optional(),
  broker: crudPermSchema.optional(),
  vendor: crudPermSchema.optional(),
  leads: crudPermSchema.optional(),
  riceCode: crudPermSchema.optional(),
}).min(1);

// Transporter validation schemas
export const createTransporterSchema = Joi.object({
  business_name: Joi.string().required().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).optional().default([]),
  address: addressSchema.required(),
  gst_number: Joi.string().optional().allow(null, '').length(15),
  pan_number: Joi.string().optional().allow(null, '').length(10).uppercase(),
  aadhar_number: Joi.string().optional().allow(null, '').length(12).pattern(/^[0-9]{12}$/),
  transport_type: Joi.string().required().valid('registered', 'unregistered'),
  vehicle_numbers: Joi.array().items(Joi.string().max(50)).optional(),
  bank_details: Joi.when('verify_bank', {
    is: true,
    then: bankDetailsForVerifySchema.required(),
    otherwise: bankDetailsSchema.optional(),
  }),
  verify_bank: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
  is_verified: Joi.boolean().optional(),
  verified_at: Joi.string().optional().allow(null, ''),
  created_by: Joi.string().optional().uuid(),
  kyc_verification_details: kycVerificationDetailsSchema,
});

export const updateTransporterSchema = Joi.object({
  business_name: Joi.string().optional().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).optional().min(1),
  address: addressSchema.optional(),
  gst_number: Joi.string().optional().allow(null, '').length(15),
  pan_number: Joi.string().optional().allow(null, '').length(10).uppercase(),
  aadhar_number: Joi.string().optional().allow(null, '').length(12).pattern(/^[0-9]{12}$/),
  transport_type: Joi.string().optional().valid('registered', 'unregistered'),
  vehicle_numbers: Joi.array().items(Joi.string().max(50)).optional(),
  bank_details: Joi.when('verify_bank', {
    is: true,
    then: bankDetailsForVerifySchema.required(),
    otherwise: bankDetailsSchema.optional(),
  }),
  verify_bank: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
  is_verified: Joi.boolean().optional(),
  verified_at: Joi.string().optional().allow(null, ''),
  updated_by: Joi.string().optional().uuid(),
  kyc_verification_details: kycVerificationDetailsSchema,
}).min(1);
export const createSaudaSchema = Joi.object({
  sauda_type: Joi.string().required().valid('exgodown', 'for'),
  rice_type: Joi.string().required().valid('basmati', 'non_basmati', 'parboiled', 'raw', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella'),
  rice_length: Joi.string().optional().valid('dubar', 'tibar', 'wand').allow(null),
  rice_code_id: Joi.string().optional().uuid().allow(null),
  rate: Joi.number().required().min(0).precision(2),
  broker_id: Joi.string().optional().uuid().allow(null),
  broker_commission: Joi.number().optional().min(0).precision(2).allow(null),
  broker_commission_type: Joi.string().optional().valid('rupees', 'percentage', 'weight').default('percentage'),
  quantity: Joi.number().optional().min(0).precision(2).allow(null),
  cash_discount: Joi.number().optional().min(0).precision(2).allow(null),
  cash_discount_type: Joi.string().optional().valid('rupees', 'percentage').default('rupees'),
  estimated_delivery_time: Joi.number().optional().integer().min(0).allow(null),
  purchaser_id: Joi.string().required().uuid(),
  cooked_rice_image_url: Joi.string().optional().allow(null, '').uri(),
  uncooked_rice_image_url: Joi.string().optional().allow(null, '').uri(),
  status: Joi.string().optional().valid('draft', 'active', 'completed', 'cancelled'),
  notes: Joi.string().optional().allow(null, '').max(1000),
  is_dana_required: Joi.boolean().optional().default(true),
  sauda_date: Joi.string().optional().allow(null, '').isoDate(),
  created_by: Joi.string().optional().uuid(),
});

export const updateSaudaSchema = Joi.object({
  sauda_type: Joi.string().optional().valid('exgodown', 'for'),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella'),
  rice_length: Joi.string().optional().valid('dubar', 'tibar', 'wand').allow(null),
  rice_code_id: Joi.string().optional().uuid().allow(null),
  rate: Joi.number().optional().min(0).precision(2),
  broker_id: Joi.string().optional().uuid().allow(null),
  broker_commission: Joi.number().optional().min(0).precision(2).allow(null),
  broker_commission_type: Joi.string().optional().valid('rupees', 'percentage', 'weight'),
  quantity: Joi.number().optional().min(0).precision(2).allow(null),
  cash_discount: Joi.number().optional().min(0).precision(2).allow(null),
  cash_discount_type: Joi.string().optional().valid('rupees', 'percentage'),
  estimated_delivery_time: Joi.number().optional().integer().min(0).allow(null),
  purchaser_id: Joi.string().optional().uuid(),
  cooked_rice_image_url: Joi.string().optional().allow(null, '').uri(),
  uncooked_rice_image_url: Joi.string().optional().allow(null, '').uri(),
  status: Joi.string().optional().valid('draft', 'active', 'completed', 'cancelled'),
  notes: Joi.string().optional().allow(null, '').max(1000),
  is_dana_required: Joi.boolean().optional(),
  sauda_date: Joi.string().optional().allow(null, '').isoDate(),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Sales Sauda validation schemas
const salesSaudaLineItemSchema = Joi.object({
  product_id: Joi.string().required().uuid(),
  packaging_id: Joi.string().optional().uuid().allow(null),
  packet_count: Joi.number().optional().integer().min(1),
  quantity: Joi.number().optional().min(0.001).precision(3),
  quantity_unit: Joi.string().optional().valid('kg', 'packets').default('kg'),
  rate: Joi.number().required().min(0).precision(2),
  discount_value: Joi.number().optional().min(0).precision(2).default(0),
  discount_type: Joi.string().optional().valid('per_kg', 'percentage').default('per_kg'),
  gst_percent: Joi.number().optional().min(0).precision(2).default(0),
  amount: Joi.any().forbidden(),
  discount_amount: Joi.any().forbidden(),
  gst_amount: Joi.any().forbidden(),
  final_amount: Joi.any().forbidden(),
  sort_order: Joi.number().optional().integer().min(0),
}).or('quantity', 'packet_count');

export const createSalesSaudaSchema = Joi.object({
  sales_party_id: Joi.string().required().uuid(),
  status: Joi.string().optional().valid('draft', 'order', 'cancelled').default('draft'),
  sauda_date: Joi.string().optional().allow(null, '').isoDate(),
  notes: Joi.string().optional().allow(null, '').max(2000),
  payment_terms: Joi.number().optional().integer().min(0).allow(null),
  amount: Joi.any().forbidden(),
  total_amount: Joi.any().forbidden(),
  lines: Joi.array().items(salesSaudaLineItemSchema).optional().min(0),
  created_by: Joi.string().optional().uuid(),
});

export const updateSalesSaudaSchema = Joi.object({
  sales_party_id: Joi.string().optional().uuid(),
  status: Joi.string().optional().valid('draft', 'order', 'cancelled'),
  sauda_date: Joi.string().optional().allow(null, '').isoDate(),
  notes: Joi.string().optional().allow(null, '').max(2000),
  payment_terms: Joi.number().optional().integer().min(0).allow(null),
  amount: Joi.any().forbidden(),
  total_amount: Joi.any().forbidden(),
  lines: Joi.array().items(salesSaudaLineItemSchema).optional(),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Invoice Dispatch validation schemas
export const createInvoiceDispatchSchema = Joi.object({
  sales_sauda_id: Joi.string().required().uuid(),
  godown_id: Joi.string().required().uuid(),
  internal_invoice_number: Joi.string().required().max(100),
  dispatch_date: Joi.string().optional().allow(null, '').isoDate(),
  transporter_id: Joi.string().optional().uuid().allow(null),
  vehicle_id: Joi.string().optional().uuid().allow(null),
  distance_km: Joi.number().optional().min(0).allow(null),
  route_description: Joi.string().optional().allow(null, '').max(1000),
});

// Credit Note validation schemas
const creditNoteLineSchema = Joi.object({
  invoice_dispatch_line_id: Joi.string().required().uuid(),
  product_id: Joi.string().required().uuid(),
  quantity_returned: Joi.number().required().min(0.001).precision(3),
});

export const createCreditNoteSchema = Joi.object({
  invoice_dispatch_id: Joi.string().required().uuid(),
  sales_sauda_id: Joi.string().required().uuid(),
  credit_note_number: Joi.string().required().max(100),
  credit_note_date: Joi.string().optional().allow(null, '').isoDate(),
  reason: Joi.string().optional().allow(null, '').max(2000),
  lines: Joi.array().items(creditNoteLineSchema).required().min(1),
});

// Inward Slip Pass validation schemas
export const createLotSchema = Joi.object({
  sauda_id: Joi.string().required().uuid(),
  godown_id: Joi.string().required().uuid(),
  lot_number: Joi.string().required().max(255),
  rice_code_id: Joi.string().optional().uuid().allow(null),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella').allow(null),
  no_of_bags: Joi.number().required().integer().min(1),
  bag_weight: Joi.number().optional().min(0).precision(2),
  bill_weight: Joi.number().required().min(0).precision(2),
  received_weight: Joi.number().required().min(0).precision(2),
  rate: Joi.number().required().min(0).precision(2),
  /** Set only by server (kaanta flow); clients must not send */
  inward_slip_pass_created_at: Joi.forbidden(),
  created_by: Joi.string().optional().uuid(),
});

export const updateLotSchema = Joi.object({
  godown_id: Joi.forbidden(),
  lot_number: Joi.string().optional().max(255),
  rice_code_id: Joi.string().optional().uuid().allow(null),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella').allow(null),
  no_of_bags: Joi.number().optional().integer().min(1),
  bag_weight: Joi.number().optional().min(0).precision(2).allow(null),
  bill_weight: Joi.number().optional().min(0).precision(2),
  received_weight: Joi.number().optional().min(0).precision(2),
  rate: Joi.number().optional().min(0).precision(2),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Kaanta validation schemas
export const createKaantaSchema = Joi.object({
  godown_id: Joi.string().optional().uuid(),
  sauda_id: Joi.string().required().uuid(),
  inward_slip_pass_id: Joi.string().required().uuid(),
  full_truck_weight: Joi.number().required().min(0).precision(2),
  empty_truck_weight: Joi.number().required().min(0).precision(2),
  said_sent_weight: Joi.number().optional().min(0).precision(2).allow(null),
  bag_weight: Joi.number().required().min(0).precision(2),
  no_of_bags: Joi.number().required().integer().min(1),
  bag_type: Joi.string().required().valid(...BAG_TYPE_VALUES),
  ticket_number: Joi.string().optional().allow(null, '').trim().max(50),
  parchi_vehicle_number: Joi.string().optional().allow(null, '').trim().max(50),
  created_by: Joi.string().optional().uuid(),
});

export const updateKaantaSchema = Joi.object({
  full_truck_weight: Joi.number().optional().min(0).precision(2),
  empty_truck_weight: Joi.number().optional().min(0).precision(2),
  said_sent_weight: Joi.number().optional().min(0).precision(2).allow(null),
  bag_weight: Joi.number().optional().min(0).precision(2),
  no_of_bags: Joi.number().optional().integer().min(1),
  bag_type: Joi.string().optional().valid(...BAG_TYPE_VALUES),
  ticket_number: Joi.string().optional().allow(null, '').trim().max(50),
  parchi_vehicle_number: Joi.string().optional().allow(null, '').trim().max(50),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

export const extractKaantaWeightsSchema = Joi.object({
  inward_slip_pass_id: Joi.string().optional().uuid(),
});

// Vehicle validation schemas
export const createVehicleSchema = Joi.object({
  vehicle_number: Joi.string().required().uppercase().trim().max(50),
  rc_number: Joi.string().optional().allow(null, '').uppercase().trim().max(50),
  owner_name: Joi.string().optional().allow(null, '').trim().max(255),
  vehicle_class: Joi.string().optional().allow(null, '').max(50),
  fuel_type: Joi.string().optional().allow(null, '').max(50),
  maker_model: Joi.string().optional().allow(null, '').max(255),
  registration_date: Joi.date().optional().allow(null).iso(),
  insurance_validity: Joi.date().optional().allow(null).iso(),
  fitness_validity: Joi.date().optional().allow(null).iso(),
  permit_validity: Joi.date().optional().allow(null).iso(),
  challan_details: Joi.array().optional().allow(null),
  transporter_ids: Joi.array().items(Joi.string().uuid()).optional().allow(null),
  is_verified: Joi.boolean().optional().allow(null),
  verified_at: Joi.date().optional().allow(null).iso(),
  verification_details: vehicleVerificationDetailsSchema,
  is_active: Joi.boolean().optional(),
  created_by: Joi.string().optional().uuid(),
});

export const updateVehicleSchema = Joi.object({
  vehicle_number: Joi.string().optional().uppercase().trim().max(50),
  rc_number: Joi.string().optional().allow(null, '').uppercase().trim().max(50),
  owner_name: Joi.string().optional().allow(null, '').trim().max(255),
  vehicle_class: Joi.string().optional().allow(null, '').max(50),
  fuel_type: Joi.string().optional().allow(null, '').max(50),
  maker_model: Joi.string().optional().allow(null, '').max(255),
  registration_date: Joi.date().optional().allow(null).iso(),
  insurance_validity: Joi.date().optional().allow(null).iso(),
  fitness_validity: Joi.date().optional().allow(null).iso(),
  permit_validity: Joi.date().optional().allow(null).iso(),
  challan_details: Joi.array().optional().allow(null),
  transporter_ids: Joi.array().items(Joi.string().uuid()).optional().allow(null),
  is_verified: Joi.boolean().optional().allow(null),
  verified_at: Joi.date().optional().allow(null).iso(),
  verification_details: vehicleVerificationDetailsSchema,
  is_active: Joi.boolean().optional(),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

export const verifyVehicleSchema = Joi.object({
  vehicle_number: Joi.string().required().uppercase().trim(),
  vehicle_id: Joi.string().uuid().optional(),
});

export const createInwardSlipPassSchema = Joi.object({
  sauda_ids: Joi.array().items(Joi.string().uuid()).optional().min(1),
  godown_id: Joi.string().required().uuid(),
  slip_number: Joi.string().optional().allow(null, '').max(255),
  date: Joi.string().required().isoDate(),
  vehicle_id: Joi.string().required().uuid(),
  party_name: Joi.string().required().max(255),
  party_address: Joi.string().optional().allow(null, ''),
  party_gst_number: Joi.string().optional().allow(null, '').length(15),
  party_pan_number: Joi.string().optional().allow(null, '').length(10),
  transporter_id: Joi.string().optional().uuid().allow(null),
  transportation_cost: Joi.number().optional().min(0).precision(2),
  status: Joi.string().optional().valid('pending', 'completed'),
  other_bills: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      url: Joi.string().required().uri(),
      uploaded_at: Joi.string().required().isoDate(),
    })
  ).optional(),
  bill_pdf_url: Joi.string().optional().allow(null, '').uri(),
  bilti_image_url: Joi.string().optional().allow(null, '').uri(),
  bilti_pdf_url: Joi.string().optional().allow(null, '').uri(),
  eway_bill_number: Joi.string().optional().allow(null, '').max(255),
  eway_bill_url: Joi.string().optional().allow(null, '').uri(),
  notes: Joi.string().optional().allow(null, '').max(1000),
  created_by: Joi.string().optional().uuid(),
});

export const updateInwardSlipPassSchema = Joi.object({
  sauda_ids: Joi.array().items(Joi.string().uuid()).optional().min(0),
  godown_id: Joi.string().optional().uuid(),
  slip_number: Joi.string().optional().max(255),
  date: Joi.string().optional().isoDate(),
  vehicle_id: Joi.string().optional().uuid(),
  party_name: Joi.string().optional().max(255),
  party_address: Joi.string().optional().allow(null, ''),
  party_gst_number: Joi.string().optional().allow(null, '').length(15),
  party_pan_number: Joi.string().optional().allow(null, '').length(10),
  transporter_id: Joi.string().optional().uuid().allow(null),
  transportation_cost: Joi.number().optional().min(0).precision(2),
  status: Joi.string().optional().valid('pending', 'completed'),
  other_bills: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      url: Joi.string().required().uri(),
      uploaded_at: Joi.string().required().isoDate(),
    })
  ).optional(),
  bill_pdf_url: Joi.string().optional().allow(null, '').uri(),
  bilti_image_url: Joi.string().optional().allow(null, '').uri(),
  bilti_pdf_url: Joi.string().optional().allow(null, '').uri(),
  eway_bill_number: Joi.string().optional().allow(null, '').max(255),
  eway_bill_url: Joi.string().optional().allow(null, '').uri(),
  notes: Joi.string().optional().allow(null, '').max(1000),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Purchase validation schemas
export const createPurchaseSchema = Joi.object({
  vendor_id: Joi.string().required().uuid(),
  sauda_ids: Joi.array().items(Joi.string().uuid()).optional(),
  inward_slip_pass_ids: Joi.array().items(Joi.string().uuid()).optional(),
  lot_ids: Joi.array().items(Joi.string().uuid()).optional(),
  broker_id: Joi.string().optional().uuid().allow(null),
  broker_commission: Joi.number().optional().min(0).precision(2),
  broker_commission_type: Joi.string().optional().valid('rupees', 'percentage', 'weight').default('percentage'),
  cash_discount: Joi.number().optional().min(0).precision(2),
  cash_discount_type: Joi.string().optional().valid('rupees', 'percentage').default('rupees'),
  transportation_cost: Joi.number().optional().min(0).precision(2),
  invoice_number: Joi.string().optional().allow(null, '').max(255),
  invoice_date: Joi.string().optional().allow(null, '').isoDate(),
  rate: Joi.number().optional().min(0).precision(2),
  total_weight: Joi.number().optional().min(0).precision(2),
  total_amount: Joi.number().optional().min(0).precision(2),
  igst_amount: Joi.number().optional().min(0).precision(2),
  igst_percentage: Joi.number().optional().min(0).max(100).precision(2),
  freight_status: Joi.string().optional().allow(null, '').max(50),
  truck_number: Joi.string().optional().allow(null, '').max(50),
  transport_name: Joi.string().optional().allow(null, '').max(255),
  goods_dispatched_from: Joi.string().optional().allow(null, '').max(255),
  goods_dispatched_to: Joi.string().optional().allow(null, '').max(255),
  purchase_date: Joi.string().required().isoDate(),
  expected_quantity: Joi.number().optional().min(0).precision(2),
  notes: Joi.string().optional().allow(null, '').max(1000),
  created_by: Joi.string().optional().uuid(),
});

export const updatePurchaseSchema = Joi.object({
  broker_id: Joi.string().optional().uuid().allow(null),
  broker_commission: Joi.number().optional().min(0).precision(2),
  broker_commission_type: Joi.string().optional().valid('rupees', 'percentage', 'weight'),
  payment_advice_id: Joi.string().optional().uuid().allow(null),
  cash_discount: Joi.number().optional().min(0).precision(2),
  cash_discount_type: Joi.string().optional().valid('rupees', 'percentage'),
  transportation_cost: Joi.number().optional().min(0).precision(2),
  invoice_number: Joi.string().optional().allow(null, '').max(255),
  invoice_date: Joi.string().optional().allow(null, '').isoDate(),
  rate: Joi.number().optional().min(0).precision(2),
  total_weight: Joi.number().optional().min(0).precision(2),
  total_amount: Joi.number().optional().min(0).precision(2),
  igst_amount: Joi.number().optional().min(0).precision(2),
  igst_percentage: Joi.number().optional().min(0).max(100).precision(2),
  freight_status: Joi.string().optional().allow(null, '').max(50),
  truck_number: Joi.string().optional().allow(null, '').max(50),
  transport_name: Joi.string().optional().allow(null, '').max(255),
  goods_dispatched_from: Joi.string().optional().allow(null, '').max(255),
  goods_dispatched_to: Joi.string().optional().allow(null, '').max(255),
  purchase_date: Joi.string().optional().isoDate(),
  expected_quantity: Joi.number().optional().min(0).precision(2),
  notes: Joi.string().optional().allow(null, '').max(1000),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Payment Advice validation schemas
const paymentAdviceChargeSchema = Joi.object({
  charge_name: Joi.string().required().max(255),
  charge_value: Joi.number().required().min(0).precision(2),
  charge_type: Joi.string().optional().valid('percentage', 'fixed'),
});

export const createPaymentAdviceSchema = Joi.object({
  sauda_id: Joi.string().optional().uuid().allow(null, ''),
  inward_slip_pass_id: Joi.string().optional().uuid().allow(null, ''),
  payer_id: Joi.string().optional().uuid().allow(null, ''),
  recipient_id: Joi.string().optional().uuid().allow(null, ''),
  sr_number: Joi.string().optional().allow(null, '').max(50),
  party_name: Joi.string().optional().allow(null, '').max(255),
  party_address: Joi.string().optional().allow(null, ''),
  broker_name: Joi.string().optional().allow(null, '').max(255),
  invoice_number: Joi.string().optional().allow(null, '').max(255),
  invoice_date: Joi.string().optional().allow(null, '').isoDate(),
  bill_number: Joi.string().optional().allow(null, '').max(255),
  truck_number: Joi.string().optional().allow(null, '').max(50),
  item: Joi.string().optional().allow(null, '').max(100),
  total_bags: Joi.number().optional().integer().min(0),
  due_date: Joi.string().optional().allow(null, '').isoDate(),
  bill_weight: Joi.number().optional().min(0).precision(2),
  kanta_weight: Joi.number().optional().min(0).precision(2),
  dana_deduction: Joi.number().optional().min(0).precision(2),
  final_weight: Joi.number().optional().min(0).precision(2),
  rate: Joi.number().optional().min(0).precision(2),
  amount: Joi.number().optional().min(0).precision(2), // Optional - auto-calculated from sauda/ISP summary
  transaction_id: Joi.string().optional().allow(null, '').max(255),
  date_of_payment: Joi.string().required().isoDate(),
  status: Joi.string().optional().valid('pending', 'completed', 'failed'),
  payment_slip_image_url: Joi.string().optional().allow(null, '').uri(),
  notes: Joi.string().optional().allow(null, '').max(1000),
  charges: Joi.array().items(paymentAdviceChargeSchema).optional(),
  created_by: Joi.string().optional().uuid(),
}).custom((value, helpers) => {
  // Convert empty strings to null
  if (value.payer_id === '') value.payer_id = null;
  if (value.recipient_id === '') value.recipient_id = null;
  if (value.sauda_id === '') value.sauda_id = null;
  if (value.inward_slip_pass_id === '') value.inward_slip_pass_id = null;
  
  // At least one of sauda_id or inward_slip_pass_id must be provided
  if (!value.sauda_id && !value.inward_slip_pass_id) {
    return helpers.error('any.custom', { message: 'Either sauda_id or inward_slip_pass_id must be provided' });
  }
  return value;
});

export const paymentAdvicePreviewQuerySchema = Joi.object({
  sauda_id: Joi.string().optional().uuid(),
  inward_slip_pass_id: Joi.string().optional().uuid(),
  godown_id: Joi.string().optional().uuid(),
  total_charges: Joi.number().optional().min(0).precision(2).default(0),
}).custom((value, helpers) => {
  if (!value.sauda_id && !value.inward_slip_pass_id) {
    return helpers.error('any.custom', {
      message: 'Either sauda_id or inward_slip_pass_id must be provided',
    });
  }
  return value;
});

export const updatePaymentAdviceSchema = Joi.object({
  sauda_id: Joi.string().optional().uuid().allow(null, ''),
  inward_slip_pass_id: Joi.string().optional().uuid().allow(null, ''),
  payer_id: Joi.string().optional().uuid().allow(null, ''),
  recipient_id: Joi.string().optional().uuid().allow(null, ''),
  sr_number: Joi.string().optional().allow(null, '').max(50),
  party_name: Joi.string().optional().allow(null, '').max(255),
  party_address: Joi.string().optional().allow(null, ''),
  broker_name: Joi.string().optional().allow(null, '').max(255),
  invoice_number: Joi.string().optional().allow(null, '').max(255),
  invoice_date: Joi.string().optional().allow(null, '').isoDate(),
  bill_number: Joi.string().optional().allow(null, '').max(255),
  truck_number: Joi.string().optional().allow(null, '').max(50),
  item: Joi.string().optional().allow(null, '').max(100),
  total_bags: Joi.number().optional().integer().min(0),
  due_date: Joi.string().optional().allow(null, '').isoDate(),
  bill_weight: Joi.number().optional().min(0).precision(2),
  kanta_weight: Joi.number().optional().min(0).precision(2),
  dana_deduction: Joi.number().optional().min(0).precision(2),
  final_weight: Joi.number().optional().min(0).precision(2),
  rate: Joi.number().optional().min(0).precision(2),
  amount: Joi.number().optional().min(0).precision(2),
  transaction_id: Joi.string().optional().allow(null, '').max(255),
  date_of_payment: Joi.string().optional().isoDate(),
  status: Joi.string().optional().valid('pending', 'completed', 'failed'),
  payment_slip_image_url: Joi.string().optional().allow(null, '').uri(),
  notes: Joi.string().optional().allow(null, '').max(1000),
  updated_by: Joi.string().optional().uuid(),
  charges: Joi.array().items(paymentAdviceChargeSchema).optional(),
}).custom((value) => {
  // Convert empty strings to null
  if (value.payer_id === '') value.payer_id = null;
  if (value.recipient_id === '') value.recipient_id = null;
  if (value.sauda_id === '') value.sauda_id = null;
  if (value.inward_slip_pass_id === '') value.inward_slip_pass_id = null;
  return value;
}).min(1);

export const createPaymentAdviceChargeSchema = Joi.object({
  charge_name: Joi.string().required().max(255),
  charge_value: Joi.number().required().min(0).precision(2),
  charge_type: Joi.string().optional().valid('percentage', 'fixed'),
});

// Recipe validation schemas
const recipeFormulaItemSchema = Joi.object({
  lot_id: Joi.string().required().uuid(),
  percentage: Joi.number().required().min(0).max(100).precision(2),
});

export const createRecipeSchema = Joi.object({
  recipe_name: Joi.string().required().min(1).max(255),
  formula: Joi.array().items(recipeFormulaItemSchema).required().min(1),
  created_by: Joi.string().optional().uuid(),
});

export const updateRecipeSchema = Joi.object({
  recipe_name: Joi.string().optional().min(1).max(255),
  formula: Joi.array().items(recipeFormulaItemSchema).optional().min(1),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

export const recipeCostPreviewByFormulaSchema = Joi.object({
  quantity_kg: Joi.number().required().min(0.001).precision(3),
  formula: Joi.array().items(recipeFormulaItemSchema).required().min(1),
});

export const recipeCostPreviewByRecipeIdSchema = Joi.object({
  quantity_kg: Joi.number().required().min(0.001).precision(3),
});

// Product validation schemas
export const createProductSchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  description: Joi.string().optional().allow(null, ''),
  brand: Joi.string().optional().valid('Tamara', 'Hariom').allow(null, ''),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella').allow(null, ''),
  created_by: Joi.string().optional().uuid(),
});

export const updateProductSchema = Joi.object({
  name: Joi.string().optional().min(1).max(255),
  description: Joi.string().optional().allow(null, ''),
  brand: Joi.string().optional().valid('Tamara', 'Hariom').allow(null, ''),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella').allow(null, ''),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

/** Body for PUT /products/:id/rates — set suggested rates per holding capacity */
export const setProductRatesSchema = Joi.object({
  rates: Joi.array()
    .items(
      Joi.object({
        holding_capacity: Joi.number().required().valid(5, 10, 25, 26, 30, 50),
        rate: Joi.number().required().min(0).precision(2),
      })
    )
    .required()
    .min(1),
});

/** Query for GET /products/:id/rates/history */
export const productRateHistoryQuerySchema = Joi.object({
  holding_capacity: Joi.number().optional().valid(5, 10, 25, 26, 30, 50),
  from: Joi.string().optional().isoDate(),
  to: Joi.string().optional().isoDate(),
  limit: Joi.number().integer().min(1).max(5000).default(2000),
  offset: Joi.number().integer().min(0).default(0),
});

/** Query params for GET /suggested-rate (product_id, packaging_id) */
export const suggestedRateQuerySchema = Joi.object({
  product_id: Joi.string().required().uuid(),
  packaging_id: Joi.string().required().uuid(),
});

// Packaging validation schemas
export const createPackagingSchema = Joi.object({
  product_id: Joi.string().required().uuid(),
  holding_capacity: Joi.number().required().valid(5, 10, 25, 26, 30, 50),
  packet_type: Joi.string().required().min(1).max(255),
  packaging_vendor_id: Joi.string().optional().uuid().allow(null, ''),
  ordered_weight: Joi.number().optional().min(0).precision(2).allow(null, ''),
  initial_packets: Joi.number().optional().integer().min(0).allow(null), // Optional: initial number of empty packets
  godown_id: Joi.when('initial_packets', {
    is: Joi.number().greater(0),
    then: Joi.string().required().uuid(),
    otherwise: Joi.string().optional().uuid().allow(null, ''),
  }),
  empty_bag_weight_kg: Joi.when('initial_packets', {
    is: Joi.number().greater(0),
    then: Joi.number().required().greater(0).precision(4),
    otherwise: Joi.number().optional().allow(null).precision(4),
  }),
  empty_bag_rate_per_kg: Joi.when('initial_packets', {
    is: Joi.number().greater(0),
    then: Joi.number().required().min(0).precision(4),
    otherwise: Joi.number().optional().allow(null).precision(4),
  }),
  empty_bag_gst_percent: Joi.when('initial_packets', {
    is: Joi.number().greater(0),
    then: Joi.number().required().min(0).max(100).precision(2),
    otherwise: Joi.number().optional().allow(null).min(0).max(100).precision(2),
  }),
  bill_number: Joi.string().optional().allow(null, '').max(255),
  bill_date: Joi.alternatives()
    .try(Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/), Joi.valid(null, ''))
    .optional(),
  packaging_bill_url: Joi.string().optional().allow(null, '').uri(),
  created_by: Joi.string().optional().uuid(),
});

export const updatePackagingSchema = Joi.object({
  holding_capacity: Joi.number().optional().valid(5, 10, 25, 26, 30, 50),
  packet_type: Joi.string().optional().min(1).max(255),
  packaging_vendor_id: Joi.string().optional().uuid().allow(null, ''),
  ordered_weight: Joi.number().optional().min(0).precision(2).allow(null, ''),
  empty_bag_weight_kg: Joi.number().optional().positive().precision(4),
  empty_bag_rate_per_kg: Joi.number().optional().min(0).precision(4),
  empty_bag_gst_percent: Joi.number().optional().min(0).max(100).precision(2),
  bill_number: Joi.string().optional().allow(null, '').max(255),
  bill_date: Joi.alternatives()
    .try(Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/), Joi.valid(null, ''))
    .optional(),
  packaging_bill_url: Joi.string().optional().allow(null, '').uri(),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Packaging Vendor validation schemas
export const createPackagingVendorSchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).required().min(1),
  address: addressSchema.required(),
  gst_number: Joi.string().optional().allow(null, '').max(50),
  created_by: Joi.string().optional().uuid(),
});

export const updatePackagingVendorSchema = Joi.object({
  name: Joi.string().optional().min(1).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1),
      emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
    })
  ).optional().min(1),
  address: addressSchema.optional(),
  gst_number: Joi.string().optional().allow(null, '').max(50),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Godown validation schemas (contact_persons matches vendors)
export const createGodownSchema = Joi.object({
  name: Joi.string().required().trim().max(255),
  gst_number: Joi.string().optional().allow(null, '').length(15).uppercase(),
  address: addressSchema.required(),
  google_maps_link: Joi.string().trim().max(2048).optional().allow(null, ''),
  contact_persons: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required().min(2).max(255),
        phones: Joi.array().items(Joi.string().max(20)).required().min(1),
        emails: Joi.array().items(Joi.string().email().allow('', null)).optional(),
      })
    )
    .required()
    .min(1),
  is_active: Joi.boolean().optional(),
  created_by: Joi.string().optional().uuid(),
});

export const updateGodownSchema = Joi.object({
  name: Joi.string().optional().trim().max(255),
  gst_number: Joi.string().optional().allow(null, '').length(15).uppercase(),
  address: addressSchema.optional(),
  google_maps_link: Joi.string().trim().max(2048).optional().allow(null, ''),
  contact_persons: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required().min(2).max(255),
        phones: Joi.array().items(Joi.string().max(20)).required().min(1),
        emails: Joi.array().items(Joi.string().email().allow('', null)).optional(),
      })
    )
    .min(1)
    .optional(),
  is_active: Joi.boolean().optional(),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Batch validation schemas (Stage 1: Recipe attachment)
export const createBatchSchema = Joi.object({
  godown_id: Joi.string().required().uuid(),
  recipe_id: Joi.string().required().uuid(),
  quantity: Joi.number().required().min(0.01).precision(2),
  batch_number: Joi.string().optional().max(255),
  status: Joi.string().optional().valid('planned', 'in_progress', 'recipe_attached', 'ready_to_pack', 'packaged', 'completed', 'cancelled'),
  created_by: Joi.string().optional().uuid(),
});

export const updateBatchSchema = Joi.object({
  status: Joi.string().optional().valid('planned', 'in_progress', 'recipe_attached', 'ready_to_pack', 'packaged', 'completed', 'cancelled'),
  quantity: Joi.number().optional().min(0.01).precision(2),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Batch Product validation schemas (Stage 2)
export const createBatchProductSchema = Joi.object({
  product_id: Joi.string().required().uuid(),
  cost: Joi.number().optional().min(0).precision(2).allow(null),
  created_by: Joi.string().optional().uuid(),
});

// Batch Packaging validation schemas (Stage 3)
export const createBatchPackagingSchema = Joi.object({
  product_id: Joi.string().required().uuid(),
  packaging_id: Joi.string().required().uuid(),
  quantity: Joi.number().required().min(0.01).precision(2),
  created_by: Joi.string().optional().uuid(),
});

// Quality parameters (batch / inward slip / product)
const optionalNullableUuid = Joi.alternatives()
  .try(Joi.string().uuid(), Joi.valid(null, ''))
  .optional();

const optionalNullableParamSpec = Joi.string().optional().allow(null, '').max(2000);

export const listParametersQuerySchema = Joi.object({
  batch_id: Joi.string().optional().uuid(),
  product_id: Joi.string().optional().uuid(),
  inward_slip_pass_id: Joi.string().optional().uuid(),
});

export const createParameterSchema = Joi.object({
  inward_slip_pass_id: optionalNullableUuid,
  product_id: optionalNullableUuid,
  batch_id: optionalNullableUuid,
  purity: optionalNullableParamSpec,
  natural_admixture: optionalNullableParamSpec,
  average_grain_length: optionalNullableParamSpec,
  moisture: optionalNullableParamSpec,
  broken_grain: optionalNullableParamSpec,
  damage_discolour_grain: optionalNullableParamSpec,
  immature_grains: optionalNullableParamSpec,
  whiteness: optionalNullableParamSpec,
  foreign_matter: optionalNullableParamSpec,
  black_grains: optionalNullableParamSpec,
  created_by: Joi.string().optional().uuid(),
});

export const updateParameterSchema = Joi.object({
  inward_slip_pass_id: optionalNullableUuid,
  product_id: optionalNullableUuid,
  batch_id: optionalNullableUuid,
  purity: optionalNullableParamSpec,
  natural_admixture: optionalNullableParamSpec,
  average_grain_length: optionalNullableParamSpec,
  moisture: optionalNullableParamSpec,
  broken_grain: optionalNullableParamSpec,
  damage_discolour_grain: optionalNullableParamSpec,
  immature_grains: optionalNullableParamSpec,
  whiteness: optionalNullableParamSpec,
  foreign_matter: optionalNullableParamSpec,
  black_grains: optionalNullableParamSpec,
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Packets Inventory validation schemas
export const createPacketsInventorySchema = Joi.object({
  godown_id: Joi.string().required().uuid(),
  packaging_id: Joi.string().required().uuid(),
  available_quantity: Joi.number().required().integer().min(0),
  created_by: Joi.string().optional().uuid(),
});

export const updatePacketsInventorySchema = Joi.object({
  available_quantity: Joi.number().optional().integer().min(0),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

/** Additional addresses per vendor (table vendor_sites); shape matches vendors.address */
export const createVendorSiteSchema = Joi.object({
  vendor_id: Joi.string().required().uuid(),
  name: Joi.string().optional().allow(null, '').max(255),
  address: addressSchema.required(),
  google_location_link: Joi.string().optional().allow(null, '').max(2000),
  is_active: Joi.boolean().optional(),
});

export const updateVendorSiteSchema = Joi.object({
  name: Joi.string().optional().allow(null, '').max(255),
  address: addressSchema.optional(),
  google_location_link: Joi.string().optional().allow(null, '').max(2000),
  is_active: Joi.boolean().optional(),
}).min(1);

/** Additional addresses per sales party (table sales_party_sites); shape matches sales_parties.address */
export const createSalesPartySiteSchema = Joi.object({
  sales_party_id: Joi.string().required().uuid(),
  name: Joi.string().optional().allow(null, '').max(255),
  address: addressSchema.required(),
  google_location_link: Joi.string().optional().allow(null, '').max(2000),
  is_active: Joi.boolean().optional(),
});

export const updateSalesPartySiteSchema = Joi.object({
  name: Joi.string().optional().allow(null, '').max(255),
  address: addressSchema.optional(),
  google_location_link: Joi.string().optional().allow(null, '').max(2000),
  is_active: Joi.boolean().optional(),
}).min(1);

const driverLicenseSchema = Joi.string()
  .required()
  .trim()
  .min(5)
  .max(50)
  .pattern(/^[A-Za-z0-9\-/\s]+$/, 'driving license number');

const driverPhoneSchema = Joi.string()
  .required()
  .custom((value, helpers) => {
    const digits = value.replace(/\D/g, '');
    if ((digits.startsWith('91') && digits.length === 12) || digits.length === 10) {
      return value;
    }
    return helpers.error('string.pattern.base', { name: 'phone' });
  }, 'Indian phone validation');

const optionalDriverLicenseSchema = Joi.string()
  .trim()
  .min(5)
  .max(50)
  .pattern(/^[A-Za-z0-9\-/\s]+$/, 'driving license number');

const driverVerifyDobSchema = Joi.string()
  .optional()
  .allow(null, '')
  .custom((value, helpers) => {
    if (value === null || value === undefined || String(value).trim() === '') {
      return undefined;
    }
    const normalized = normalizeDriverDobForSurepass(value);
    if (!normalized) {
      return helpers.error('any.invalid');
    }
    return normalized;
  }, 'driver DOB normalization');

export const verifyDriverSchema = Joi.object({
  license_number: optionalDriverLicenseSchema.optional(),
  id_number: optionalDriverLicenseSchema.optional(),
  dob: driverVerifyDobSchema,
  date_of_birth: driverVerifyDobSchema,
  driver_id: uuidSchema.optional(),
  entity_type: Joi.string().optional().valid('vendor', 'broker', 'transporter', 'driver', 'vehicle'),
  entity_id: uuidSchema.optional(),
  persist_entity_type: Joi.string().optional().valid('vendor', 'broker', 'transporter', 'driver', 'vehicle'),
  persist_entity_id: uuidSchema.optional(),
}).or('license_number', 'id_number');

/** Saved-driver verify: licence defaults to stored value on the record. */
export const verifyDriverByIdSchema = Joi.object({
  license_number: optionalDriverLicenseSchema.optional(),
  id_number: optionalDriverLicenseSchema.optional(),
  dob: driverVerifyDobSchema,
  date_of_birth: driverVerifyDobSchema,
});

export const rcChallanDetailsSchema = Joi.object({
  rc_number: Joi.string().required().trim().min(4).max(20),
  chassis_number: Joi.string().required().trim().min(5).max(30),
  engine_number: Joi.string().required().trim().min(3).max(30),
  state_only: Joi.boolean().optional().default(false),
  state_portal: Joi.array().items(Joi.string().trim().uppercase().length(2)).optional(),
  entity_type: Joi.string().optional().valid('vendor', 'broker', 'transporter', 'driver', 'vehicle'),
  entity_id: uuidSchema.optional(),
  persist_entity_type: Joi.string().optional().valid('vendor', 'broker', 'transporter', 'driver', 'vehicle'),
  persist_entity_id: uuidSchema.optional(),
});

export const rcFullSchema = Joi.object({
  id_number: Joi.string().required().trim().uppercase().min(4).max(20),
  state_only: Joi.boolean().optional().default(false),
  state_portal: Joi.array().items(Joi.string().trim().uppercase().length(2)).optional(),
  entity_type: Joi.string().optional().valid('vendor', 'broker', 'transporter', 'driver', 'vehicle'),
  entity_id: uuidSchema.optional(),
  persist_entity_type: Joi.string().optional().valid('vendor', 'broker', 'transporter', 'driver', 'vehicle'),
  persist_entity_id: uuidSchema.optional(),
});

const driverOptionalDateSchema = Joi.string().optional().allow(null, '').isoDate();

export const createDriverSchema = Joi.object({
  license_number: driverLicenseSchema,
  phone: driverPhoneSchema,
  name: Joi.string().optional().allow(null, '').min(1).max(255),
  date_of_birth: driverOptionalDateSchema,
  license_expires_at: driverOptionalDateSchema,
  doe: driverOptionalDateSchema,
  transport_license_expires_at: Joi.string().optional().allow(null, ''),
  transport_doe: Joi.string().optional().allow(null, ''),
  father_or_husband_name: Joi.string().optional().allow(null, '').max(255),
  state: Joi.string().optional().allow(null, '').max(100),
  city_name: Joi.string().optional().allow(null, '').max(255),
  address: Joi.string().optional().allow(null, '').max(2000),
  pincode: Joi.string().optional().allow(null, '').max(10),
  gender: Joi.string().optional().allow(null, '').max(10),
  profile_image: Joi.string().optional().allow(null, ''),
  vehicle_classes: Joi.array().items(Joi.string().trim().max(20)).optional(),
  is_verified: Joi.boolean().optional(),
  verified_at: Joi.string().optional().allow(null, ''),
  verification_details: Joi.any().optional().allow(null),
  is_active: Joi.boolean().optional(),
});

export const updateDriverSchema = Joi.object({
  license_number: driverLicenseSchema.optional(),
  phone: driverPhoneSchema.optional(),
  name: Joi.string().optional().allow(null, '').min(1).max(255),
  date_of_birth: driverOptionalDateSchema,
  license_expires_at: driverOptionalDateSchema,
  doe: driverOptionalDateSchema,
  transport_license_expires_at: Joi.string().optional().allow(null, ''),
  transport_doe: Joi.string().optional().allow(null, ''),
  father_or_husband_name: Joi.string().optional().allow(null, '').max(255),
  state: Joi.string().optional().allow(null, '').max(100),
  city_name: Joi.string().optional().allow(null, '').max(255),
  address: Joi.string().optional().allow(null, '').max(2000),
  pincode: Joi.string().optional().allow(null, '').max(10),
  gender: Joi.string().optional().allow(null, '').max(10),
  profile_image: Joi.string().optional().allow(null, ''),
  vehicle_classes: Joi.array().items(Joi.string().trim().max(20)).optional(),
  is_verified: Joi.boolean().optional(),
  verified_at: Joi.string().optional().allow(null, ''),
  verification_details: Joi.any().optional().allow(null),
  is_active: Joi.boolean().optional(),
}).min(1);


