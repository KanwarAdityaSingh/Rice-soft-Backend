import { riceLengthDAO } from '../dao/rice-length.dao';
import { ConflictError, NotFoundError } from '../utils/errors';
import {
  CreateRiceLengthDTO,
  UpdateRiceLengthDTO,
  RiceLength,
  RiceLengthResponse,
} from '../models/rice-length.model';
import { logger } from '../utils/logger';

export function toRiceLengthResponse(row: RiceLength): RiceLengthResponse {
  return {
    rice_length_id: row.rice_length_id,
    name: row.name,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    created_by: row.created_by,
    updated_by: row.updated_by,
  };
}

export class RiceLengthService {
  async getAll(includeInactive = false): Promise<RiceLength[]> {
    return riceLengthDAO.findAll(includeInactive);
  }

  async getById(riceLengthId: string): Promise<RiceLength> {
    const row = await riceLengthDAO.findById(riceLengthId);
    if (!row) {
      throw new NotFoundError('Rice length not found');
    }
    return row;
  }

  async create(data: CreateRiceLengthDTO): Promise<RiceLength> {
    logger.info('Creating rice length', { name: data.name });
    return riceLengthDAO.create(data);
  }

  async update(riceLengthId: string, data: UpdateRiceLengthDTO): Promise<RiceLength> {
    const existing = await riceLengthDAO.findById(riceLengthId);
    if (!existing) {
      throw new NotFoundError('Rice length not found');
    }

    const updated = await riceLengthDAO.update(riceLengthId, data);
    if (!updated) {
      throw new NotFoundError('Rice length not found after update');
    }
    return updated;
  }

  async delete(riceLengthId: string): Promise<void> {
    const existing = await riceLengthDAO.findById(riceLengthId);
    if (!existing) {
      throw new NotFoundError('Rice length not found');
    }

    const refCount = await riceLengthDAO.countSaudaReferences(riceLengthId);
    if (refCount > 0) {
      throw new ConflictError(`Cannot delete rice length linked to ${refCount} sauda(s)`);
    }

    logger.info('Deleting rice length', { riceLengthId });
    const deleted = await riceLengthDAO.delete(riceLengthId);
    if (!deleted) {
      throw new NotFoundError('Rice length not found after deletion');
    }
  }
}

export const riceLengthService = new RiceLengthService();
