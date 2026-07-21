import { salesmanDAO } from '../dao/salesman.dao';
import { salesmanSalaryHistoryDAO } from '../dao/salesman-salary-history.dao';
import { salesmanAssignedAreaDAO } from '../dao/salesman-assigned-area.dao';
import { salesmanCustomerAllocationDAO } from '../dao/salesman-customer-allocation.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import {
  CreateSalesmanDTO,
  UpdateSalesmanDTO,
  Salesman,
  SalesmanSalaryHistory,
  SalesmanSalaryType,
  SalesmanAssignedAreaResponse,
  SalesmanCustomerAllocationResponse,
} from '../models/salesman.model';
import { normalizeCommissionTypes } from './salesman-commission';
import { logger } from '../utils/logger';

function assertSalaryFieldsTogether(data: {
  salary_type?: SalesmanSalaryType | null;
  basic_salary?: number | null;
  salary_effective_from?: string | null;
}): {
  salary_type: SalesmanSalaryType;
  basic_salary: number;
  salary_effective_from: string;
} | null {
  const hasType = data.salary_type != null && data.salary_type !== undefined;
  const hasAmount = data.basic_salary != null && data.basic_salary !== undefined;
  const hasDate =
    data.salary_effective_from != null &&
    data.salary_effective_from !== undefined &&
    String(data.salary_effective_from).trim() !== '';

  if (!hasType && !hasAmount && !hasDate) {
    return null;
  }

  if (!hasType || !hasAmount || !hasDate) {
    throw new ValidationError(
      'salary_type, basic_salary, and salary_effective_from are required together'
    );
  }

  if (Number(data.basic_salary) < 0) {
    throw new ValidationError('basic_salary must be >= 0');
  }

  return {
    salary_type: data.salary_type as SalesmanSalaryType,
    basic_salary: Number(data.basic_salary),
    salary_effective_from: String(data.salary_effective_from).slice(0, 10),
  };
}

export interface SalesmanDetail extends Salesman {
  assigned_areas: SalesmanAssignedAreaResponse[];
  customer_allocations: SalesmanCustomerAllocationResponse[];
}

export class SalesmanService {
  async getAllSalesmen(includeInactive: boolean): Promise<Salesman[]> {
    return salesmanDAO.findAll(includeInactive);
  }

  async getSalesmanById(id: string): Promise<SalesmanDetail> {
    const salesman = await salesmanDAO.findById(id);
    if (!salesman) {
      throw new NotFoundError('Salesman not found');
    }
    return this.withRelations(salesman);
  }

  async createSalesman(
    salesmanData: CreateSalesmanDTO & { user_id?: string }
  ): Promise<SalesmanDetail> {
    if (salesmanData.email) {
      const emailExists = await salesmanDAO.emailExists(salesmanData.email);
      if (emailExists) throw new ConflictError('Email already exists');
    }
    if (salesmanData.aadhar_number) {
      const exists = await salesmanDAO.aadharExists(salesmanData.aadhar_number);
      if (exists) throw new ConflictError('Aadhaar number already exists');
    }
    if (salesmanData.pan_number) {
      const exists = await salesmanDAO.panExists(salesmanData.pan_number);
      if (exists) throw new ConflictError('PAN number already exists');
    }

    const salary = assertSalaryFieldsTogether(salesmanData);
    const commissionTypes = normalizeCommissionTypes(salesmanData.commission_types ?? []);
    await this.assertAllocatedPartiesExist(salesmanData.allocated_sales_party_ids);

    logger.info('Creating salesman', {
      name: salesmanData.name,
      email: salesmanData.email,
    });

    const {
      verify_bank: _vb,
      assigned_areas,
      allocated_sales_party_ids,
      ...createPayload
    } = salesmanData;
    const salesman = await salesmanDAO.create({
      ...createPayload,
      commission_types: commissionTypes,
      // Current salary applied after history so master stays consistent with latest row
      salary_type: undefined,
      basic_salary: undefined,
      salary_effective_from: undefined,
    });

    if (assigned_areas !== undefined) {
      await salesmanAssignedAreaDAO.replaceForSalesman(salesman.id, assigned_areas);
    }
    if (allocated_sales_party_ids !== undefined) {
      await salesmanCustomerAllocationDAO.replaceForSalesman(
        salesman.id,
        allocated_sales_party_ids
      );
    }

    if (salary) {
      await this.applySalaryChange(salesman.id, salary, salesmanData.created_by);
    }

    return this.getSalesmanById(salesman.id);
  }

