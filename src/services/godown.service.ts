import { godownDAO } from '../dao/godown.dao';
import type { Godown, CreateGodownDTO, UpdateGodownDTO } from '../models/godown.model';
import { NotFoundError, ValidationError } from '../utils/errors';

export class GodownService {
  async list(
    includeInactive = false,
    pagination?: { limit: number; offset: number },
    search?: string
  ): Promise<{ items: Godown[]; total: number }> {
    const { rows, total } = await godownDAO.findAll(includeInactive, pagination, search);
    return { items: rows, total };
  }

  async getById(id: string): Promise<Godown> {
    const godown = await godownDAO.findById(id);
    if (!godown) throw new NotFoundError('Godown not found');
    return godown;
  }

  async assertActive(id: string): Promise<Godown> {
    const godown = await this.getById(id);
    if (!godown.is_active) throw new ValidationError('Godown is inactive');
    return godown;
  }

  async create(data: CreateGodownDTO): Promise<Godown> {
    return godownDAO.create(data);
  }

  async update(id: string, data: UpdateGodownDTO): Promise<Godown> {
    const existing = await godownDAO.findById(id);
    if (!existing) throw new NotFoundError('Godown not found');
    const updated = await godownDAO.update(id, data);
    if (!updated) throw new NotFoundError('Godown not found after update');
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await godownDAO.findById(id);
    if (!existing) throw new NotFoundError('Godown not found');
    const deleted = await godownDAO.delete(id);
    if (!deleted) throw new NotFoundError('Godown not found');
  }
}

export const godownService = new GodownService();
