import { vendorDAO } from '../dao/vendor.dao';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { CreateVendorDTO, UpdateVendorDTO, Vendor, VendorType } from '../models/vendor.model';
import { VendorListFilters } from '../dao/vendor.dao';
import { gstLookupService } from './gst-lookup.service';
import { logger } from '../utils/logger';

export class VendorService {
  async getAllVendors(filters: VendorListFilters = {}): Promise<Vendor[]> {
    return await vendorDAO.findAll(filters);
  }

  async getVendorById(id: string): Promise<Vendor> {
    const vendor = await vendorDAO.findById(id);
    if (!vendor) {
      throw new NotFoundError('Vendor not found');
    }
    return vendor;
  }

  async createVendor(vendorData: CreateVendorDTO): Promise<Vendor> {
    // Check if email already exists (only if email is provided)
    const primaryEmail = vendorData.contact_persons?.[0]?.emails?.[0];
    if (primaryEmail) {
      const emailExists = await vendorDAO.emailExists(primaryEmail);
        if (emailExists) {
          throw new ConflictError('Email already exists');
      }
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

    if (vendorData.aadhar_number) {
      const aadharExists = await vendorDAO.aadharExists(vendorData.aadhar_number);
      if (aadharExists) {
        throw new ConflictError('Aadhaar number already exists');
      }
    }

    logger.info('Creating vendor', {
      businessName: vendorData.business_name,
      email: primaryEmail,
      type: vendorData.type
    });

    const { verify_bank: _verifyBank, ...createPayload } = vendorData;
    return await vendorDAO.create(createPayload);
  }

  async updateVendor(id: string, vendorData: UpdateVendorDTO): Promise<Vendor> {
    // Check if vendor exists
    const existingVendor = await vendorDAO.findById(id);
    if (!existingVendor) {
      throw new NotFoundError('Vendor not found');
    }

    // Check if email already exists (if contact_persons is being updated with an email)
    const newEmail = vendorData.contact_persons?.[0]?.emails?.[0];
    const existingEmail = existingVendor.contact_persons?.[0]?.emails?.[0];
    if (newEmail && newEmail !== existingEmail) {
      const emailExists = await vendorDAO.emailExists(newEmail, id);
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

    if (vendorData.aadhar_number) {
      const aadharExists = await vendorDAO.aadharExists(vendorData.aadhar_number, id);
      if (aadharExists) {
        throw new ConflictError('Aadhaar number already exists');
      }
    }

    logger.info('Updating vendor', { vendorId: id });

    const { verify_bank: _verifyBank, ...updatePayload } = vendorData;
    const vendor = await vendorDAO.update(id, updatePayload);
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
    contactPersons: { name: string; phones: string[]; emails?: string[] }[],
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

    // Check if primary email already exists
    const primaryEmail = contactPersons[0]?.emails?.[0];
    if (primaryEmail) {
      const emailExists = await vendorDAO.emailExists(primaryEmail);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }
    }

    // Fetch GST details
    const gstData = await gstLookupService.lookupGST(gstNumber);
    const mappedData = gstLookupService.mapGSTToBusinessData(gstData);

    // Create vendor with fetched + provided data
    const vendorData: CreateVendorDTO = {
      business_name: mappedData.business_name,
      contact_persons: contactPersons,
      address: mappedData.address,
      business_details: {
        ...mappedData.business_details,
        gst_number: gstNumber,
      },
      registration_type: 'registered',
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
    contactPersons: { name: string; phones: string[]; emails?: string[] }[],
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

    // Check if primary email already exists
    const primaryEmail = contactPersons[0]?.emails?.[0];
    if (primaryEmail) {
      const emailExists = await vendorDAO.emailExists(primaryEmail);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }
    }

    // Fetch PAN details
    const panData = await gstLookupService.lookupPAN(panNumber);
    const mappedData = gstLookupService.mapPANToBusinessData(panData);

    // Create vendor with fetched + provided data
    const vendorData: CreateVendorDTO = {
      business_name: businessName || mappedData.business_name,
      contact_persons: contactPersons,
      address,
      business_details: {
        ...mappedData.business_details,
        pan_number: panNumber,
      },
      registration_type: 'registered',
      bank_details: bankDetails || null,
      type: type as any,
      is_active: true,
      created_by: createdBy,
    };

    return await vendorDAO.create(vendorData);
  }
}

export const vendorService = new VendorService();

