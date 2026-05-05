import { batchDAO } from '../dao/batch.dao';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { parameterDAO } from '../dao/parameter.dao';
import { CreateParameterDTO, Parameter, UpdateParameterDTO } from '../models/parameter.model';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

function emptyToNull<T extends string | null | undefined>(v: T): string | null | undefined {
  if (v === '') return null;
  return v;
}

function normalizeCreatePayload(data: CreateParameterDTO): CreateParameterDTO {
  return {
    ...data,
    inward_slip_pass_id: emptyToNull(data.inward_slip_pass_id) ?? null,
    product_id: emptyToNull(data.product_id) ?? null,
    batch_id: emptyToNull(data.batch_id) ?? null,
    purity: emptyToNull(data.purity) ?? null,
    natural_admixture: emptyToNull(data.natural_admixture) ?? null,
    average_grain_length: emptyToNull(data.average_grain_length) ?? null,
    moisture: emptyToNull(data.moisture) ?? null,
    broken_grain: emptyToNull(data.broken_grain) ?? null,
    damage_discolour_grain: emptyToNull(data.damage_discolour_grain) ?? null,
    immature_grains: emptyToNull(data.immature_grains) ?? null,
    whiteness: emptyToNull(data.whiteness) ?? null,
    foreign_matter: emptyToNull(data.foreign_matter) ?? null,
    black_grains: emptyToNull(data.black_grains) ?? null,
  };
}

function normalizeUpdatePayload(data: UpdateParameterDTO): UpdateParameterDTO {
  const out: UpdateParameterDTO = { ...data };
  const textKeys: (keyof UpdateParameterDTO)[] = [
    'purity',
    'natural_admixture',
    'average_grain_length',
    'moisture',
    'broken_grain',
    'damage_discolour_grain',
    'immature_grains',
    'whiteness',
    'foreign_matter',
    'black_grains',
  ];
  for (const k of textKeys) {
    if (data[k] === '') {
      (out as Record<string, unknown>)[k] = null;
    }
  }
  if (data.inward_slip_pass_id === '') out.inward_slip_pass_id = null;
  if (data.product_id === '') out.product_id = null;
  if (data.batch_id === '') out.batch_id = null;
  return out;
}

export class ParameterService {
  private async validateReferences(
    inwardSlipPassId: string | null | undefined,
    batchId: string | null | undefined
  ): Promise<void> {
    if (batchId) {
      const batch = await batchDAO.findById(batchId);
      if (!batch) {
        throw new NotFoundError('Batch not found');
      }
    }
    if (inwardSlipPassId) {
      const isp = await inwardSlipPassDAO.findById(inwardSlipPassId);
      if (!isp) {
        throw new NotFoundError('Inward slip pass not found');
      }
    }
  }

  /** When product_id is set, batch_id must be set and product must be attached to that batch. */
  private async validateProductOnBatch(
    productId: string | null | undefined,
    batchId: string | null | undefined
  ): Promise<void> {
    if (!productId) {
      return;
    }
    if (!batchId) {
      throw new BadRequestError('batch_id is required when product_id is set (product must belong to the batch)');
    }
    const row = await batchDAO.getProduct(batchId, productId);
    if (!row) {
      throw new BadRequestError('product_id must refer to a product attached to this batch');
    }
  }

  async create(data: CreateParameterDTO): Promise<Parameter> {
    const normalized = normalizeCreatePayload(data);
    await this.validateReferences(normalized.inward_slip_pass_id, normalized.batch_id);
    await this.validateProductOnBatch(normalized.product_id, normalized.batch_id);
    const row = await parameterDAO.create(normalized);
    logger.info('Parameter row created', { id: row.id });
    return row;
  }

  async getById(id: string): Promise<Parameter> {
    const row = await parameterDAO.findById(id);
    if (!row) {
      throw new NotFoundError('Parameter record not found');
    }
    return row;
  }

  async list(filters: {
    batch_id?: string;
    product_id?: string;
    inward_slip_pass_id?: string;
  }): Promise<Parameter[]> {
    return parameterDAO.findAll(filters);
  }

  async update(id: string, data: UpdateParameterDTO): Promise<Parameter> {
    const existing = await parameterDAO.findById(id);
    if (!existing) {
      throw new NotFoundError('Parameter record not found');
    }
    const normalized = normalizeUpdatePayload(data);

    const nextBatch =
      normalized.batch_id !== undefined ? normalized.batch_id : existing.batch_id;
    const nextProduct =
      normalized.product_id !== undefined ? normalized.product_id : existing.product_id;
    const nextIsp =
      normalized.inward_slip_pass_id !== undefined
        ? normalized.inward_slip_pass_id
        : existing.inward_slip_pass_id;

    await this.validateReferences(
      nextIsp ?? undefined,
      nextBatch ?? undefined
    );

    await this.validateProductOnBatch(nextProduct, nextBatch);

    const updated = await parameterDAO.update(id, normalized);
    if (!updated) {
      throw new NotFoundError('Parameter record not found');
    }
    logger.info('Parameter row updated', { id });
    return updated;
  }

  async delete(id: string): Promise<void> {
    const deleted = await parameterDAO.delete(id);
    if (!deleted) {
      throw new NotFoundError('Parameter record not found');
    }
    logger.info('Parameter row deleted', { id });
  }
}

export const parameterService = new ParameterService();
