import { vendorDAO } from '../dao/vendor.dao';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { CreateVendorDTO, UpdateVendorDTO, Vendor, VendorType } from '../models/vendor.model';
import { gstLookupService } from './gst-lookup.service';
import { logger } from '../utils/logger';

export class VendorService {
  async getAllVendors(includeInactive: boolean, type?: VendorType): Promise<Vendor[]> {
    return await vendorDAO.findAll(includeInactive, type);
  }

  async getVendorById(id: string): Promise<Vendor> {
    const vendor = await vendorDAO.findById(id);
    if (!vendor) {
      throw new NotFoundError('Vendor not found');
    }
    return vendor;
  }

  async createVendor(vendorData: CreateVendorDTO): Promise<Vendor> {
    // Check if email already exists
    const emailExists = await vendorDAO.emailExists(vendorData.email);
    if (emailExists) {
      throw new ConflictError('Email already exists');
    }

    // Check if GST already exists (if provided)
    if (vendorData.business_details?.gst_number) {
      const gstExists = await vendorDAO.gstExists(vendorData.business_details.gst_number);
      if (gstExists) {
        throw new ConflictError('GST number already exists');
      }
    }

    // Check if PAN already exists (if provided)
    if (vendorData.business_details?.pan_number) {
      const panExists = await vendorDAO.panExists(vendorData.business_details.pan_number);
      if (panExists) {
        throw new ConflictError('PAN number already exists');
      }
    }

    logger.info('Creating vendor', {
      businessName: vendorData.business_name,
      email: vendorData.email,
      type: vendorData.type
    });

    return await vendorDAO.create(vendorData);
  }

  async updateVendor(id: string, vendorData: UpdateVendorDTO): Promise<Vendor> {
    // Check if vendor exists
    const existingVendor = await vendorDAO.findById(id);
    if (!existingVendor) {
      throw new NotFoundError('Vendor not found');
    }

    // Check if email already exists (if being updated)
    if (vendorData.email && vendorData.email !== existingVendor.email) {
      const emailExists = await vendorDAO.emailExists(vendorData.email, id);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }
    }

    // Check if GST already exists (if being updated)
    if (vendorData.business_details?.gst_number) {
      const gstExists = await vendorDAO.gstExists(vendorData.business_details.gst_number, id);
      if (gstExists) {
        throw new ConflictError('GST number already exists');
      }
    }

    // Check if PAN already exists (if being updated)
    if (vendorData.business_details?.pan_number) {
      const panExists = await vendorDAO.panExists(vendorData.business_details.pan_number, id);
      if (panExists) {
        throw new ConflictError('PAN number already exists');
      }
    }

    logger.info('Updating vendor', { vendorId: id });

    const vendor = await vendorDAO.update(id, vendorData);
    if (!vendor) {
      throw new NotFoundError('Vendor not found after update');
    }

    return vendor;
  }

  async deleteVendor(id: string): Promise<void> {
    const vendor = await vendorDAO.findById(id);
    if (!vendor) {
      throw new NotFoundError('Vendor not found');
    }

    logger.info('Deleting vendor', { vendorId: id });
    await vendorDAO.delete(id);
  }

  async lookupGST(gstNumber: string): Promise<any> {
    if (!gstLookupService.validateGSTFormat(gstNumber)) {
      throw new ValidationError('Invalid GST number format');
    }
    return await gstLookupService.lookupGST(gstNumber);
  }

  async lookupPAN(panNumber: string): Promise<any> {
    if (!gstLookupService.validatePANFormat(panNumber)) {
      throw new ValidationError('Invalid PAN number format');
    }
    return await gstLookupService.lookupPAN(panNumber);
  }

  async createVendorFromGST(
    gstNumber: string,
    contactPerson: string,
    email: string,
    phone: string,
    type: VendorType,
    brokerDetails: any,
    createdBy?: string
  ): Promise<Vendor> {
    // Validate GST format
    if (!gstLookupService.validateGSTFormat(gstNumber)) {
      throw new ValidationError('Invalid GST number format');
    }

    // Check if GST already exists
    const gstExists = await vendorDAO.gstExists(gstNumber);
    if (gstExists) {
      throw new ConflictError('GST number already exists');
    }

    // Check if email already exists
    const emailExists = await vendorDAO.emailExists(email);
    if (emailExists) {
      throw new ConflictError('Email already exists');
    }

    // Fetch GST details
    const gstData = await gstLookupService.lookupGST(gstNumber);
    const mappedData = gstLookupService.mapGSTToBusinessData(gstData);

    // Create vendor with fetched + provided data
    const vendorData: CreateVendorDTO = {
      business_name: mappedData.business_name,
      contact_person: contactPerson,
      email,
      phone,
      address: mappedData.address,
      business_details: {
        ...mappedData.business_details,
        gst_number: gstNumber,
      },
      bank_details: brokerDetails?.bank_details || null,
      type: type as any,
      is_active: true,
      created_by: createdBy,
    };

    return await vendorDAO.create(vendorData);
  }

  async createVendorFromPAN(
    panNumber: string,
    businessName: string | undefined,
    contactPerson: string,
    email: string,
    phone: string,
    address: any,
    type: VendorType,
    bankDetails: any,
    createdBy?: string
  ): Promise<Vendor> {
    // Validate PAN format
    if (!gstLookupService.validatePANFormat(panNumber)) {
      throw new ValidationError('Invalid PAN number format');
    }

    // Check if PAN already exists
    const panExists = await vendorDAO.panExists(panNumber);
    if (panExists) {
      throw new ConflictError('PAN number already exists');
    }

    // Check if email already exists
    const emailExists = await vendorDAO.emailExists(email);
    if (emailExists) {
      throw new ConflictError('Email already exists');
    }

    // Fetch PAN details
    const panData = await gstLookupService.lookupPAN(panNumber);
    const mappedData = gstLookupService.mapPANToBusinessData(panData);

    // Create vendor with fetched + provided data
    const vendorData: CreateVendorDTO = {
      business_name: businessName || mappedData.business_name,
      contact_person: contactPerson,
      email,
      phone,
      address,
      business_details: {
        ...mappedData.business_details,
        pan_number: panNumber,
      },
      bank_details: bankDetails || null,
      type: type as any,
      is_active: true,
      created_by: createdBy,
    };

    return await vendorDAO.create(vendorData);
  }
}

export const vendorService = new VendorService();

