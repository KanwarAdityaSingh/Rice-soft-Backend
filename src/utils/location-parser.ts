/**
 * Utility functions to parse Google Maps location links and Plus Codes
 * and extract latitude/longitude coordinates
 */

const OpenLocationCode = require('open-location-code').OpenLocationCode;

export interface ParsedLocation {
  latitude: number;
  longitude: number;
  source: 'google_maps_link' | 'plus_code' | 'coordinates' | 'invalid';
}

/**
 * Parse Google Maps link and extract coordinates
 * Supports various Google Maps URL formats:
 * - https://maps.google.com/?q=lat,lng
 * - https://www.google.com/maps/place/.../@lat,lng,zoom
 * - https://goo.gl/maps/...
 * - https://maps.app.goo.gl/...
 */
export function parseGoogleMapsLink(link: string): ParsedLocation | null {
  if (!link || typeof link !== 'string') {
    return null;
  }

  try {
    // Remove whitespace
    link = link.trim();

    // Pattern 1: ?q=lat,lng or ?q=lat,lng,zoom
    const qParamMatch = link.match(/[?&]q=([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/);
    if (qParamMatch) {
      const lat = parseFloat(qParamMatch[1]);
      const lng = parseFloat(qParamMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        return {
          latitude: lat,
          longitude: lng,
          source: 'google_maps_link'
        };
      }
    }

    // Pattern 2: /@lat,lng,zoom or /@lat,lng
    const atParamMatch = link.match(/\/@([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/);
    if (atParamMatch) {
      const lat = parseFloat(atParamMatch[1]);
      const lng = parseFloat(atParamMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        return {
          latitude: lat,
          longitude: lng,
          source: 'google_maps_link'
        };
      }
    }

    // Pattern 3: /place/.../@lat,lng
    const placeMatch = link.match(/\/place\/[^/]+\/@([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/);
    if (placeMatch) {
      const lat = parseFloat(placeMatch[1]);
      const lng = parseFloat(placeMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        return {
          latitude: lat,
          longitude: lng,
          source: 'google_maps_link'
        };
      }
    }

    // Pattern 4: Direct coordinates in URL (lat,lng)
    const directCoordsMatch = link.match(/([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/);
    if (directCoordsMatch && !link.includes('http')) {
      const lat = parseFloat(directCoordsMatch[1]);
      const lng = parseFloat(directCoordsMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        return {
          latitude: lat,
          longitude: lng,
          source: 'coordinates'
        };
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse Google Plus Code and convert to coordinates
 * Plus Code format: 8FVC+2X Mumbai (or just 8FVC+2X)
 * Note: This is a simplified implementation. For production, consider using
 * the official Plus Codes library: @openlocationcode/openlocationcode
 */
export function parsePlusCode(plusCode: string): ParsedLocation | null {
  if (!plusCode || typeof plusCode !== 'string') {
    return null;
  }

  try {
    // Remove whitespace and extract the code part (before any space or comma)
    const codeMatch = plusCode.trim().match(/^([A-Z0-9]{2,}\+[A-Z0-9]{2,})/i);
    if (!codeMatch) {
      return null;
    }

    const code = codeMatch[1].toUpperCase();

    // Create an instance of OpenLocationCode
    const olc = new OpenLocationCode();

    // Validate the Plus Code format
    if (!olc.isValid(code)) {
      return null;
    }

    // Decode the Plus Code to get coordinates
    const codeArea = olc.decode(code);
    
    if (!codeArea) {
      return null;
    }

    return {
      latitude: codeArea.latitudeCenter,
      longitude: codeArea.longitudeCenter,
      source: 'plus_code'
    };
  } catch (error) {
    return null;
  }
}

/**
 * Main function to parse any location input (Google Maps link, Plus Code, or coordinates)
 * Returns parsed coordinates or null if invalid
 */
export function parseLocationInput(input: string | null | undefined): ParsedLocation | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // Try Google Maps link first
  const mapsLinkResult = parseGoogleMapsLink(trimmed);
  if (mapsLinkResult) {
    return mapsLinkResult;
  }

  // Try Plus Code
  const plusCodeResult = parsePlusCode(trimmed);
  if (plusCodeResult) {
    return plusCodeResult;
  }

  return null;
}

/**
 * Validate if coordinates are within valid ranges
 */
function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Extract coordinates from location input
 * Returns { latitude, longitude } or null
 */
export function extractCoordinates(locationInput: string | null | undefined): { latitude: number; longitude: number } | null {
  const parsed = parseLocationInput(locationInput);
  if (parsed) {
    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude
    };
  }
  return null;
}

