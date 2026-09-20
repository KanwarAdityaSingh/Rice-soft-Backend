import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import { vehicleDAO } from '../dao/vehicle.dao';
import { normalizeVehicleNumber } from '../utils/vehicle-number';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

const LR_EXTRACTION_SYSTEM_PROMPT = `You extract data from Indian truck LR / Bilty / GR transport receipts.
These come from many different transport companies with inconsistent layouts —
printed or handwritten, in Hindi / Punjabi / English, with or without a barcode.

Return ONLY valid JSON with this exact shape (use null for any field you cannot read confidently):
{
  "lr_number": string | null,
  "lr_number_label_seen": string | null,
  "vehicle_number": string | null,
  "transporter_name": string | null
}

lr_number is the document's OWN serial / receipt number (NOT the goods invoice/bill number,
NOT the e-way bill number, NOT a GSTIN/PAN). Look for these labels, in this priority order:
- "G.R. No." / "GR No." / "बिल्टी नं" / "ਬਿਲਟੀ ਨੰ"
- "Bilty No." / "Bilti No." / "Bilti/BiltyNo" (when it is the receipt's own serial, not the goods bill)
- A bare "No." near the top of the form (common on GTA-style forms)
- A printed number directly below a barcode (common on computer-generated LRs/e-LRs)
- "Bilty No." printed elsewhere in the body

lr_number_label_seen should be the exact label text you matched against (e.g. "G.R. No.", "No.",
"barcode number"), so a human can double check. Use null if lr_number is null.

vehicle_number: look for "Vehicle No", "Vehicle Number", "Truck No.", "गाड़ी नं", "ਟਰੱਕ ਨੰ".
Return uppercase, with spaces/dashes/slashes stripped where possible (e.g. "PB04AA9547").

transporter_name: the transport company's own name/letterhead (e.g. "Punjab Transport Company"),
not the consignor or consignee.

Do not invent values — use null when unsure. Never confuse lr_number with invoice numbers,
e-way bill numbers, bill/invoice values, or GSTIN/PAN numbers.`;

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
    };
  }>;
}

interface RawLrExtraction {
  lr_number?: string | null;
  lr_number_label_seen?: string | null;
  vehicle_number?: string | null;
  transporter_name?: string | null;
}

export interface LrVehicleMatch {
  checked: boolean;
  found: boolean;
  vehicle_id: string | null;
  vehicle_number_normalized: string | null;
}

export interface LrExtractionResult {
  lr_number: string | null;
  lr_number_label_seen: string | null;
  vehicle_number: string | null;
  transporter_name: string | null;
  /** True when lr_number or vehicle_number is missing — surface for manual review, never blocks. */
  needs_review: boolean;
  vehicle_match: LrVehicleMatch;
}

function parseOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function parseExtractionJson(content: string): RawLrExtraction | null {
  try {
    return JSON.parse(content) as RawLrExtraction;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]) as RawLrExtraction;
    } catch {
      return null;
    }
  }
}

function imageMimeToDataUrl(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function extractLrDetailsFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<LrExtractionResult> {
  const { apiKey, lrModel, lrExtractionEnabled } = appConfig.openai;

  if (!lrExtractionEnabled || !apiKey) {
    throw new Error('LR extraction is not configured');
  }

  const dataUrl = imageMimeToDataUrl(mimeType, imageBuffer);

  const requestBody: Record<string, unknown> = {
    model: lrModel,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: LR_EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract the LR/Bilty/GR fields from this transport receipt image.',
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
    logger.warn('LR extraction OpenAI request failed', {
      status: response.status,
      body: errorBody.slice(0, 500),
    });
    throw new Error('Failed to extract details from LR/Bilty image');
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  const raw = parseExtractionJson(content);

  if (!raw) {
    logger.warn('LR extraction returned invalid JSON', { content: content.slice(0, 500) });
    throw new Error('Failed to parse extracted LR/Bilty data');
  }

  const lrNumber = parseOptionalString(raw.lr_number);
  const lrNumberLabelSeen = lrNumber ? parseOptionalString(raw.lr_number_label_seen) : null;
  const vehicleNumber = parseOptionalString(raw.vehicle_number);
  const transporterName = parseOptionalString(raw.transporter_name);

  let vehicleMatch: LrVehicleMatch = {
    checked: false,
    found: false,
    vehicle_id: null,
    vehicle_number_normalized: null,
  };

  if (vehicleNumber) {
    const normalized = normalizeVehicleNumber(vehicleNumber);
    const vehicle = await vehicleDAO.findByVehicleNumber(vehicleNumber);
    vehicleMatch = {
      checked: true,
      found: !!vehicle,
      vehicle_id: vehicle?.id ?? null,
      vehicle_number_normalized: normalized,
    };
  }

  const needsReview = !lrNumber || !vehicleNumber;

  logger.info('LR extraction completed', {
    lrNumberExtracted: !!lrNumber,
    vehicleNumberExtracted: !!vehicleNumber,
    vehicleFound: vehicleMatch.found,
    needsReview,
  });

  return {
    lr_number: lrNumber,
    lr_number_label_seen: lrNumberLabelSeen,
    vehicle_number: vehicleNumber,
    transporter_name: transporterName,
    needs_review: needsReview,
    vehicle_match: vehicleMatch,
  };
}

export const lrExtractionService = {
  extractLrDetailsFromImage,
};
