import { Response, NextFunction } from 'express';
import { LeadDAO } from '../dao/lead.dao';
import { LeadEventDAO } from '../dao/lead-event.dao';
import { ConversionDAO } from '../dao/conversion.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createLeadSchema,
  updateLeadSchema,
  createLeadEventSchema,
  createConversionSchema,
  convertLeadToVendorSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors';
import { CreateLeadDTO, UpdateLeadDTO, LeadResponse, LeadStatus } from '../models/lead.model';
import { CreateLeadEventDTO, LEAD_EVENT_TYPES } from '../models/lead-event.model';
import { CreateConversionDTO } from '../models/conversion.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { VendorDAO } from '../dao/vendor.dao';
import { UserDAO } from '../dao/user.dao';

const leadDAO = new LeadDAO();
const leadEventDAO = new LeadEventDAO();
const conversionDAO = new ConversionDAO();
const vendorDAO = new VendorDAO();
const userDAO = new UserDAO();

export class LeadController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const leadStatus = req.query.lead_status as LeadStatus;
      const assignedTo = req.query.assigned_to as string;
      const priority = req.query.priority as string;
      const isExistingCustomer = req.query.is_existing_customer === 'true' ? true : 
                                req.query.is_existing_customer === 'false' ? false : undefined;

      const leads = await leadDAO.findAll(
        false,
        leadStatus,
        assignedTo,
        priority as any,
        isExistingCustomer
      );

      const leadResponses: LeadResponse[] = leads.map((lead: any) => ({
        id: lead.id,
        company_name: lead.company_name,
        contact_person: lead.contact_person,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
        business_details: lead.business_details,
        is_existing_customer: lead.is_existing_customer,
        lead_status: lead.lead_status,
        customer_status: lead.customer_status,
        assigned_to: lead.assigned_to,
        broker_id: lead.broker_id,
        rice_code_id: lead.rice_code_id,
        rice_type: lead.rice_type,
        created_by: lead.created_by,
        updated_by: lead.updated_by,
        created_at: lead.created_at.toISOString(),
        updated_at: lead.updated_at.toISOString(),
        notes: lead.notes,
        priority: lead.priority,
        source: lead.source,
        estimated_value: lead.estimated_value,
        expected_close_date: lead.expected_close_date?.toISOString() || null,
        revenue: lead.revenue,
        salesman_latitude: lead.salesman_latitude,
        salesman_longitude: lead.salesman_longitude,
      }));

      return ResponseHandler.success(res, leadResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const lead = await leadDAO.findById(id);
      if (!lead) {
        throw new NotFoundError('Lead not found');
      }

      const leadResponse: LeadResponse = {
        id: lead.id,
        company_name: lead.company_name,
        contact_person: lead.contact_person,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
        business_details: lead.business_details,
        is_existing_customer: lead.is_existing_customer,
        lead_status: lead.lead_status,
        customer_status: lead.customer_status,
        assigned_to: lead.assigned_to,
        broker_id: lead.broker_id,
        rice_code_id: lead.rice_code_id,
        rice_type: lead.rice_type,
        created_by: lead.created_by,
        updated_by: lead.updated_by,
        created_at: lead.created_at.toISOString(),
        updated_at: lead.updated_at.toISOString(),
        notes: lead.notes,
        priority: lead.priority,
        source: lead.source,
        estimated_value: lead.estimated_value,
        expected_close_date: lead.expected_close_date?.toISOString() || null,
        revenue: lead.revenue,
        salesman_latitude: lead.salesman_latitude,
        salesman_longitude: lead.salesman_longitude,
      };

      return ResponseHandler.success(res, leadResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const leadData = validate<CreateLeadDTO>(createLeadSchema, req.body);

      // Check if email already exists (only if email is provided)
      if (leadData.email) {
        const emailExists = await leadDAO.emailExists(leadData.email);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Set created_by from authenticated user
      if (req.user) {
        leadData.created_by = req.user.userId;
      }

      const lead = await leadDAO.create(leadData);

      // Create initial event
      await leadEventDAO.create({
        lead_id: lead.id,
        event_type: LEAD_EVENT_TYPES.CREATED,
        event_description: 'Lead created',
        created_by: req.user?.userId,
        metadata: {
          initial_status: lead.lead_status,
          priority: lead.priority,
          source: lead.source
        }
      });

      const leadResponse: LeadResponse = {
        id: lead.id,
        company_name: lead.company_name,
        contact_person: lead.contact_person,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
        business_details: lead.business_details,
        is_existing_customer: lead.is_existing_customer,
        lead_status: lead.lead_status,
        customer_status: lead.customer_status,
        assigned_to: lead.assigned_to,
        broker_id: lead.broker_id,
        rice_code_id: lead.rice_code_id,
        rice_type: lead.rice_type,
        created_by: lead.created_by,
        updated_by: lead.updated_by,
        created_at: lead.created_at.toISOString(),
        updated_at: lead.updated_at.toISOString(),
        notes: lead.notes,
        priority: lead.priority,
        source: lead.source,
        estimated_value: lead.estimated_value,
        expected_close_date: lead.expected_close_date?.toISOString() || null,
        revenue: lead.revenue,
        salesman_latitude: lead.salesman_latitude,
        salesman_longitude: lead.salesman_longitude,
      };

      return ResponseHandler.created(res, leadResponse, 'Lead created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const leadData = validate<UpdateLeadDTO>(updateLeadSchema, req.body);

      // Check if lead exists
      const existingLead = await leadDAO.findById(id);
      if (!existingLead) {
        throw new NotFoundError('Lead not found');
      }

      // Check for duplicate email if email is being updated
      if (leadData.email && leadData.email !== existingLead.email) {
        const emailExists = await leadDAO.emailExists(leadData.email, id);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Set updated_by from authenticated user
      if (req.user) {
        leadData.updated_by = req.user.userId;
      }

      const lead = await leadDAO.update(id, leadData);
      if (!lead) {
        throw new NotFoundError('Lead not found after update');
      }

      // Create event for status change
      if (leadData.lead_status && leadData.lead_status !== existingLead.lead_status) {
        await leadEventDAO.create({
          lead_id: lead.id,
          event_type: LEAD_EVENT_TYPES.STATUS_CHANGED,
          event_description: `Status changed from ${existingLead.lead_status} to ${leadData.lead_status}`,
          created_by: req.user?.userId,
          metadata: {
            old_status: existingLead.lead_status,
            new_status: leadData.lead_status
          }
        });
      }

      // Create event for assignment change
      if (leadData.assigned_to && leadData.assigned_to !== existingLead.assigned_to) {
        await leadEventDAO.create({
          lead_id: lead.id,
          event_type: LEAD_EVENT_TYPES.ASSIGNED,
          event_description: 'Lead reassigned',
          created_by: req.user?.userId,
          metadata: {
            old_assigned_to: existingLead.assigned_to,
            new_assigned_to: leadData.assigned_to
          }
        });
      }

      const leadResponse: LeadResponse = {
        id: lead.id,
        company_name: lead.company_name,
        contact_person: lead.contact_person,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
        business_details: lead.business_details,
        is_existing_customer: lead.is_existing_customer,
        lead_status: lead.lead_status,
        customer_status: lead.customer_status,
        assigned_to: lead.assigned_to,
        broker_id: lead.broker_id,
        rice_code_id: lead.rice_code_id,
        rice_type: lead.rice_type,
        created_by: lead.created_by,
        updated_by: lead.updated_by,
        created_at: lead.created_at.toISOString(),
        updated_at: lead.updated_at.toISOString(),
        notes: lead.notes,
        priority: lead.priority,
        source: lead.source,
        estimated_value: lead.estimated_value,
        expected_close_date: lead.expected_close_date?.toISOString() || null,
        revenue: lead.revenue,
        salesman_latitude: lead.salesman_latitude,
        salesman_longitude: lead.salesman_longitude,
      };

      return ResponseHandler.success(res, leadResponse, 'Lead updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const lead = await leadDAO.findById(id);
      if (!lead) {
        throw new NotFoundError('Lead not found');
      }

      const deleted = await leadDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Lead not found after deletion');
      }

      return ResponseHandler.success(res, null, 'Lead deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async getEvents(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const lead = await leadDAO.findById(id);
      if (!lead) {
        throw new NotFoundError('Lead not found');
      }

      const events = await leadEventDAO.findByLeadId(id);
      const eventResponses = events.map((event: any) => ({
        id: event.id,
        lead_id: event.lead_id,
        event_type: event.event_type,
        event_description: event.event_description,
        created_by: event.created_by,
        created_at: event.created_at.toISOString(),
        metadata: event.metadata,
      }));

      return ResponseHandler.success(res, eventResponses);
    } catch (error) {
      next(error);
    }
  }

  async addEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const eventData = validate<CreateLeadEventDTO>(createLeadEventSchema, req.body);

      // Check if lead exists
      const lead = await leadDAO.findById(eventData.lead_id);
      if (!lead) {
        throw new NotFoundError('Lead not found');
      }

      // Set created_by from authenticated user
      if (req.user) {
        eventData.created_by = req.user.userId;
      }

      const event = await leadEventDAO.create(eventData);

      const eventResponse = {
        id: event.id,
        lead_id: event.lead_id,
        event_type: event.event_type,
        event_description: event.event_description,
        created_by: event.created_by,
        created_at: event.created_at.toISOString(),
        metadata: event.metadata,
      };

      return ResponseHandler.created(res, eventResponse, 'Event added successfully');
    } catch (error) {
      next(error);
    }
  }

  async convert(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const conversionData = validate<CreateConversionDTO>(createConversionSchema, req.body);

      // Check if lead exists
      const lead = await leadDAO.findById(conversionData.lead_id);
      if (!lead) {
        throw new NotFoundError('Lead not found');
      }

      // Check if lead is already converted
      const existingConversion = await conversionDAO.findByLeadId(conversionData.lead_id);
      if (existingConversion) {
        throw new ConflictError('Lead is already converted');
      }

      // Set created_by from authenticated user
      if (req.user) {
        conversionData.created_by = req.user.userId;
      }

      const conversion = await conversionDAO.create(conversionData);

      // Update lead status to converted
      await leadDAO.update(conversionData.lead_id, {
        lead_status: 'converted',
        updated_by: req.user?.userId
      });

      // Create conversion event
      await leadEventDAO.create({
        lead_id: conversionData.lead_id,
        event_type: LEAD_EVENT_TYPES.CONVERTED,
        event_description: `Lead converted to vendor with value: ${conversionData.conversion_value || 'N/A'}`,
        created_by: req.user?.userId,
        metadata: {
          vendor_id: conversionData.vendor_id,
          broker_id: conversionData.broker_id,
          conversion_value: conversionData.conversion_value,
          commission_rate: conversionData.commission_rate
        }
      });

      const conversionResponse = {
        id: conversion.id,
        lead_id: conversion.lead_id,
        vendor_id: conversion.vendor_id,
        broker_id: conversion.broker_id,
        conversion_date: conversion.conversion_date.toISOString(),
        conversion_value: conversion.conversion_value,
        commission_rate: conversion.commission_rate,
        commission_amount: conversion.commission_amount,
        created_by: conversion.created_by,
        notes: conversion.notes,
      };

      return ResponseHandler.created(res, conversionResponse, 'Lead converted successfully');
    } catch (error) {
      next(error);
    }
  }

  async convertLeadToVendor(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { lead_id, broker_id, conversion_value, commission_rate, notes } = validate<CreateConversionDTO>(convertLeadToVendorSchema, req.body);

      const lead = await leadDAO.findById(lead_id);
      if (!lead) {
        throw new NotFoundError('Lead not found');
      }
      if (lead.lead_status === 'converted') {
        throw new ConflictError('Lead is already converted');
      }

      // Validate that email exists for vendor conversion
      if (!lead.email) {
        throw new ValidationError('Email is required to convert lead to vendor');
      }

      // 1. Create a new user for the vendor (if not already existing via is_existing_customer)
      let vendorUser;
      const existingVendor = await vendorDAO.findByEmail(lead.email);

      if (lead.is_existing_customer && existingVendor) {
        // If it's an existing customer and a vendor already exists with this email, link to it
        vendorUser = await userDAO.findByEmail(lead.email);
        if (!vendorUser) {
          // This scenario should ideally not happen if data integrity is maintained
          throw new NotFoundError('Existing vendor user not found');
        }
      } else {
        // Generate username from contact_person (first part before space, lowercase, remove special chars)
        let baseUsername = lead.contact_person
          .toLowerCase()
          .split(' ')[0]
          .replace(/[^a-z0-9]/g, '');
        
        // Check if username already exists and append number if needed
        let username = baseUsername;
        let counter = 1;
        while (await userDAO.usernameExists(username)) {
          username = `${baseUsername}${counter}`;
          counter++;
        }

        // Create a new user for the vendor
        const userData = {
          username: username,
          email: lead.email,
          password: 'defaultPassword123', // Default password, should be changed
          full_name: lead.contact_person,
          phone: lead.phone || undefined,
          user_type: 'vendor' as const,
          is_active: true,
          created_by: req.user?.userId,
        };
        try {
          vendorUser = await userDAO.create(userData);
        } catch (userError) {
          console.error('User creation failed during lead conversion:', userError);
          throw new ConflictError('Failed to create user account for new vendor');
        }
      }

      // 2. Create the Vendor
      let vendor;
      if (existingVendor) {
        vendor = existingVendor;
        // Update existing vendor if necessary, e.g., link lead_id
        await vendorDAO.update(vendor.id, { lead_id: lead.id, updated_by: req.user?.userId });
      } else {
        const newVendorData = {
          business_name: lead.company_name,
          contact_person: lead.contact_person,
          email: lead.email,
          phone: lead.phone || '',
          address: lead.address || { street: '', city: '', state: '', pincode: '', country: '' },
          business_details: lead.business_details || { pan_number: '', gst_number: '', industry: '', company_size: '', annual_revenue: 0 },
          type: 'both' as const, // Default to 'both' for converted leads
          is_active: true,
          created_by: req.user?.userId,
          user_id: vendorUser?.id, // Link to the newly created or found user
          lead_id: lead.id, // Link to the lead
        };
        vendor = await vendorDAO.create(newVendorData);
      }

      // 3. Create the Conversion record
      const commissionAmount = conversion_value && commission_rate ? (conversion_value * commission_rate) / 100 : 0;
      const conversion = await conversionDAO.create({
        lead_id: lead.id,
        vendor_id: vendor.id,
        broker_id: broker_id,
        conversion_value: conversion_value,
        commission_rate: commission_rate,
        commission_amount: commissionAmount,
        notes: notes,
        created_by: req.user?.userId,
      });

      // 4. Update Lead status
      await leadDAO.update(lead.id, {
        lead_status: 'converted',
        customer_status: 'active',
        is_existing_customer: true,
        updated_by: req.user?.userId,
      });

      // 5. Log conversion event
      await leadEventDAO.create({
        lead_id: lead.id,
        event_type: LEAD_EVENT_TYPES.CONVERTED,
        event_description: `Lead converted to vendor ${vendor.business_name} by user ${req.user?.username || 'N/A'}`,
        metadata: { vendor_id: vendor.id, conversion_id: conversion.id, broker_id: broker_id },
        created_by: req.user?.userId,
      });

      return ResponseHandler.created(res, { conversion, vendor }, 'Lead converted to vendor successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAnalytics(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const analytics = await leadDAO.getAnalytics();
      const stats = await leadDAO.getLeadStats();

      return ResponseHandler.success(res, {
        analytics,
        stats
      });
    } catch (error) {
      next(error);
    }
  }
}
