import { salesmanDAO } from '../dao/salesman.dao';
import { NotFoundError, ConflictError } from '../utils/errors';
import { CreateSalesmanDTO, UpdateSalesmanDTO, Salesman } from '../models/salesman.model';
import { logger } from '../utils/logger';

export class SalesmanService {
  async getAllSalesmen(includeInactive: boolean): Promise<Salesman[]> {
    return await salesmanDAO.findAll(includeInactive);
  }

  async getSalesmanById(id: string): Promise<Salesman> {
    const salesman = await salesmanDAO.findById(id);
    if (!salesman) {
      throw new NotFoundError('Salesman not found');
    }
    return salesman;
  }

  async createSalesman(salesmanData: CreateSalesmanDTO): Promise<Salesman> {
    // Check if email already exists
    if (salesmanData.email) {
      const emailExists = await salesmanDAO.emailExists(salesmanData.email);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }
    }

    logger.info('Creating salesman', {
      name: salesmanData.name,
      email: salesmanData.email
    });

    return await salesmanDAO.create(salesmanData);
  }

  async updateSalesman(id: string, salesmanData: UpdateSalesmanDTO): Promise<Salesman> {
    // Check if salesman exists
    const existingSalesman = await salesmanDAO.findById(id);
    if (!existingSalesman) {
      throw new NotFoundError('Salesman not found');
    }

    // Check if email already exists (if being updated)
    if (salesmanData.email && salesmanData.email !== existingSalesman.email) {
      const emailExists = await salesmanDAO.emailExists(salesmanData.email, id);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }
    }

    logger.info('Updating salesman', { salesmanId: id });

    const salesman = await salesmanDAO.update(id, salesmanData);
    if (!salesman) {
      throw new NotFoundError('Salesman not found after update');
    }

    return salesman;
  }

  async deleteSalesman(id: string): Promise<void> {
    const salesman = await salesmanDAO.findById(id);
    if (!salesman) {
      throw new NotFoundError('Salesman not found');
    }

    logger.info('Deleting salesman', { salesmanId: id });
    await salesmanDAO.delete(id);
  }
}

export const salesmanService = new SalesmanService();

