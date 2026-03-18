import { salesSaudaDAO } from '../dao/sales-sauda.dao';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import { productDAO } from '../dao/product.dao';
import { packagingDAO } from '../dao/packaging.dao';
import {
  SalesSauda,
  SalesSaudaStatus,
  CreateSalesSaudaDTO,
  UpdateSalesSaudaDTO,
} from '../models/sales-sauda.model';
import { CreateSalesSaudaLineDTO } from '../models/sales-sauda-line.model';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';

export class SalesSaudaService {
  async list(salesPartyId?: string, status?: SalesSaudaStatus): Promise<SalesSauda[]> {
    return salesSaudaDAO.findAll(salesPartyId, status);
  }

  async getById(id: string): Promise<SalesSauda & { lines?: any[] }> {
    const sauda = await salesSaudaDAO.findById(id);
    if (!sauda) throw new NotFoundError('Sales sauda not found');
    const lines = await salesSaudaLineDAO.findBySalesSaudaId(id);
    return { ...sauda, lines };
  }

  async create(
    data: CreateSalesSaudaDTO & { lines?: CreateSalesSaudaLineDTO[] },
    userId?: string
  ): Promise<SalesSauda & { lines?: any[] }> {
    const salesParty = await salesPartyDAO.findById(data.sales_party_id);
    if (!salesParty) throw new NotFoundError('Sales party not found');
    const createDto: CreateSalesSaudaDTO = {
      sales_party_id: data.sales_party_id,
      status: data.status ?? 'draft',
      sauda_date: data.sauda_date,
      notes: data.notes,
      amount: data.amount,
      created_by: userId,
    };
    const sauda = await salesSaudaDAO.create(createDto);
    const lines = data.lines ?? [];
    for (let i = 0; i < lines.length; i++) {
      const product = await productDAO.findById(lines[i].product_id);
      if (!product) throw new ValidationError(`Product not found: ${lines[i].product_id}`);
      const packagingId = lines[i].packaging_id;
      if (packagingId) {
        const pkg = await packagingDAO.findById(packagingId);
        if (!pkg) throw new ValidationError(`Packaging not found: ${packagingId}`);
        if (pkg.product_id !== lines[i].product_id) {
          throw new ValidationError(`Packaging does not belong to product ${lines[i].product_id}`);
        }
      }
      await salesSaudaLineDAO.create(sauda.id, { ...lines[i], sort_order: lines[i].sort_order ?? i });
    }
    return this.getById(sauda.id);
  }

  async update(
    id: string,
    data: UpdateSalesSaudaDTO & { lines?: CreateSalesSaudaLineDTO[] },
    userId?: string
  ): Promise<SalesSauda & { lines?: any[] }> {
    const existing = await salesSaudaDAO.findById(id);
    if (!existing) throw new NotFoundError('Sales sauda not found');
    if (existing.status !== 'draft') throw new ConflictError('Only draft sales sauda can be updated');
    if (data.sales_party_id !== undefined) {
      const salesParty = await salesPartyDAO.findById(data.sales_party_id);
      if (!salesParty) throw new NotFoundError('Sales party not found');
    }
    await salesSaudaDAO.update(id, { ...data, updated_by: userId });
    if (data.lines !== undefined) {
      await salesSaudaLineDAO.deleteBySalesSaudaId(id);
      for (let i = 0; i < data.lines.length; i++) {
        const product = await productDAO.findById(data.lines[i].product_id);
        if (!product) throw new ValidationError(`Product not found: ${data.lines[i].product_id}`);
        const packagingId = data.lines[i].packaging_id;
        if (packagingId) {
          const pkg = await packagingDAO.findById(packagingId);
          if (!pkg) throw new ValidationError(`Packaging not found: ${packagingId}`);
          if (pkg.product_id !== data.lines[i].product_id) {
            throw new ValidationError(`Packaging does not belong to product ${data.lines[i].product_id}`);
          }
        }
        await salesSaudaLineDAO.create(id, { ...data.lines[i], sort_order: data.lines[i].sort_order ?? i });
      }
    }
    return this.getById(id);
  }

  async finalize(id: string, userId?: string): Promise<SalesSauda & { lines?: any[] }> {
    const existing = await salesSaudaDAO.findById(id);
    if (!existing) throw new NotFoundError('Sales sauda not found');
    if (existing.status !== 'draft') throw new ConflictError('Only draft sales sauda can be finalized');
    const lines = await salesSaudaLineDAO.findBySalesSaudaId(id);
    if (lines.length === 0) throw new ValidationError('Sales sauda must have at least one line to finalize');
    const orderNumber = await salesSaudaDAO.getNextOrderNumber();
    await salesSaudaDAO.update(id, { status: 'order', order_number: orderNumber, updated_by: userId });
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    const existing = await salesSaudaDAO.findById(id);
    if (!existing) throw new NotFoundError('Sales sauda not found');
    if (existing.status !== 'draft') throw new ConflictError('Only draft sales sauda can be deleted');
    const deleted = await salesSaudaDAO.delete(id);
    if (!deleted) throw new NotFoundError('Sales sauda not found');
  }
}

export const salesSaudaService = new SalesSaudaService();
