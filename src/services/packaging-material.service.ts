import { packagingMaterialDAO } from '../dao/packaging-material.dao';
import {
  CreatePackagingMaterialDTO,
  UpdatePackagingMaterialDTO,
  toPackagingMaterialResponse,
  PackagingMaterial,
} from '../models/packaging-material.model';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export class PackagingMaterialService {
  async list(
    activeOnly = false,
    pagination?: { limit: number; offset: number },
    search?: string
  ) {
    const { rows, total } = await packagingMaterialDAO.findAll(activeOnly, pagination, search);
    return { items: rows.map(toPackagingMaterialResponse), total };
  }

  async getById(id: string) {
    const row = await packagingMaterialDAO.findById(id);
    if (!row) throw new NotFoundError('Packaging material not found');
    return toPackagingMaterialResponse(row);
  }

  async create(data: CreatePackagingMaterialDTO) {
    try {
      const row = await packagingMaterialDAO.create(data);
      return toPackagingMaterialResponse(row);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('packaging_materials_name_unique') || msg.includes('idx_packaging_materials_name_lower')) {
        throw new ConflictError('Packaging material name already exists');
      }
      throw err;
    }
  }

  async update(id: string, data: UpdatePackagingMaterialDTO) {
    const existing = await packagingMaterialDAO.findById(id);
    if (!existing) throw new NotFoundError('Packaging material not found');
    const updated = await packagingMaterialDAO.update(id, data);
    if (!updated) throw new NotFoundError('Packaging material not found');
    logger.info('Packaging material updated', { id });
    return toPackagingMaterialResponse(updated);
  }

  async requireActive(id: string): Promise<PackagingMaterial> {
    const row = await packagingMaterialDAO.findById(id);
    if (!row) throw new NotFoundError('Packaging material not found');
    if (row.status !== 'active') throw new ValidationError('Packaging material is not active');
    return row;
  }
}

export const packagingMaterialService = new PackagingMaterialService();
