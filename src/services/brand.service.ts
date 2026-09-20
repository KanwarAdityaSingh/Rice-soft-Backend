import { brandDAO } from '../dao/brand.dao';
import { Brand, CreateBrandDTO, UpdateBrandDTO, toBrandResponse } from '../models/brand.model';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export class BrandService {
  async list(
    activeOnly = false,
    pagination?: { limit: number; offset: number },
    search?: string
  ) {
    const { rows, total } = await brandDAO.findAll(activeOnly, pagination, search);
    return { items: rows.map(toBrandResponse), total };
  }

  async getById(id: string) {
    const brand = await brandDAO.findById(id);
    if (!brand) throw new NotFoundError('Brand not found');
    return toBrandResponse(brand);
  }

  async create(data: CreateBrandDTO) {
    const existing = await brandDAO.findByName(data.name);
    if (existing) throw new ConflictError('Brand name already exists');
    try {
      const brand = await brandDAO.create(data);
      return toBrandResponse(brand);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('brands_code_prefix_unique') || msg.includes('brands_name_unique')) {
        throw new ConflictError('Brand name or code_prefix already exists');
      }
      throw err;
    }
  }

  async update(id: string, data: UpdateBrandDTO) {
    const existing = await brandDAO.findById(id);
    if (!existing) throw new NotFoundError('Brand not found');
    if (data.name) {
      const clash = await brandDAO.findByName(data.name);
      if (clash && clash.id !== id) throw new ConflictError('Brand name already exists');
    }
    const updated = await brandDAO.update(id, data);
    if (!updated) throw new NotFoundError('Brand not found');
    logger.info('Brand updated', { id });
    return toBrandResponse(updated);
  }

  async requireActive(id: string): Promise<Brand> {
    const brand = await brandDAO.findById(id);
    if (!brand) throw new NotFoundError('Brand not found');
    if (brand.status !== 'active') throw new ValidationError('Brand is not active');
    return brand;
  }
}

export const brandService = new BrandService();
