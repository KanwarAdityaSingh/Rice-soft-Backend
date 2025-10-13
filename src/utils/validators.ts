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

export const createUserSchema = Joi.object({
  username: Joi.string().required().min(3).max(100),
  email: Joi.string().required().email(),
  password: Joi.string().required().min(6).max(100),
  role_id: Joi.string().required().uuid(),
  full_name: Joi.string().required().min(2).max(255),
  phone: Joi.string().optional().allow(null, '').max(20),
  is_active: Joi.boolean().optional(),
});

export const updateUserSchema = Joi.object({
  username: Joi.string().optional().min(3).max(100),
  email: Joi.string().optional().email(),
  password: Joi.string().optional().min(6).max(100),
  role_id: Joi.string().optional().uuid(),
  full_name: Joi.string().optional().min(2).max(255),
  phone: Joi.string().optional().allow(null, '').max(20),
  is_active: Joi.boolean().optional(),
}).min(1);

// Role validation schemas
export const createRoleSchema = Joi.object({
  name: Joi.string().required().min(2).max(50),
  description: Joi.string().optional().allow(null, ''),
  permissions: Joi.object().optional(),
});

export const updateRoleSchema = Joi.object({
  name: Joi.string().optional().min(2).max(50),
  description: Joi.string().optional().allow(null, ''),
  permissions: Joi.object().optional(),
}).min(1);

// UUID validation
export const uuidSchema = Joi.string().uuid();

