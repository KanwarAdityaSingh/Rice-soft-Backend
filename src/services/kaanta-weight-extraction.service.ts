import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import {
  checkParchiVehicleAgainstInwardSlipPass,
  type ParchiVehicleCheckResult,
} from '../utils/kaanta-parchi-vehicle-check';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

const NET_WEIGHT_TOLERANCE_KG = 10;

const KAANTA_EXTRACTION_SYSTEM_PROMPT = `You extract weighbridge (kaanta) slip data from photos of Indian truck weighbridge receipts.

Return ONLY valid JSON with this exact shape (use null for any field you cannot read confidently):
{
  "full_truck_weight": number | null,
  "empty_truck_weight": number | null,
  "kaanta_weight": number | null,
  "vehicle_number": string | null,
  "ticket_number": string | null
}

Field mapping:
- full_truck_weight = Gross Wt / Bhara / loaded truck weight in kg (number only, no unit)
- empty_truck_weight = Tare Wt / Khaali / empty truck weight in kg (number only, no unit)
- kaanta_weight = Net Wt / net weight in kg (number only, no unit)
- vehicle_number = Vehicle No / registration number (uppercase, no spaces if possible)
- ticket_number = Ticket No / slip number as printed (string)

Rules:
- Strip "kg" and commas from weights; return plain numbers.
- If gross and tare are visible but net is missing, compute net = gross - tare.
- Do not invent values. Use null when unreadable.
- vehicle_number and ticket_number are optional — null if not visible.`;

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
    };
  }>;
}

interface RawKaantaExtraction {
  full_truck_weight?: number | null;
  empty_truck_weight?: number | null;
  kaanta_weight?: number | null;
  vehicle_number?: string | null;
  ticket_number?: string | null;
}

export interface KaantaWeightExtractionValidation {
  weights_extracted: boolean;
  net_matches_gross_minus_tare: boolean | null;
}

export interface KaantaWeightExtractionResult {
  full_truck_weight: number | null;
  empty_truck_weight: number | null;
  kaanta_weight: number | null;
  vehicle_number: string | null;
  ticket_number: string | null;
  needs_review: boolean;
  validation: KaantaWeightExtractionValidation;
  vehicle_check: ParchiVehicleCheckResult;
}

function parsePositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

function parseOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function validateExtractedWeights(
  full: number | null,
  empty: number | null,
  net: number | null
): KaantaWeightExtractionValidation {
  const weightsExtracted = full !== null && empty !== null;

  if (!weightsExtracted || net === null) {
    return {
      weights_extracted: weightsExtracted,
      net_matches_gross_minus_tare: null,
    };
  }

  const expectedNet = full - empty;
  const netMatches = Math.abs(net - expectedNet) <= NET_WEIGHT_TOLERANCE_KG;

  return {
    weights_extracted: true,
    net_matches_gross_minus_tare: netMatches,
  };
}

function buildNeedsReview(
  validation: KaantaWeightExtractionValidation,
  full: number | null,
  empty: number | null
): boolean {
  if (!validation.weights_extracted) {
    return true;
  }
  if (validation.net_matches_gross_minus_tare === false) {
    return true;
  }
  if (full !== null && empty !== null && full <= empty) {
    return true;
  }
  return false;
}

function parseExtractionJson(content: string): RawKaantaExtraction | null {
  try {
    return JSON.parse(content) as RawKaantaExtraction;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]) as RawKaantaExtraction;
    } catch {
      return null;
    }
  }
}

function imageMimeToDataUrl(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function extractKaantaWeightsFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  inwardSlipPassId?: string
): Promise<KaantaWeightExtractionResult> {
  const { apiKey, kaantaModel, kaantaExtractionEnabled } = appConfig.openai;

  if (!kaantaExtractionEnabled || !apiKey) {
    throw new Error('Kaanta weight extraction is not configured');
  }

  const model = kaantaModel;

  const dataUrl = imageMimeToDataUrl(mimeType, imageBuffer);

  const requestBody: Record<string, unknown> = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: KAANTA_EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract weighbridge slip fields from this kaanta parchi image.',
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl, detail: 'high' },
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 256,
  };

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.warn('Kaanta weight extraction OpenAI request failed', {
      status: response.status,
      body: errorBody.slice(0, 500),
    });
    throw new Error('Failed to extract weights from kaanta slip image');
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  const raw = parseExtractionJson(content);

  if (!raw) {
    logger.warn('Kaanta weight extraction returned invalid JSON', { content: content.slice(0, 500) });
    throw new Error('Failed to parse extracted kaanta slip data');
  }

  let fullTruckWeight = parsePositiveNumber(raw.full_truck_weight);
  let emptyTruckWeight = parsePositiveNumber(raw.empty_truck_weight);
  let kaantaWeight = parsePositiveNumber(raw.kaanta_weight);

  if (fullTruckWeight !== null && emptyTruckWeight !== null && kaantaWeight === null) {
    kaantaWeight = Math.round((fullTruckWeight - emptyTruckWeight) * 100) / 100;
  }

  const vehicleNumber = parseOptionalString(raw.vehicle_number);
  const ticketNumber = parseOptionalString(raw.ticket_number);

  const validation = validateExtractedWeights(fullTruckWeight, emptyTruckWeight, kaantaWeight);
  const needsReview = buildNeedsReview(validation, fullTruckWeight, emptyTruckWeight);

  const vehicleCheck = await checkParchiVehicleAgainstInwardSlipPass(
    vehicleNumber,
    inwardSlipPassId
  );

  logger.info('Kaanta weight extraction completed', {
    weightsExtracted: validation.weights_extracted,
    needsReview,
    vehicleMismatchFlagged: vehicleCheck.mismatch_flagged,
    inwardSlipPassId: inwardSlipPassId ?? null,
  });

  return {
    full_truck_weight: fullTruckWeight,
    empty_truck_weight: emptyTruckWeight,
    kaanta_weight: kaantaWeight,
    vehicle_number: vehicleNumber,
    ticket_number: ticketNumber,
    needs_review: needsReview || vehicleCheck.mismatch_flagged,
    validation,
    vehicle_check: vehicleCheck,
  };
}

export const kaantaWeightExtractionService = {
  extractKaantaWeightsFromImage,
};
