import { batchDAO } from '../dao/batch.dao';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { parameterDAO } from '../dao/parameter.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { CreateParameterDTO, Parameter, UpdateParameterDTO } from '../models/parameter.model';
import { PoolClient } from 'pg';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  SaudaParametersInput,
} from '../constants/sauda-parameters';

function emptyToNull<T extends string | null | undefined>(v: T): string | null | undefined {
  if (v === '') return null;
  return v;
}

function normalizeCreatePayload(data: CreateParameterDTO): CreateParameterDTO {
  return {
    ...data,
    sauda_id: emptyToNull(data.sauda_id) ?? null,
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
  if (data.sauda_id === '') out.sauda_id = null;
  return out;
}

const FULL_LAB_ONLY_FIELDS = [
  'purity',
  'natural_admixture',
  'moisture',
  'broken_grain',
  'damage_discolour_grain',
  'immature_grains',
  'foreign_matter',
  'black_grains',
] as const;

export class ParameterService {
  private assertSaudaScopePayload(data: CreateParameterDTO | UpdateParameterDTO): void {
    for (const field of FULL_LAB_ONLY_FIELDS) {
      const value = (data as Record<string, unknown>)[field];
      if (value !== undefined && value !== null) {
        throw new BadRequestError(`${field} is not allowed on sauda quality parameters`);
      }
    }
    if (data.inward_slip_pass_id) {
      throw new BadRequestError('inward_slip_pass_id cannot be set when linking parameters to a sauda');
    }
    if (data.product_id) {
      throw new BadRequestError('product_id cannot be set when linking parameters to a sauda');
    }
    if (data.batch_id) {
      throw new BadRequestError('batch_id cannot be set when linking parameters to a sauda');
    }
  }

  private async validateSaudaReference(saudaId: string | null | undefined): Promise<void> {
    if (!saudaId) {
      return;
    }
    const sauda = await saudaDAO.findById(saudaId);
    if (!sauda) {
      throw new NotFoundError('Sauda not found');
    }
  }

  private async validateReferences(
    inwardSlipPassId: string | null | undefined,
    batchId: string | null | undefined,
    saudaId: string | null | undefined
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
    await this.validateSaudaReference(saudaId);
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
    if (normalized.sauda_id) {
      this.assertSaudaScopePayload(normalized);
    }
    await this.validateReferences(
      normalized.inward_slip_pass_id,
      normalized.batch_id,
      normalized.sauda_id
    );
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
    sauda_id?: string;
    batch_id?: string;
    product_id?: string;
    inward_slip_pass_id?: string;
  }): Promise<Parameter[]> {
    return parameterDAO.findAll(filters);
  }

  async upsertForSauda(
    saudaId: string,
    input: SaudaParametersInput,
    userId?: string | null,
    client?: PoolClient
  ): Promise<Parameter | null> {
    if (!client) {
      await this.validateSaudaReference(saudaId);
    }
    const row = await parameterDAO.upsertForSauda(saudaId, input, userId, client);
    if (row) {
      logger.info('Sauda parameter row upserted', { saudaId, parameterId: row.id });
    } else {
      logger.info('Sauda parameter row removed (all values empty)', { saudaId });
    }
    return row;
  }

  async getBySaudaId(saudaId: string): Promise<Parameter | null> {
    return parameterDAO.findBySaudaId(saudaId);
  }

  async getBySaudaIds(saudaIds: string[]): Promise<Parameter[]> {
    return parameterDAO.findBySaudaIds(saudaIds);
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
    const nextSauda =
      normalized.sauda_id !== undefined ? normalized.sauda_id : existing.sauda_id;

    if (nextSauda || existing.sauda_id) {
      this.assertSaudaScopePayload(normalized);
    }

    await this.validateReferences(nextIsp ?? undefined, nextBatch ?? undefined, nextSauda);

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
