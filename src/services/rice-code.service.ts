import { RiceCodeDAO } from '../dao/rice-code.dao';
import { NotFoundError, ConflictError } from '../utils/errors';
import { CreateRiceCodeDTO, UpdateRiceCodeDTO, RiceCode } from '../models/rice-code.model';
import { logger } from '../utils/logger';

const riceCodeDAO = new RiceCodeDAO();

export class RiceCodeService {
  async getAllRiceCodes(): Promise<RiceCode[]> {
    return await riceCodeDAO.findAll();
  }

  async getRiceCodeById(riceCodeId: string): Promise<RiceCode> {
    const riceCode = await riceCodeDAO.findById(riceCodeId);
    if (!riceCode) {
      throw new NotFoundError('Rice code not found');
    }
    return riceCode;
  }

  async getRiceCodeByName(riceCodeName: string): Promise<RiceCode> {
    const riceCode = await riceCodeDAO.findByName(riceCodeName);
    if (!riceCode) {
      throw new NotFoundError('Rice code not found');
    }
    return riceCode;
  }

  async createRiceCode(riceCodeData: CreateRiceCodeDTO): Promise<RiceCode> {
    // Check if rice code name already exists
    const nameExists = await riceCodeDAO.nameExists(riceCodeData.rice_code_name);
    if (nameExists) {
      throw new ConflictError('Rice code with this name already exists');
    }

    logger.info('Creating rice code', {
      riceCodeName: riceCodeData.rice_code_name
    });

    return await riceCodeDAO.create(riceCodeData);
  }

  async updateRiceCode(riceCodeId: string, riceCodeData: UpdateRiceCodeDTO): Promise<RiceCode> {
    // Check if rice code exists
    const existingRiceCode = await riceCodeDAO.findById(riceCodeId);
    if (!existingRiceCode) {
      throw new NotFoundError('Rice code not found');
    }

    // Check if name conflicts (if being updated)
    if (riceCodeData.rice_code_name && riceCodeData.rice_code_name !== existingRiceCode.rice_code_name) {
      const nameExists = await riceCodeDAO.nameExists(riceCodeData.rice_code_name, riceCodeId);
      if (nameExists) {
        throw new ConflictError('Rice code with this name already exists');
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
}

export const riceCodeService = new RiceCodeService();

