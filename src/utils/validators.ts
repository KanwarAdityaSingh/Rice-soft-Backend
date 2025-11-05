import Joi from 'joi';
import { ValidationError } from './errors';

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

export const createUserSchema = Joi.object({
  username: Joi.string().required().min(3).max(100),
  email: Joi.string().required().email(),
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
  email: Joi.string().required().email(),
  is_active: Joi.boolean().optional(),
});

export const updateSalesmanSchema = Joi.object({
  name: Joi.string().optional().min(2).max(255),
  phone: Joi.string().optional().max(20),
  email: Joi.string().optional().email(),
  is_active: Joi.boolean().optional(),
}).min(1);

// Address validation schema (reusable)
const addressSchema = Joi.object({
  street: Joi.string().required().max(255),
  city: Joi.string().required().max(100),
  state: Joi.string().required().max(100),
  pincode: Joi.string().required().max(10),
  country: Joi.string().required().max(100),
});

// Business details validation schema (reusable - for vendors, etc.)
const businessDetailsSchema = Joi.object({
  pan_number: Joi.string().optional().allow(null, '').length(10),
  gst_number: Joi.string().optional().allow(null, '').length(15),
  registration_number: Joi.string().optional().allow(null, '').max(50),
  business_type: Joi.string().optional().valid('individual', 'partnership', 'company', 'llp'),
});

// Business details validation schema for brokers (PAN or Aadhaar required, no GST)
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
  registration_number: Joi.string().optional().allow(null, '').max(50),
  business_type: Joi.string().optional().valid('individual', 'partnership', 'company', 'llp'),
}).custom((value, helpers) => {
  // Require either PAN or Aadhaar (at least one must be provided)
  const hasPAN = value.pan_number && value.pan_number.trim() !== '';
  const hasAadhaar = value.aadhaar_number && value.aadhaar_number.trim() !== '';
  
  if (!hasPAN && !hasAadhaar) {
    return helpers.error('custom.panOrAadhaarRequired');
  }
  
  return value;
}).messages({
  'custom.panOrAadhaarRequired': 'Either PAN number or Aadhaar number must be provided'
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
export const createVendorSchema = Joi.object({
  business_name: Joi.string().required().min(2).max(255),
  contact_person: Joi.string().required().min(2).max(255),
  email: Joi.string().optional().allow(null, '').email(),
  phone: Joi.string().required().max(20),
  address: addressSchema.required(),
  business_details: businessDetailsSchema.required(),
  bank_details: bankDetailsSchema.optional(),
  type: Joi.string().required().valid('purchaser', 'seller', 'both'),
  is_active: Joi.boolean().optional(),
});

export const updateVendorSchema = Joi.object({
  business_name: Joi.string().optional().min(2).max(255),
  contact_person: Joi.string().optional().min(2).max(255),
  email: Joi.string().optional().email(),
  phone: Joi.string().optional().max(20),
  address: addressSchema.optional(),
  business_details: businessDetailsSchema.optional(),
  bank_details: bankDetailsSchema.optional(),
  type: Joi.string().optional().valid('purchaser', 'seller', 'both'),
  is_active: Joi.boolean().optional(),
}).min(1);

// Broker details validation schema
const brokerDetailsSchema = Joi.object({
  commission_rate: Joi.number().optional().min(0).max(100),
  specialization: Joi.string().optional().allow(null, '').max(255),
  experience_years: Joi.string().optional().max(100),
});

// Broker validation schemas
export const createBrokerSchema = Joi.object({
  business_name: Joi.string().required().min(2).max(255),
  contact_person: Joi.string().required().min(2).max(255),
  email: Joi.string().required().email(),
  phone: Joi.string().required().max(20),
  address: addressSchema.required(),
  business_details: brokerBusinessDetailsSchema.required(),
  broker_details: brokerDetailsSchema.optional(),
  type: Joi.string().required().valid('purchase', 'sale', 'both'),
  is_active: Joi.boolean().optional(),
});

export const updateBrokerSchema = Joi.object({
  business_name: Joi.string().optional().min(2).max(255),
  contact_person: Joi.string().optional().min(2).max(255),
  email: Joi.string().optional().email(),
  phone: Joi.string().optional().max(20),
  address: addressSchema.optional(),
  business_details: brokerBusinessDetailsSchema.optional(),
  broker_details: brokerDetailsSchema.optional(),
  type: Joi.string().optional().valid('purchase', 'sale', 'both'),
  is_active: Joi.boolean().optional(),
}).min(1);

// Lead validation schemas
export const createLeadSchema = Joi.object({
  company_name: Joi.string().required().min(2).max(255),
  contact_person: Joi.string().required().min(2).max(255),
  email: Joi.string().optional().allow(null, '').email(),
  phone: Joi.string().optional().max(20),
  address: addressSchema.optional(),
  business_details: Joi.object({
    pan_number: Joi.string().length(10),
    gst_number: Joi.string().length(15),
    industry: Joi.string().max(100),
    company_size: Joi.string().max(50),
    annual_revenue: Joi.number().min(0),
  }).optional(),
  is_existing_customer: Joi.boolean().optional(),
  lead_status: Joi.string().optional().valid('new', 'contacted', 'engaged', 'converted', 'rejected'),
  customer_status: Joi.string().optional().max(100),
  assigned_to: Joi.string().optional().uuid(),
  broker_id: Joi.string().optional().uuid(),
  rice_code_id: Joi.string().required().uuid(),
  rice_type: Joi.string().required().valid('basmati', 'non_basmati', 'parboiled', 'raw'),
  notes: Joi.string().optional().max(1000),
  priority: Joi.string().optional().valid('low', 'medium', 'high', 'urgent'),
  source: Joi.string().optional().max(100),
  estimated_value: Joi.number().optional().min(0),
  expected_close_date: Joi.date().optional(),
  salesman_latitude: Joi.number().optional().precision(8),
  salesman_longitude: Joi.number().optional().precision(8),
});

export const updateLeadSchema = Joi.object({
  company_name: Joi.string().optional().min(2).max(255),
  contact_person: Joi.string().optional().min(2).max(255),
  email: Joi.string().optional().email(),
  phone: Joi.string().optional().max(20),
  address: addressSchema.optional(),
  business_details: Joi.object({
    pan_number: Joi.string().length(10),
    gst_number: Joi.string().length(15),
    industry: Joi.string().max(100),
    company_size: Joi.string().max(50),
    annual_revenue: Joi.number().min(0),
  }).optional(),
  is_existing_customer: Joi.boolean().optional(),
  lead_status: Joi.string().optional().valid('new', 'contacted', 'engaged', 'converted', 'rejected'),
  customer_status: Joi.string().optional().max(100),
  assigned_to: Joi.string().optional().uuid(),
  broker_id: Joi.string().optional().uuid(),
  rice_code_id: Joi.string().optional().uuid(),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw'),
  notes: Joi.string().optional().max(1000),
  priority: Joi.string().optional().valid('low', 'medium', 'high', 'urgent'),
  source: Joi.string().optional().max(100),
  estimated_value: Joi.number().optional().min(0),
  expected_close_date: Joi.date().optional(),
  salesman_latitude: Joi.number().optional().precision(8),
  salesman_longitude: Joi.number().optional().precision(8),
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

