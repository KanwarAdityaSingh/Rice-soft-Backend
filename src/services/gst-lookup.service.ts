import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

/**
 * GST API Response Interface
 * Based on GST Public Search API structure
 */
export interface GSTLookupResponse {
  gstin: string;
  legalName: string;
  tradeName: string;
  registrationDate: string;
  constitutionOfBusiness: string;
  taxpayerType: string;
  gstinStatus: string;
  lastUpdateDate: string;
  principalPlaceOfBusiness: {
    buildingName: string;
    buildingNumber: string;
    floorNumber: string;
    street: string;
    location: string;
    district: string;
    city: string;
    state: string;
    pincode: string;
    latitude: string;
    longitude: string;
  };
  additionalPlacesOfBusiness: any[];
  filingStatus: any[];
}

/**
 * PAN API Response Interface
 * Based on Income Tax PAN Verification API structure
 */
export interface PANLookupResponse {
  pan: string;
  name: string;
  category: string;
  status: string;
  lastUpdated: string;
}

/**
 * Mapped Business Data Interface
 * Standardized format for our application
 */
export interface MappedBusinessData {
  business_name: string;
  legal_name?: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  business_details: {
    pan_number?: string;
    gst_number?: string;
    registration_number?: string;
    business_type?: 'individual' | 'partnership' | 'company' | 'llp';
  };
  registration_date?: string;
  status?: string;
}

export class GSTLookupService {
  // API configuration (for future production use)
  // private static readonly GST_API_BASE_URL = process.env.GST_API_URL || 'https://api.gst.gov.in';
  // private static readonly PAN_API_BASE_URL = process.env.PAN_API_URL || 'https://api.incometax.gov.in';
  // private static readonly API_KEY = process.env.GST_PAN_API_KEY || '';
  
  /**
   * Validate GST Number Format
   * Format: 15 characters - 2 digits (state code) + 10 chars (PAN) + 1 char (entity number) + 1 char (Z) + 1 char (checksum)
   */
  static validateGSTFormat(gstNumber: string): boolean {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstRegex.test(gstNumber);
  }

  /**
   * Validate PAN Number Format
   * Format: 10 characters - 5 letters + 4 digits + 1 letter
   */
  static validatePANFormat(panNumber: string): boolean {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(panNumber);
  }

  /**
   * Validate Aadhaar Number Format
   * Format: 12 digits (with or without spaces)
   */
  static validateAadhaarFormat(aadhaarNumber: string): boolean {
    // Remove spaces if present
    const cleaned = aadhaarNumber.replace(/\s/g, '');
    // Must be exactly 12 digits, not starting with 0 or 1
    const aadhaarRegex = /^[2-9]{1}[0-9]{11}$/;
    return aadhaarRegex.test(cleaned);
  }

  /**
   * Extract PAN from GST Number
   * PAN is characters 3-12 of GST number
   */
  static extractPANFromGST(gstNumber: string): string {
    if (!this.validateGSTFormat(gstNumber)) {
      throw new ValidationError('Invalid GST number format');
    }
    return gstNumber.substring(2, 12);
  }

  /**
   * Lookup GST Number
   * NOTE: This is a mock implementation. In production, you would call the actual GST API.
   * For real implementation, you need to register with GST Suvidha Provider (GSP) or use services like:
   * - Razorpay GST API
   * - ClearTax API
   * - MasterIndia API
   */
  static async lookupGST(gstNumber: string): Promise<GSTLookupResponse> {
    // Validate format
    if (!this.validateGSTFormat(gstNumber)) {
      throw new ValidationError('Invalid GST number format. Expected format: 27ABCDE1234F1Z5');
    }

    logger.info('GST lookup requested', { gstNumber });

    // MOCK IMPLEMENTATION - Replace with actual API call
    // In production, uncomment and configure:
    /*
    try {
      const response = await fetch(`${this.GST_API_BASE_URL}/search/${gstNumber}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`GST API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('GST lookup failed', { gstNumber, error });
      throw new Error('Failed to fetch GST details from government API');
    }
    */

    // MOCK DATA for development/testing
    const mockData: GSTLookupResponse = {
      gstin: gstNumber,
      legalName: 'Sample Business Private Limited',
      tradeName: 'Sample Business',
      registrationDate: '2020-01-15',
      constitutionOfBusiness: 'Private Limited Company',
      taxpayerType: 'Regular',
      gstinStatus: 'Active',
      lastUpdateDate: new Date().toISOString().split('T')[0],
      principalPlaceOfBusiness: {
        buildingName: 'Business Tower',
        buildingNumber: '123',
        floorNumber: '5',
        street: 'MG Road',
        location: 'Andheri West',
        district: 'Mumbai',
        city: 'Mumbai',
        state: this.getStateFromGST(gstNumber),
        pincode: '400001',
        latitude: '19.1136',
        longitude: '72.8697',
      },
      additionalPlacesOfBusiness: [],
      filingStatus: [],
    };

    logger.info('GST lookup successful (MOCK)', { gstNumber });
    return mockData;
  }

