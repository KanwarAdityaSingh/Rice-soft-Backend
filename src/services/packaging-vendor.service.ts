import { packagingVendorDAO, MasterVendorListFilters } from '../dao/packaging-vendor.dao';
import type {
  CreateMasterVendorDTO,
  UpdateMasterVendorDTO,
  MasterVendor,
} from '../models/packaging-vendor.model';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { assertModuleEmailAvailable } from '../utils/entity-email-conflict';
import { logger } from '../utils/logger';

export type { MasterVendorListFilters };

function resolveName(data: { business_name?: string; name?: string }): string {
  return (data.business_name ?? data.name ?? '').trim();
}

export class PackagingVendorService {
  async list(
    filters: MasterVendorListFilters = {},
    pagination?: { limit: number; offset: number }
  ): Promise<{ items: MasterVendor[]; total: number }> {
    const { rows, total } = await packagingVendorDAO.findAll(filters, pagination);
    return { items: rows, total };
  }

  async suggest(q: string, limit = 10): Promise<MasterVendor[]> {
    return packagingVendorDAO.suggestByName(q, limit);
  }

  async getById(id: string): Promise<MasterVendor> {
    const vendor = await packagingVendorDAO.findById(id);
    if (!vendor) throw new NotFoundError('Master vendor not found');
    return vendor;
  }

  /** @deprecated Prefer getById */
  async getVendorById(id: string): Promise<MasterVendor> {
    return this.getById(id);
  }

  /** @deprecated Prefer list */
  async getAllVendors(): Promise<MasterVendor[]> {
    const { items } = await this.list({ includeInactive: true });
    return items;
  }

  async create(data: CreateMasterVendorDTO): Promise<MasterVendor> {
    const businessName = resolveName(data);
    if (!businessName) {
      throw new ValidationError('business_name (Master Vendor Name) is required');
    }

    const primaryEmail = data.contact_persons?.[0]?.emails?.[0];
    await assertModuleEmailAvailable(primaryEmail, 'master vendor', (email) =>
      packagingVendorDAO.findByEmail(email)
    );

    if (await packagingVendorDAO.businessNameExists(businessName)) {
      throw new ConflictError('Master Vendor Name already exists');
    }

    const gst = data.business_details?.gst_number?.trim() || data.gst_number?.trim();
    if (gst && (await packagingVendorDAO.gstExists(gst))) {
      throw new ConflictError('GST number already exists');
    }

    const pan = data.business_details?.pan_number?.trim();
    if (pan && (await packagingVendorDAO.panExists(pan))) {
      throw new ConflictError('PAN number already exists');
    }

    logger.info('Creating master vendor', { businessName });
    return packagingVendorDAO.create({ ...data, business_name: businessName });
  }

  /** @deprecated Prefer create */
  async createVendor(data: CreateMasterVendorDTO): Promise<MasterVendor> {
    return this.create(data);
  }

  async update(id: string, data: UpdateMasterVendorDTO): Promise<MasterVendor> {
    const existing = await this.getById(id);

    if (existing.address_locked && data.address !== undefined && !data.force_address_update) {
      throw new ValidationError(
        'Address is locked after GST verification. Pass force_address_update=true to override (admin).'
      );
    }

    const businessName = resolveName({
      business_name: data.business_name,
      name: data.name,
    });
    if ((data.business_name !== undefined || data.name !== undefined) && businessName) {
      if (await packagingVendorDAO.businessNameExists(businessName, id)) {
        throw new ConflictError('Master Vendor Name already exists');
      }
    }

    const newEmail = data.contact_persons?.[0]?.emails?.[0];
    const existingEmail = existing.contact_persons?.[0]?.emails?.[0];
    if (newEmail && newEmail !== existingEmail) {
      await assertModuleEmailAvailable(
        newEmail,
        'master vendor',
        (email) => packagingVendorDAO.findByEmail(email),
        id
      );
    }

    const gst =
      data.business_details?.gst_number?.trim() ||
      (data.gst_number !== undefined ? data.gst_number?.trim() : undefined);
    if (gst && (await packagingVendorDAO.gstExists(gst, id))) {
      throw new ConflictError('GST number already exists');
    }

    const pan = data.business_details?.pan_number?.trim();
    if (pan && (await packagingVendorDAO.panExists(pan, id))) {
      throw new ConflictError('PAN number already exists');
    }

    const updated = await packagingVendorDAO.update(id, {
      ...data,
      business_name: data.business_name ?? (data.name !== undefined ? businessName : undefined),
    });
    if (!updated) throw new NotFoundError('Master vendor not found after update');
    return updated;
  }

  /** @deprecated Prefer update */
  async updateVendor(id: string, data: UpdateMasterVendorDTO): Promise<MasterVendor> {
    return this.update(id, data);
  }

  /** Soft-deactivate: set status inactive (preferred over hard delete). */
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    await packagingVendorDAO.setStatus(existing.id, 'inactive');
    logger.info('Master vendor soft-deactivated (status=inactive)', { id });
  }

  /** @deprecated Prefer delete (soft) */
  async deleteVendor(id: string): Promise<void> {
    return this.delete(id);
  }

  async hardDelete(id: string): Promise<void> {
    await this.getById(id);
    const deleted = await packagingVendorDAO.delete(id);
    if (!deleted) throw new NotFoundError('Master vendor not found');
  }
}

export const packagingVendorService = new PackagingVendorService();
export const masterVendorService = packagingVendorService;
