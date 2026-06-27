import { salesPartyDAO, SalesPartyListFilters } from '../dao/sales-party.dao';
import { NotFoundError, ConflictError } from '../utils/errors';
import { assertModuleEmailAvailable } from '../utils/entity-email-conflict';
import {
  CreateSalesPartyDTO,
  UpdateSalesPartyDTO,
  SalesParty,
} from '../models/sales-party.model';
import { logger } from '../utils/logger';

export class SalesPartyService {
  async list(filters: SalesPartyListFilters = {}): Promise<SalesParty[]> {
    return salesPartyDAO.findAll(filters);
  }

  async getById(id: string): Promise<SalesParty> {
    const party = await salesPartyDAO.findById(id);
    if (!party) throw new NotFoundError('Sales party not found');
    return party;
  }

  async create(data: CreateSalesPartyDTO): Promise<SalesParty> {
    const primaryEmail = data.contact_persons?.[0]?.emails?.[0];
    await assertModuleEmailAvailable(
      primaryEmail,
      'sales party',
      (email) => salesPartyDAO.findByEmail(email)
    );
    if (data.business_details?.gst_number) {
      const exists = await salesPartyDAO.gstExists(data.business_details.gst_number);
      if (exists) throw new ConflictError('GST number already exists');
    }
    if (data.business_details?.pan_number) {
      const exists = await salesPartyDAO.panExists(data.business_details.pan_number);
      if (exists) throw new ConflictError('PAN number already exists');
    }
    if (data.aadhar_number) {
      const exists = await salesPartyDAO.aadharExists(data.aadhar_number);
      if (exists) throw new ConflictError('Aadhaar number already exists');
    }
    logger.info('Creating sales party', { businessName: data.business_name });
    return salesPartyDAO.create(data);
  }

  async update(id: string, data: UpdateSalesPartyDTO): Promise<SalesParty> {
    const existing = await salesPartyDAO.findById(id);
    if (!existing) throw new NotFoundError('Sales party not found');

    const newEmail = data.contact_persons?.[0]?.emails?.[0];
    const existingEmail = existing.contact_persons?.[0]?.emails?.[0];
    if (newEmail && newEmail !== existingEmail) {
      await assertModuleEmailAvailable(newEmail, 'sales party', (email) =>
        salesPartyDAO.findByEmail(email), id);
    }
    if (data.business_details?.gst_number) {
      const exists = await salesPartyDAO.gstExists(data.business_details.gst_number, id);
      if (exists) throw new ConflictError('GST number already exists');
    }
    if (data.business_details?.pan_number) {
      const exists = await salesPartyDAO.panExists(data.business_details.pan_number, id);
      if (exists) throw new ConflictError('PAN number already exists');
    }
    if (data.aadhar_number) {
      const exists = await salesPartyDAO.aadharExists(data.aadhar_number, id);
      if (exists) throw new ConflictError('Aadhaar number already exists');
    }

    const updated = await salesPartyDAO.update(id, data);
    if (!updated) throw new NotFoundError('Sales party not found after update');
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await salesPartyDAO.findById(id);
    if (!existing) throw new NotFoundError('Sales party not found');
    await salesPartyDAO.delete(id);
  }
}

export const salesPartyService = new SalesPartyService();
