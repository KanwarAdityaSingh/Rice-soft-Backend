import { brokerDAO } from '../dao/broker.dao';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { CreateBrokerDTO, UpdateBrokerDTO, Broker, BrokerType } from '../models/broker.model';
import { gstLookupService } from './gst-lookup.service';
import { logger } from '../utils/logger';

export class BrokerService {
  async getAllBrokers(includeInactive: boolean, type?: BrokerType): Promise<Broker[]> {
    return await brokerDAO.findAll(includeInactive, type);
  }

  async getBrokerById(id: string): Promise<Broker> {
    const broker = await brokerDAO.findById(id);
    if (!broker) {
      throw new NotFoundError('Broker not found');
    }
    return broker;
  }

  async createBroker(brokerData: CreateBrokerDTO): Promise<Broker> {
    // Check if email already exists
    const primaryEmail = brokerData.contact_persons?.[0]?.emails?.[0];
    if (primaryEmail) {
      const emailExists = await brokerDAO.emailExists(primaryEmail);
    if (emailExists) {
      throw new ConflictError('Email already exists');
      }
    }

    // Check if GST already exists (if provided)
    if (brokerData.business_details?.gst_number) {
      const gstExists = await brokerDAO.gstExists(brokerData.business_details.gst_number);
      if (gstExists) {
        throw new ConflictError('GST number already exists');
      }
    }

    // Check if PAN already exists (if provided)
    if (brokerData.business_details?.pan_number) {
      const panExists = await brokerDAO.panExists(brokerData.business_details.pan_number);
      if (panExists) {
        throw new ConflictError('PAN number already exists');
      }
    }

    logger.info('Creating broker', {
      businessName: brokerData.business_name,
      email: primaryEmail,
      type: brokerData.type
    });

    return await brokerDAO.create(brokerData);
  }

  async updateBroker(id: string, brokerData: UpdateBrokerDTO): Promise<Broker> {
    // Check if broker exists
    const existingBroker = await brokerDAO.findById(id);
    if (!existingBroker) {
      throw new NotFoundError('Broker not found');
    }

    // Check if email already exists (if being updated)
    const newEmail = brokerData.contact_persons?.[0]?.emails?.[0];
    const existingEmail = existingBroker.contact_persons?.[0]?.emails?.[0];
    if (newEmail && newEmail !== existingEmail) {
      const emailExists = await brokerDAO.emailExists(newEmail, id);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }
    }

    // Check if GST already exists (if being updated)
    if (brokerData.business_details?.gst_number) {
      const gstExists = await brokerDAO.gstExists(brokerData.business_details.gst_number, id);
      if (gstExists) {
        throw new ConflictError('GST number already exists');
      }
    }

    // Check if PAN already exists (if being updated)
    if (brokerData.business_details?.pan_number) {
      const panExists = await brokerDAO.panExists(brokerData.business_details.pan_number, id);
      if (panExists) {
        throw new ConflictError('PAN number already exists');
      }
    }

    logger.info('Updating broker', { brokerId: id });

    const broker = await brokerDAO.update(id, brokerData);
    if (!broker) {
      throw new NotFoundError('Broker not found after update');
    }

    return broker;
  }

  async deleteBroker(id: string): Promise<void> {
    const broker = await brokerDAO.findById(id);
    if (!broker) {
      throw new NotFoundError('Broker not found');
    }

    logger.info('Deleting broker', { brokerId: id });
    await brokerDAO.delete(id);
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

  async createBrokerFromGST(
    gstNumber: string,
    contactPersons: Array<{ name: string; phones: string[]; emails?: string[] }>,
    type: BrokerType,
    brokerDetails: any,
    createdBy?: string
  ): Promise<Broker> {
    // Validate GST format
    if (!gstLookupService.validateGSTFormat(gstNumber)) {
      throw new ValidationError('Invalid GST number format');
    }

    // Check if GST already exists
    const gstExists = await brokerDAO.gstExists(gstNumber);
    if (gstExists) {
      throw new ConflictError('GST number already exists');
    }

    // Check if email already exists
    const primaryEmail = contactPersons[0]?.emails?.[0];
    if (primaryEmail) {
      const emailExists = await brokerDAO.emailExists(primaryEmail);
    if (emailExists) {
      throw new ConflictError('Email already exists');
      }
    }

    // Fetch GST details
    const gstData = await gstLookupService.lookupGST(gstNumber);
    const mappedData = gstLookupService.mapGSTToBusinessData(gstData);

    // Create broker with fetched + provided data
    const brokerData: CreateBrokerDTO = {
      business_name: mappedData.business_name,
      contact_persons: contactPersons,
      address: mappedData.address,
      business_details: {
        ...mappedData.business_details,
        gst_number: gstNumber,
      },
      broker_details: brokerDetails || null,
      type: type as any,
      is_active: true,
      created_by: createdBy,
    };

    return await brokerDAO.create(brokerData);
  }

  async createBrokerFromPAN(
    panNumber: string,
    businessName: string | undefined,
    contactPersons: Array<{ name: string; phones: string[]; emails?: string[] }>,
    address: any,
    type: string,
    brokerDetails: any,
    createdBy?: string
  ): Promise<Broker> {
    // Validate PAN format
    if (!gstLookupService.validatePANFormat(panNumber)) {
      throw new ValidationError('Invalid PAN number format');
    }

    // Check if PAN already exists
    const panExists = await brokerDAO.panExists(panNumber);
    if (panExists) {
      throw new ConflictError('PAN number already exists');
    }

    // Check if email already exists
    const primaryEmail = contactPersons[0]?.emails?.[0];
    if (primaryEmail) {
      const emailExists = await brokerDAO.emailExists(primaryEmail);
    if (emailExists) {
      throw new ConflictError('Email already exists');
      }
    }

    // Fetch PAN details
    const panData = await gstLookupService.lookupPAN(panNumber);
    const mappedData = gstLookupService.mapPANToBusinessData(panData);

    // Create broker with fetched + provided data
    const brokerData: CreateBrokerDTO = {
      business_name: businessName || mappedData.business_name,
      contact_persons: contactPersons,
      address,
      business_details: {
        ...mappedData.business_details,
        pan_number: panNumber,
      },
      broker_details: brokerDetails || null,
      type: type as any,
      is_active: true,
      created_by: createdBy,
    };

    return await brokerDAO.create(brokerData);
  }
}

export const brokerService = new BrokerService();

