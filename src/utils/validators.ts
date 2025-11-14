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
const addressSchema = Joi.object({
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
  google_location_link: Joi.string().optional().allow(null, '').max(500),
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
  google_location_link: Joi.string().optional().allow(null, '').max(500),
}).min(1);

// Broker details validation schema
const brokerDetailsSchema = Joi.object({
  commission_rate: Joi.number().optional().min(0).max(100),
  specialization: Joi.string().optional().allow(null, '').max(255),
  experience_years: Joi.string().optional().allow(null, '').max(100),
});

// Broker validation schemas
export const createBrokerSchema = Joi.object({
  business_name: Joi.string().required().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1)
    })
  ).optional().min(1),
  // Legacy field - will be converted to contact_persons
  contact_person: Joi.string().optional().min(2).max(255),
  email: Joi.string().required().email(),
  phone: Joi.string().required().max(20),
  address: addressSchema.required(),
  business_details: brokerBusinessDetailsSchema.required(),
  broker_details: brokerDetailsSchema.optional(),
  type: Joi.string().required().valid('purchase', 'sale', 'both'),
  is_active: Joi.boolean().optional(),
}).custom((value, helpers) => {
  // Convert legacy contact_person to contact_persons if needed
  if (value.contact_person && !value.contact_persons) {
    value.contact_persons = [{
      name: value.contact_person,
      phones: value.phone ? [value.phone] : []
    }];
    delete value.contact_person;
  }
  
  // Ensure contact_persons is provided
  if (!value.contact_persons || value.contact_persons.length === 0) {
    return helpers.error('custom.contactPersonsRequired');
  }
  
  return value;
}).messages({
  'custom.contactPersonsRequired': 'Either contact_persons or contact_person must be provided'
});

export const updateBrokerSchema = Joi.object({
  business_name: Joi.string().optional().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1)
    })
  ).optional().min(1),
  // Legacy field - will be converted to contact_persons
  contact_person: Joi.string().optional().min(2).max(255),
  email: Joi.string().optional().email(),
  phone: Joi.string().optional().max(20),
  address: addressSchema.optional(),
  business_details: brokerBusinessDetailsSchema.optional(),
  broker_details: brokerDetailsSchema.optional(),
  type: Joi.string().optional().valid('purchase', 'sale', 'both'),
  is_active: Joi.boolean().optional(),
}).custom((value) => {
  // Convert legacy contact_person to contact_persons if needed
  if (value.contact_person && !value.contact_persons) {
    // Use phone from value if available, otherwise empty array
    value.contact_persons = [{
      name: value.contact_person,
      phones: value.phone ? [value.phone] : []
    }];
    delete value.contact_person;
  }
  
  return value;
}).min(1);

// Lead validation schemas
export const createLeadSchema = Joi.object({
  company_name: Joi.string().required().min(2).max(255),
  contact_persons: Joi.array().items(
    Joi.object({
      name: Joi.string().required().min(2).max(255),
      phones: Joi.array().items(Joi.string().max(20)).required().min(1)
    })
  ).required().min(1),
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
  assigned_to: Joi.string().optional().uuid().allow(null, ''),
  broker_id: Joi.string().optional().uuid().allow(null, ''),
  rice_code_id: Joi.string().optional().uuid().allow(null, ''),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw').allow(null, ''),
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
      phones: Joi.array().items(Joi.string().max(20)).required().min(1)
    })
  ).optional().min(1),
  email: Joi.string().optional().allow(null, '').email(),
  phone: Joi.string().optional().allow(null, '').max(20),
  address: addressSchema.optional().allow(null),
  business_details: Joi.object({
    pan_number: Joi.string().optional().length(10).allow(null, ''),
    gst_number: Joi.string().optional().length(15).allow(null, ''),
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
  rice_code_id: Joi.string().optional().uuid(),
  rice_type: Joi.string().optional().valid('basmati', 'non_basmati', 'parboiled', 'raw'),
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
  contact_person: Joi.string().required().min(2).max(255),
  phone: Joi.string().required().max(20),
  email: Joi.string().optional().allow(null, '').email(),
  address: addressSchema.required(),
  gst_number: Joi.string().optional().allow(null, '').length(15),
  pan_number: Joi.string().optional().allow(null, '').length(10).uppercase(),
  vehicle_numbers: Joi.array().items(Joi.string().max(50)).optional(),
  bank_details: bankDetailsSchema.optional(),
  is_active: Joi.boolean().optional(),
  created_by: Joi.string().optional().uuid(),
});