  /**
   * Lookup PAN Number
   * NOTE: This is a mock implementation. In production, you would call the actual PAN verification API.
   */
  static async lookupPAN(panNumber: string): Promise<PANLookupResponse> {
    // Validate format
    if (!this.validatePANFormat(panNumber)) {
      throw new ValidationError('Invalid PAN number format. Expected format: ABCDE1234F');
    }

    logger.info('PAN lookup requested', { panNumber });

    // MOCK IMPLEMENTATION - Replace with actual API call
    // In production, uncomment and configure:
    /*
    try {
      const response = await fetch(`${this.PAN_API_BASE_URL}/verify/${panNumber}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`PAN API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('PAN lookup failed', { panNumber, error });
      throw new Error('Failed to fetch PAN details from government API');
    }
    */

    // MOCK DATA for development/testing
    const mockData: PANLookupResponse = {
      pan: panNumber,
      name: 'Sample Business Entity',
      category: 'Company',
      status: 'Active',
      lastUpdated: new Date().toISOString().split('T')[0],
    };

    logger.info('PAN lookup successful (MOCK)', { panNumber });
    return mockData;
  }

  /**
   * Map GST API response to our application format
   */
  static mapGSTToBusinessData(gstData: GSTLookupResponse): MappedBusinessData {
    const address = gstData.principalPlaceOfBusiness;
    
    // Determine business type from constitution
    let businessType: 'individual' | 'partnership' | 'company' | 'llp' = 'company';
    const constitution = gstData.constitutionOfBusiness.toLowerCase();
    if (constitution.includes('individual') || constitution.includes('proprietor')) {
      businessType = 'individual';
    } else if (constitution.includes('partnership')) {
      businessType = 'partnership';
    } else if (constitution.includes('llp') || constitution.includes('limited liability')) {
      businessType = 'llp';
    }

    return {
      business_name: gstData.tradeName || gstData.legalName,
      legal_name: gstData.legalName,
      address: {
        street: [address.buildingNumber, address.buildingName, address.street].filter(Boolean).join(', '),
        city: address.city || address.district,
        state: address.state,
        pincode: address.pincode,
        country: 'India',
      },
      business_details: {
        gst_number: gstData.gstin,
        pan_number: this.extractPANFromGST(gstData.gstin),
        registration_number: gstData.gstin,
        business_type: businessType,
      },
      registration_date: gstData.registrationDate,
      status: gstData.gstinStatus,
    };
  }

  /**
   * Map PAN API response to our application format
   */
  static mapPANToBusinessData(panData: PANLookupResponse): MappedBusinessData {
    // Determine business type from category
    let businessType: 'individual' | 'partnership' | 'company' | 'llp' = 'company';
    const category = panData.category.toLowerCase();
    if (category.includes('individual') || category.includes('person')) {
      businessType = 'individual';
    } else if (category.includes('partnership')) {
      businessType = 'partnership';
    } else if (category.includes('llp')) {
      businessType = 'llp';
    }

    return {
      business_name: panData.name,
      address: {
        street: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India',
      },
      business_details: {
        pan_number: panData.pan,
        business_type: businessType,
      },
      status: panData.status,
    };
  }

  /**
   * Get state name from GST state code
   */
  private static getStateFromGST(gstNumber: string): string {
    const stateCode = gstNumber.substring(0, 2);
    const stateMap: { [key: string]: string } = {
      '01': 'Jammu and Kashmir',
      '02': 'Himachal Pradesh',
      '03': 'Punjab',
      '04': 'Chandigarh',
      '05': 'Uttarakhand',
      '06': 'Haryana',
      '07': 'Delhi',
      '08': 'Rajasthan',
      '09': 'Uttar Pradesh',
      '10': 'Bihar',
      '11': 'Sikkim',
      '12': 'Arunachal Pradesh',
      '13': 'Nagaland',
      '14': 'Manipur',
      '15': 'Mizoram',
      '16': 'Tripura',
      '17': 'Meghalaya',
      '18': 'Assam',
      '19': 'West Bengal',
      '20': 'Jharkhand',
      '21': 'Odisha',
      '22': 'Chhattisgarh',
      '23': 'Madhya Pradesh',
      '24': 'Gujarat',
      '25': 'Daman and Diu',
      '26': 'Dadra and Nagar Haveli',
      '27': 'Maharashtra',
      '28': 'Andhra Pradesh',
      '29': 'Karnataka',
      '30': 'Goa',
      '31': 'Lakshadweep',
      '32': 'Kerala',
      '33': 'Tamil Nadu',
      '34': 'Puducherry',
      '35': 'Andaman and Nicobar Islands',
      '36': 'Telangana',
      '37': 'Andhra Pradesh',
      '38': 'Ladakh',
    };
    return stateMap[stateCode] || 'Unknown';
  }

  /**
   * Validate GST number with checksum
   * (Optional advanced validation)
   */
  static validateGSTChecksum(gstNumber: string): boolean {
    if (!this.validateGSTFormat(gstNumber)) {
      return false;
    }
    // GST checksum validation logic can be implemented here
    // For now, just format validation
    return true;
  }
}

export const gstLookupService = GSTLookupService;

