import { packagingVendorDAO } from '../dao/packaging-vendor.dao';
import { PackagingVendor, CreatePackagingVendorDTO, UpdatePackagingVendorDTO } from '../models/packaging-vendor.model';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export class PackagingVendorService {
  async getAllVendors(): Promise<PackagingVendor[]> {
    return await packagingVendorDAO.findAll();
  }

  async getVendorById(id: string): Promise<PackagingVendor> {
    const vendor = await packagingVendorDAO.findById(id);
    if (!vendor) {
      throw new NotFoundError('Packaging vendor not found');
    }
    return vendor;
  }

  async createVendor(vendorData: CreatePackagingVendorDTO): Promise<PackagingVendor> {
    const vendor = await packagingVendorDAO.create(vendorData);
    logger.info('Packaging vendor created', { id: vendor.id, name: vendor.name });
    return vendor;
  }

  async updateVendor(id: string, vendorData: UpdatePackagingVendorDTO): Promise<PackagingVendor> {
    const vendor = await packagingVendorDAO.update(id, vendorData);
    if (!vendor) {
      throw new NotFoundError('Packaging vendor not found');
    }
    logger.info('Packaging vendor updated', { id });
    return vendor;
  }

  async deleteVendor(id: string): Promise<void> {
    const deleted = await packagingVendorDAO.delete(id);
    if (!deleted) {
      throw new NotFoundError('Packaging vendor not found');
    }
    logger.info('Packaging vendor deleted', { id });
  }
}

export const packagingVendorService = new PackagingVendorService();