  async updateSalesman(id: string, salesmanData: UpdateSalesmanDTO): Promise<SalesmanDetail> {
    const existing = await salesmanDAO.findById(id);
    if (!existing) {
      throw new NotFoundError('Salesman not found');
    }

    if (salesmanData.email && salesmanData.email !== existing.email) {
      const emailExists = await salesmanDAO.emailExists(salesmanData.email, id);
      if (emailExists) throw new ConflictError('Email already exists');
    }
    if (salesmanData.aadhar_number) {
      const exists = await salesmanDAO.aadharExists(salesmanData.aadhar_number, id);
      if (exists) throw new ConflictError('Aadhaar number already exists');
    }
    if (salesmanData.pan_number) {
      const exists = await salesmanDAO.panExists(salesmanData.pan_number, id);
      if (exists) throw new ConflictError('PAN number already exists');
    }

    const salary = assertSalaryFieldsTogether(salesmanData);
    await this.assertAllocatedPartiesExist(salesmanData.allocated_sales_party_ids);

    const {
      verify_bank: _vb,
      assigned_areas,
      allocated_sales_party_ids,
      ...updatePayload
    } = salesmanData;
    const {
      salary_type: _st,
      basic_salary: _bs,
      salary_effective_from: _sef,
      ...rest
    } = updatePayload;

    if (rest.commission_types !== undefined) {
      rest.commission_types = normalizeCommissionTypes(rest.commission_types);
    }

    logger.info('Updating salesman', { salesmanId: id });

    const salesman = await salesmanDAO.update(id, rest);
    if (!salesman) {
      throw new NotFoundError('Salesman not found after update');
    }

    if (assigned_areas !== undefined) {
      await salesmanAssignedAreaDAO.replaceForSalesman(id, assigned_areas);
    }
    if (allocated_sales_party_ids !== undefined) {
      await salesmanCustomerAllocationDAO.replaceForSalesman(id, allocated_sales_party_ids);
    }

    if (salary) {
      await this.applySalaryChange(id, salary, salesmanData.updated_by);
    }

    return this.getSalesmanById(id);
  }

  async deleteSalesman(id: string): Promise<void> {
    const salesman = await salesmanDAO.findById(id);
    if (!salesman) {
      throw new NotFoundError('Salesman not found');
    }
    logger.info('Deleting salesman', { salesmanId: id });
    await salesmanDAO.delete(id);
  }

  async getSalaryHistory(salesmanId: string): Promise<SalesmanSalaryHistory[]> {
    await this.getSalesmanById(salesmanId);
    return salesmanSalaryHistoryDAO.findBySalesmanId(salesmanId);
  }

  private async withRelations(salesman: Salesman): Promise<SalesmanDetail> {
    const [areas, allocations] = await Promise.all([
      salesmanAssignedAreaDAO.findBySalesmanId(salesman.id),
      salesmanCustomerAllocationDAO.findBySalesmanId(salesman.id),
    ]);
    return {
      ...salesman,
      assigned_areas: areas.map((a) => ({
        id: a.id,
        state: a.state,
        district: a.district,
        city: a.city,
        territory: a.territory,
      })),
      customer_allocations: allocations.map((a) => ({
        id: a.id,
        sales_party_id: a.sales_party_id,
        sales_party_name: a.sales_party_name ?? null,
      })),
    };
  }

  private async assertAllocatedPartiesExist(partyIds?: string[]): Promise<void> {
    if (partyIds === undefined) return;
    const unique = [...new Set(partyIds.filter(Boolean))];
    for (const partyId of unique) {
      const party = await salesPartyDAO.findById(partyId);
      if (!party) {
        throw new NotFoundError(`Sales party not found: ${partyId}`);
      }
    }
  }

  private async applySalaryChange(
    salesmanId: string,
    salary: {
      salary_type: SalesmanSalaryType;
      basic_salary: number;
      salary_effective_from: string;
    },
    createdBy?: string
  ): Promise<void> {
    const { isLatest } = await salesmanSalaryHistoryDAO.upsert(salesmanId, {
      salary_type: salary.salary_type,
      basic_salary: salary.basic_salary,
      effective_from: salary.salary_effective_from,
      created_by: createdBy,
    });

    if (isLatest) {
      await salesmanDAO.setCurrentSalary(salesmanId, {
        salary_type: salary.salary_type,
        basic_salary: salary.basic_salary,
        salary_effective_from: salary.salary_effective_from,
      });
    }
  }
}

export const salesmanService = new SalesmanService();
