import { RiceCodeDAO } from '../dao/rice-code.dao';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import {
  CreateRiceCodeDTO,
  UpdateRiceCodeDTO,
  RiceCode,
  RiceCodeResponse,
} from '../models/rice-code.model';
import { logger } from '../utils/logger';
import {
  isVariantAllowedForCategory,
  type RiceCategory,
} from '../constants/rice-categories';

const riceCodeDAO = new RiceCodeDAO();

function assertVariantsMatchCategory(category: RiceCategory, variants: string[]): void {
  const invalid = variants.filter((v) => !isVariantAllowedForCategory(category, v));
  if (invalid.length > 0) {
    throw new ValidationError(
      `Invalid variant(s) for ${category}: ${invalid.join(', ')}`
    );
  }
  if (variants.length === 0) {
    throw new ValidationError('At least one variant is required');
  }
}

export function toRiceCodeResponse(riceCode: RiceCode): RiceCodeResponse {
  return {
    rice_code_id: riceCode.rice_code_id,
    rice_code_name: riceCode.rice_code_name,
    category: riceCode.category,
    variants: riceCode.variants.map((v) => ({
      id: v.id,
      variant: v.variant,
      created_at: v.created_at.toISOString(),
      updated_at: v.updated_at.toISOString(),
    })),
    created_at: riceCode.created_at.toISOString(),
    updated_at: riceCode.updated_at.toISOString(),
    created_by: riceCode.created_by,
    updated_by: riceCode.updated_by,
  };
}

export class RiceCodeService {
  async getAllRiceCodes(category?: RiceCategory): Promise<RiceCode[]> {
    return riceCodeDAO.findAll(category);
  }

  async getRiceCodeById(riceCodeId: string): Promise<RiceCode> {
    const riceCode = await riceCodeDAO.findById(riceCodeId);
    if (!riceCode) {
      throw new NotFoundError('Rice code not found');
    }
    return riceCode;
  }

  async getRiceCodeByName(riceCodeName: string, category?: RiceCategory): Promise<RiceCode> {
    const riceCode = await riceCodeDAO.findByName(riceCodeName, category);
    if (!riceCode) {
      throw new NotFoundError('Rice code not found');
    }
    return riceCode;
  }

  async createRiceCode(riceCodeData: CreateRiceCodeDTO): Promise<RiceCode> {
    assertVariantsMatchCategory(riceCodeData.category, riceCodeData.variants);

    const nameExists = await riceCodeDAO.nameExists(
      riceCodeData.rice_code_name,
      riceCodeData.category
    );
    if (nameExists) {
      throw new ConflictError('Rice code with this name already exists for this category');
    }

    logger.info('Creating rice code', {
      riceCodeName: riceCodeData.rice_code_name,
      category: riceCodeData.category,
    });

    return riceCodeDAO.create(riceCodeData);
  }

  async updateRiceCode(riceCodeId: string, riceCodeData: UpdateRiceCodeDTO): Promise<RiceCode> {
    const existingRiceCode = await riceCodeDAO.findById(riceCodeId);
    if (!existingRiceCode) {
      throw new NotFoundError('Rice code not found');
    }

    const category = riceCodeData.category ?? existingRiceCode.category;
    if (riceCodeData.variants !== undefined) {
      assertVariantsMatchCategory(category, riceCodeData.variants);
    }

    const nextName = riceCodeData.rice_code_name ?? existingRiceCode.rice_code_name;
    if (
      nextName !== existingRiceCode.rice_code_name ||
      category !== existingRiceCode.category
    ) {
      const nameExists = await riceCodeDAO.nameExists(nextName, category, riceCodeId);
      if (nameExists) {
        throw new ConflictError('Rice code with this name already exists for this category');
      }
    }

    logger.info('Updating rice code', { riceCodeId });

    const updatedRiceCode = await riceCodeDAO.update(riceCodeId, riceCodeData);
    if (!updatedRiceCode) {
      throw new NotFoundError('Rice code not found after update');
    }

    return updatedRiceCode;
  }

  async deleteRiceCode(riceCodeId: string): Promise<void> {
    const riceCode = await riceCodeDAO.findById(riceCodeId);
    if (!riceCode) {
      throw new NotFoundError('Rice code not found');
    }

    logger.info('Deleting rice code', { riceCodeId });
    const deleted = await riceCodeDAO.delete(riceCodeId);
    if (!deleted) {
      throw new NotFoundError('Rice code not found after deletion');
    }
  }

  async assertSaudaRiceSelection(input: {
    rice_category: RiceCategory;
    rice_code_id?: string | null;
    rice_type: string;
  }): Promise<void> {
    if (!isVariantAllowedForCategory(input.rice_category, input.rice_type)) {
      throw new ValidationError(
        `rice_type "${input.rice_type}" is not valid for category "${input.rice_category}"`
      );
    }

    if (!input.rice_code_id) {
      return;
    }

    const riceCode = await riceCodeDAO.findById(input.rice_code_id);
    if (!riceCode) {
      throw new NotFoundError('Rice code not found');
    }
    if (riceCode.category !== input.rice_category) {
      throw new ValidationError(
        `Rice code category "${riceCode.category}" does not match selected category "${input.rice_category}"`
      );
    }
    const allowed = riceCode.variants.some((v) => v.variant === input.rice_type);
    if (!allowed) {
      throw new ValidationError(
        `rice_type "${input.rice_type}" is not configured for rice code "${riceCode.rice_code_name}"`
      );
    }
  }
}

export const riceCodeService = new RiceCodeService();