export const updateTransporterSchema = Joi.object({
  business_name: Joi.string().optional().min(2).max(255),
  contact_person: Joi.string().optional().min(2).max(255),
  phone: Joi.string().optional().max(20),
  email: Joi.string().optional().allow(null, '').email(),
  address: addressSchema.optional(),
  gst_number: Joi.string().optional().allow(null, '').length(15),
  pan_number: Joi.string().optional().allow(null, '').length(10).uppercase(),
  vehicle_numbers: Joi.array().items(Joi.string().max(50)).optional(),
  bank_details: bankDetailsSchema.optional(),
  is_active: Joi.boolean().optional(),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Sauda validation schemas
export const createSaudaSchema = Joi.object({
  sauda_type: Joi.string().required().valid('xgodown', 'for'),
  rice_quality: Joi.string().required().min(1).max(255),
  rice_code_id: Joi.string().optional().uuid().allow(null),
  rate: Joi.number().required().min(0).precision(2),
  broker_id: Joi.string().optional().uuid().allow(null),
  broker_commission: Joi.number().optional().min(0).max(100).precision(2),
  quantity: Joi.number().optional().min(0).precision(2),
  transporter_id: Joi.string().optional().uuid().allow(null),
  transportation_cost: Joi.number().optional().min(0).precision(2),
  cash_discount: Joi.number().optional().min(0).precision(2),
  estimated_delivery_time: Joi.number().optional().integer().min(0),
  purchaser_id: Joi.string().required().uuid(),
  cooked_rice_image_url: Joi.string().optional().allow(null, '').uri(),
  uncooked_rice_image_url: Joi.string().optional().allow(null, '').uri(),
  status: Joi.string().optional().valid('draft', 'active', 'completed', 'cancelled'),
  notes: Joi.string().optional().allow(null, '').max(1000),
  created_by: Joi.string().optional().uuid(),
});

export const updateSaudaSchema = Joi.object({
  sauda_type: Joi.string().optional().valid('xgodown', 'for'),
  rice_quality: Joi.string().optional().min(1).max(255),
  rice_code_id: Joi.string().optional().uuid().allow(null),
  rate: Joi.number().optional().min(0).precision(2),
  broker_id: Joi.string().optional().uuid().allow(null),
  broker_commission: Joi.number().optional().min(0).max(100).precision(2),
  quantity: Joi.number().optional().min(0).precision(2),
  transporter_id: Joi.string().optional().uuid().allow(null),
  transportation_cost: Joi.number().optional().min(0).precision(2),
  cash_discount: Joi.number().optional().min(0).precision(2),
  estimated_delivery_time: Joi.number().optional().integer().min(0),
  purchaser_id: Joi.string().optional().uuid(),
  cooked_rice_image_url: Joi.string().optional().allow(null, '').uri(),
  uncooked_rice_image_url: Joi.string().optional().allow(null, '').uri(),
  status: Joi.string().optional().valid('draft', 'active', 'completed', 'cancelled'),
  notes: Joi.string().optional().allow(null, '').max(1000),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Inward Slip Pass validation schemas
const inwardSlipLotSchema = Joi.object({
  lot_number: Joi.string().required().max(255),
  item_name: Joi.string().required().max(255),
  no_of_bags: Joi.number().required().integer().min(1),
  bag_weight: Joi.number().optional().min(0).precision(2),
  bill_weight: Joi.number().required().min(0).precision(2),
  received_weight: Joi.number().required().min(0).precision(2),
  bardana: Joi.string().optional().allow(null, '').max(100),
  rate: Joi.number().required().min(0).precision(2),
});

export const updateInwardSlipLotSchema = Joi.object({
  lot_number: Joi.string().optional().max(255),
  item_name: Joi.string().optional().max(255),
  no_of_bags: Joi.number().optional().integer().min(1),
  bag_weight: Joi.number().optional().min(0).precision(2).allow(null),
  bill_weight: Joi.number().optional().min(0).precision(2),
  received_weight: Joi.number().optional().min(0).precision(2),
  bardana: Joi.string().optional().allow(null, '').max(100),
  rate: Joi.number().optional().min(0).precision(2),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

export const createInwardSlipPassSchema = Joi.object({
  sauda_id: Joi.string().required().uuid(),
  slip_number: Joi.string().required().max(255),
  date: Joi.string().required().isoDate(),
  vehicle_number: Joi.string().required().max(50),
  party_name: Joi.string().required().max(255),
  party_address: Joi.string().optional().allow(null, ''),
  party_gst_number: Joi.string().optional().allow(null, '').length(15),
  status: Joi.string().optional().valid('pending', 'completed'),
  inward_slip_bill_image_url: Joi.string().optional().allow(null, '').uri(),
  notes: Joi.string().optional().allow(null, '').max(1000),
  lots: Joi.array().items(inwardSlipLotSchema).optional(),
  created_by: Joi.string().optional().uuid(),
});

export const updateInwardSlipPassSchema = Joi.object({
  slip_number: Joi.string().optional().max(255),
  date: Joi.string().optional().isoDate(),
  vehicle_number: Joi.string().optional().max(50),
  party_name: Joi.string().optional().max(255),
  party_address: Joi.string().optional().allow(null, ''),
  party_gst_number: Joi.string().optional().allow(null, '').length(15),
  status: Joi.string().optional().valid('pending', 'completed'),
  inward_slip_bill_image_url: Joi.string().optional().allow(null, '').uri(),
  notes: Joi.string().optional().allow(null, '').max(1000),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

// Purchase validation schemas
export const createPurchaseSchema = Joi.object({
  vendor_id: Joi.string().required().uuid(),
  sauda_id: Joi.string().required().uuid(),
  broker_id: Joi.string().optional().uuid().allow(null),
  broker_commission: Joi.number().optional().min(0).max(100).precision(2),
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
  broker_commission: Joi.number().optional().min(0).max(100).precision(2),
  payment_advice_id: Joi.string().optional().uuid().allow(null),
  invoice_number: Joi.string().optional().allow(null, '').max(255),
  invoice_date: Joi.string().optional().allow(null, '').isoDate(),
  rate: Joi.number().optional().min(0).precision(2),
  total_weight: Joi.number().optional().min(0).precision(2),
  total_amount: Joi.number().optional().min(0).precision(2),
  igst_amount: Joi.number().optional().min(0).precision(2),
  igst_percentage: Joi.number().optional().min(0).max(100).precision(2),
  freight_status: Joi.string().optional().allow(null, '').max(50),
  transportation_bill_image_url: Joi.string().optional().allow(null, '').uri(),
  bill_pdf_url: Joi.string().optional().allow(null, '').uri(),
  bilti_image_url: Joi.string().optional().allow(null, '').uri(),
  bilti_pdf_url: Joi.string().optional().allow(null, '').uri(),
  eway_bill_number: Joi.string().optional().allow(null, '').max(255),
  eway_bill_url: Joi.string().optional().allow(null, '').uri(),
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
  purchase_id: Joi.string().optional().uuid().allow(null),
  payer_id: Joi.string().required().uuid(),
  recipient_id: Joi.string().required().uuid(),
  sr_number: Joi.string().optional().allow(null, '').max(50),
  party_name: Joi.string().optional().allow(null, '').max(255),
  party_address: Joi.string().optional().allow(null, ''),
  broker_name: Joi.string().optional().allow(null, '').max(255),
  invoice_number: Joi.string().optional().allow(null, '').max(255),
  invoice_date: Joi.string().optional().allow(null, '').isoDate(),
  truck_number: Joi.string().optional().allow(null, '').max(50),
  item: Joi.string().optional().allow(null, '').max(100),
  total_bags: Joi.number().optional().integer().min(0),
  due_date: Joi.string().optional().allow(null, '').isoDate(),
  bill_weight: Joi.number().optional().min(0).precision(2),
  kanta_weight: Joi.number().optional().min(0).precision(2),
  final_weight: Joi.number().optional().min(0).precision(2),
  rate: Joi.number().optional().min(0).precision(2),
  amount: Joi.number().required().min(0).precision(2),
  transaction_id: Joi.string().optional().allow(null, '').max(255),
  date_of_payment: Joi.string().required().isoDate(),
  status: Joi.string().optional().valid('pending', 'completed', 'failed'),
  payment_slip_image_url: Joi.string().optional().allow(null, '').uri(),
  notes: Joi.string().optional().allow(null, '').max(1000),
  charges: Joi.array().items(paymentAdviceChargeSchema).optional(),
  created_by: Joi.string().optional().uuid(),
});

export const updatePaymentAdviceSchema = Joi.object({
  purchase_id: Joi.string().optional().uuid().allow(null),
  payer_id: Joi.string().optional().uuid(),
  recipient_id: Joi.string().optional().uuid(),
  sr_number: Joi.string().optional().allow(null, '').max(50),
  party_name: Joi.string().optional().allow(null, '').max(255),
  party_address: Joi.string().optional().allow(null, ''),
  broker_name: Joi.string().optional().allow(null, '').max(255),
  invoice_number: Joi.string().optional().allow(null, '').max(255),
  invoice_date: Joi.string().optional().allow(null, '').isoDate(),
  truck_number: Joi.string().optional().allow(null, '').max(50),
  item: Joi.string().optional().allow(null, '').max(100),
  total_bags: Joi.number().optional().integer().min(0),
  due_date: Joi.string().optional().allow(null, '').isoDate(),
  bill_weight: Joi.number().optional().min(0).precision(2),
  kanta_weight: Joi.number().optional().min(0).precision(2),
  final_weight: Joi.number().optional().min(0).precision(2),
  rate: Joi.number().optional().min(0).precision(2),
  amount: Joi.number().optional().min(0).precision(2),
  transaction_id: Joi.string().optional().allow(null, '').max(255),
  date_of_payment: Joi.string().optional().isoDate(),
  status: Joi.string().optional().valid('pending', 'completed', 'failed'),
  payment_slip_image_url: Joi.string().optional().allow(null, '').uri(),
  notes: Joi.string().optional().allow(null, '').max(1000),
  updated_by: Joi.string().optional().uuid(),
}).min(1);

export const createPaymentAdviceChargeSchema = Joi.object({
  charge_name: Joi.string().required().max(255),
  charge_value: Joi.number().required().min(0).precision(2),
  charge_type: Joi.string().optional().valid('percentage', 'fixed'),
});

