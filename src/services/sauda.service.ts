import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { saudaDAO } from '../dao/sauda.dao';
import { parameterDAO } from '../dao/parameter.dao';
import { CreateSaudaDTO, Sauda, UpdateSaudaDTO } from '../models/sauda.model';
import { Parameter } from '../models/parameter.model';
import type { SaudaParametersInput } from '../constants/sauda-parameters';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface SaudaWithParametersResult {
  sauda: Sauda;
  /** undefined = parameters key omitted (unchanged); null = cleared or never set */
  parameterRow: Parameter | null | undefined;
}

export class SaudaService {
  async createWithParameters(
    saudaFields: CreateSaudaDTO,
    parameters: SaudaParametersInput | undefined,
    userId?: string | null
  ): Promise<SaudaWithParametersResult> {
    return db.transaction(async (client: PoolClient) => {
      const sauda = await saudaDAO.create(saudaFields, client);

      let parameterRow: Parameter | null | undefined;
      if (parameters !== undefined) {
        parameterRow = await parameterDAO.upsertForSauda(sauda.id, parameters, userId, client);
      }

      logger.info('Sauda created with parameters in transaction', {
        saudaId: sauda.id,
        hasParameters: parameterRow != null,
      });

      return { sauda, parameterRow };
    });
  }

  async updateWithParameters(
    id: string,
    saudaFields: UpdateSaudaDTO,
    parameters: SaudaParametersInput | undefined,
    userId?: string | null
  ): Promise<SaudaWithParametersResult> {
    return db.transaction(async (client: PoolClient) => {
      const sauda = await saudaDAO.update(id, saudaFields, client);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      let parameterRow: Parameter | null | undefined;
      if (parameters !== undefined) {
        parameterRow = await parameterDAO.upsertForSauda(id, parameters, userId, client);
      }

      logger.info('Sauda updated with parameters in transaction', {
        saudaId: id,
        parametersTouched: parameters !== undefined,
      });

      return { sauda, parameterRow };
    });
  }
}

export const saudaService = new SaudaService();
