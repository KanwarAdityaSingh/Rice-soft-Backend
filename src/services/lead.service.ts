import { LeadDAO } from '../dao/lead.dao';
import { LeadEventDAO } from '../dao/lead-event.dao';
import { ConversionDAO } from '../dao/conversion.dao';
import { VendorDAO } from '../dao/vendor.dao';
import { UserDAO } from '../dao/user.dao';
import { leadVendorMappingDAO } from '../dao/lead-vendor-mapping.dao';
import { NotFoundError, ConflictError } from '../utils/errors';
import { CreateLeadDTO, UpdateLeadDTO, Lead, LeadStatus } from '../models/lead.model';
import { CreateLeadEventDTO, LEAD_EVENT_TYPES } from '../models/lead-event.model';
import { CreateConversionDTO } from '../models/conversion.model';
import { logger } from '../utils/logger';

const leadDAO = new LeadDAO();
const leadEventDAO = new LeadEventDAO();
const conversionDAO = new ConversionDAO();
const vendorDAO = new VendorDAO();
const userDAO = new UserDAO();

export class LeadService {
  async getAllLeads(filters: any): Promise<Lead[]> {
    return await leadDAO.findAll(
      false,
      filters.leadStatus,
      filters.assignedTo,
      filters.priority,
      filters.isExistingCustomer
    );
  }

  async getLeadById(id: string): Promise<Lead> {
    const lead = await leadDAO.findById(id);
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }
    return lead;
  }

  async getLeadAnalytics(): Promise<any[]> {
    return await leadDAO.findAnalytics();
  }

  async createLead(leadData: CreateLeadDTO): Promise<Lead> {
    logger.info('Creating lead', {
      companyName: leadData.company_name,
      email: leadData.email
    });

    const lead = await leadDAO.create(leadData);

    // Create initial event
    await leadEventDAO.create({
      lead_id: lead.id,
      event_type: LEAD_EVENT_TYPES.CREATED,
      event_description: 'Lead created',
      created_by: leadData.created_by,
      metadata: {
        lead_status: lead.lead_status,
        priority: lead.priority
      }
    });

    return lead;
  }

  async updateLead(id: string, leadData: UpdateLeadDTO): Promise<Lead> {
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

    logger.info('Updating lead', { leadId: id });

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
        created_by: leadData.updated_by,
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
        created_by: leadData.updated_by,
        metadata: {
          old_assigned_to: existingLead.assigned_to,
          new_assigned_to: leadData.assigned_to
        }
      });
    }

    return lead;
  }

  async deleteLead(id: string): Promise<void> {
    const lead = await leadDAO.findById(id);
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }

    logger.info('Deleting lead', { leadId: id });
    await leadDAO.delete(id);
  }

  async getLeadEvents(leadId: string): Promise<any[]> {
    return await leadEventDAO.findByLeadId(leadId);
  }

  async addLeadEvent(eventData: CreateLeadEventDTO): Promise<any> {
    return await leadEventDAO.create(eventData);
  }

  async convertLead(conversionData: CreateConversionDTO): Promise<any> {
    return await conversionDAO.create(conversionData);
  }

  async convertLeadToVendor(
    leadId: string,
    businessData: any,
    userType: string,
    createdBy: string
  ): Promise<{ user: any; vendor: any; conversion: any }> {
    const lead = await leadDAO.findById(leadId);
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }

    // Create user
    const userData = {
      username: lead.email.split('@')[0],
      email: lead.email,
      password: 'TempPassword123!',
      full_name: lead.contact_person,
      phone: lead.phone || '',
      user_type: userType as any,
      is_active: true,
      created_by: createdBy,
    };

    const user = await userDAO.create(userData);

    // Create vendor
    const vendorData = {
      business_name: businessData.business_name || lead.company_name,
      contact_person: lead.contact_person,
      email: lead.email,
      phone: lead.phone || '',
      address: lead.address || businessData.address,
      business_details: lead.business_details || businessData.business_details,
      bank_details: businessData.bank_details || null,
      type: businessData.type || 'both',
      is_active: true,
      user_id: user.id,
      lead_id: leadId,
      created_by: createdBy,
    };

    const vendor = await vendorDAO.create(vendorData);

    // Create conversion
    const conversion = await conversionDAO.create({
      lead_id: leadId,
      vendor_id: vendor.id,
      broker_id: businessData.broker_id || null,
      conversion_value: businessData.conversion_value || null,
      created_by: createdBy,
    });

    // Update lead status
    await leadDAO.update(leadId, {
      lead_status: 'converted' as LeadStatus,
      updated_by: createdBy,
    });

    // Create lead event
    await leadEventDAO.create({
      lead_id: leadId,
      event_type: LEAD_EVENT_TYPES.CONVERTED,
      event_description: `Lead converted to vendor`,
      created_by: createdBy,
      metadata: {
        vendor_id: vendor.id,
        broker_id: businessData.broker_id
      }
    });

    return { user, vendor, conversion };
  }
}

export const leadService = new LeadService();

