import { appConfig } from '../config/app.config';
import { brandDAO } from '../dao/brand.dao';
import { logger } from '../utils/logger';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

const BAG_EXTRACTION_SYSTEM_PROMPT = `You extract brand and product name from Indian rice bag / packaging photos
(printed packs of basmati / sella / steam rice, etc.).

Typical layout (read carefully):
- Brand name is the logo / crest / house name near the TOP of the front panel
  (e.g. "Tamaal", "Hariom", "Postman"). It is usually the largest decorative wordmark.
- Product name is the descriptive product line(s) BELOW the brand — variety / grade /
  finish text such as "EXTRA LONG BASMATI RICE", "24 CARAT", "1121 GOLDEN", "SELLA".
  Combine those product descriptor lines into one clean product_name.
  Prefer Title Case (e.g. "Extra Long Basmati Rice 24 Carat 1121 Golden Sella").

Do NOT include in product_name:
- The brand name itself
- Net weight / kg markings
- "Exciting rewards" / coupon / scratch badges
- Company legal name, address, FSSAI, or barcode numbers
- Marketing taglines unrelated to the rice variety

Return ONLY valid JSON with this exact shape (use null when you cannot read confidently):
{
  "brand_name": string | null,
  "product_name": string | null
}

Do not invent values — use null when unsure.`;

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
    };
  }>;
}

interface RawBagExtraction {
  brand_name?: string | null;
  product_name?: string | null;
}

export interface BagBrandMatch {
  checked: boolean;
  found: boolean;
  brand_id: string | null;
  brand_name: string | null;
  status: string | null;
}

export interface BagImageExtractionResult {
  brand_name: string | null;
  product_name: string | null;
  /** True when either field is missing — FE should prompt for manual review. */
  needs_review: boolean;
  brand_match: BagBrandMatch;
}

function parseOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function parseExtractionJson(content: string): RawBagExtraction | null {
  try {
    return JSON.parse(content) as RawBagExtraction;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]) as RawBagExtraction;
    } catch {
      return null;
    }
  }
}

function imageMimeToDataUrl(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function extractBagDetailsFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<BagImageExtractionResult> {
  const { apiKey, bagModel, bagExtractionEnabled } = appConfig.openai;

  if (!bagExtractionEnabled || !apiKey) {
    throw new Error('Bag image extraction is not configured');
  }

  const dataUrl = imageMimeToDataUrl(mimeType, imageBuffer);

  const requestBody: Record<string, unknown> = {
    model: bagModel,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: BAG_EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract brand_name and product_name from this rice bag / packaging image.',
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
    logger.warn('Bag image extraction OpenAI request failed', {
      status: response.status,
      body: errorBody.slice(0, 500),
    });
    throw new Error('Failed to extract details from bag image');
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  const raw = parseExtractionJson(content);

  if (!raw) {
    logger.warn('Bag image extraction returned invalid JSON', {
      content: content.slice(0, 500),
    });
    throw new Error('Failed to parse extracted bag image data');
  }

  const brandName = parseOptionalString(raw.brand_name);
  const productName = parseOptionalString(raw.product_name);

  let brandMatch: BagBrandMatch = {
    checked: false,
    found: false,
    brand_id: null,
    brand_name: null,
    status: null,
  };

  if (brandName) {
    const brand = await brandDAO.findByName(brandName);
    brandMatch = {
      checked: true,
      found: !!brand,
      brand_id: brand?.id ?? null,
      brand_name: brand?.name ?? null,
      status: brand?.status ?? null,
    };
  }

  const needsReview = !brandName || !productName;

  logger.info('Bag image extraction completed', {
    brandNameExtracted: !!brandName,
    productNameExtracted: !!productName,
    brandFound: brandMatch.found,
    needsReview,
  });

  return {
    brand_name: brandName,
    product_name: productName,
    needs_review: needsReview,
    brand_match: brandMatch,
  };
}

export const bagImageExtractionService = {
  extractBagDetailsFromImage,
};
