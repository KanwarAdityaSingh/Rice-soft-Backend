import { salesSaudaDAO } from '../dao/sales-sauda.dao';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import { salesmanDAO } from '../dao/salesman.dao';
import { productDAO } from '../dao/product.dao';
import { packagingDAO } from '../dao/packaging.dao';
import {
  SalesSauda,
  SalesSaudaStatus,
  CreateSalesSaudaDTO,
  UpdateSalesSaudaDTO,
} from '../models/sales-sauda.model';
import { CreateSalesSaudaLineDTO, SalesSaudaDiscountType } from '../models/sales-sauda-line.model';
import { financialYearFromDate } from '../constants/financial-year';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';

export class SalesSaudaService {
  private round2(value: number): number {
    return Number(value.toFixed(2));
  }

  private round3(value: number): number {
    return Number(value.toFixed(3));
  }

  private calculateLineFinancials(input: {
    quantity: number;
    rate: number;
    discountValue: number;
    discountType: SalesSaudaDiscountType;
    gstPercent: number;
    isTaxable: boolean;
  }): {
    amount: number;
    discount_amount: number;
    gst_amount: number;
    final_amount: number;
  } {
    const baseAmount = this.round2(input.quantity * input.rate);
    const discountAmountRaw =
      input.discountType === 'per_kg'
        ? input.discountValue * input.quantity
        : (baseAmount * input.discountValue) / 100;
    const discountAmount = this.round2(discountAmountRaw);
    const taxableAfterDiscount = Math.max(0, this.round2(baseAmount - discountAmount));
    const gstAmount = input.isTaxable ? this.round2((taxableAfterDiscount * input.gstPercent) / 100) : 0;
    const finalAmount = this.round2(taxableAfterDiscount + gstAmount);
    return {
      amount: baseAmount,
      discount_amount: discountAmount,
      gst_amount: gstAmount,
      final_amount: finalAmount,
    };
  }

  private async normalizeLineForPersistence(line: CreateSalesSaudaLineDTO): Promise<CreateSalesSaudaLineDTO> {
    const packagingId = line.packaging_id;
    const packetCount = line.packet_count;
    let packagingCapacity: number | null = null;

    let quantityFromInputOrDerived = line.quantity;

    if (packetCount !== undefined) {
      if (!packagingId) {
        throw new ValidationError('packaging_id is required when packet_count is provided');
      }
      const pkg = await packagingDAO.findById(packagingId);
      if (!pkg) throw new ValidationError(`Packaging not found: ${packagingId}`);
      if (pkg.product_id !== line.product_id) {
        throw new ValidationError(`Packaging does not belong to product ${line.product_id}`);
      }
      packagingCapacity = Number(pkg.holding_capacity);

      const derivedQuantity = this.round3(packetCount * pkg.holding_capacity);
      if (line.quantity !== undefined) {
        const delta = Math.abs(line.quantity - derivedQuantity);
        if (delta > 0.001) {
          throw new ValidationError(
            `Quantity mismatch for product ${line.product_id}. Expected ${derivedQuantity} from packet_count and packaging`
          );
        }
      }
      quantityFromInputOrDerived = derivedQuantity;
    }

    if (packagingId) {
      const pkg = await packagingDAO.findById(packagingId);
      if (!pkg) throw new ValidationError(`Packaging not found: ${packagingId}`);
      if (pkg.product_id !== line.product_id) {
        throw new ValidationError(`Packaging does not belong to product ${line.product_id}`);
      }
      packagingCapacity = Number(pkg.holding_capacity);
    }

    if (quantityFromInputOrDerived === undefined) {
      throw new ValidationError(`Quantity is required for product ${line.product_id}`);
    }

    const quantity = this.round3(quantityFromInputOrDerived);
    const discountValue = Number(line.discount_value ?? 0);
    const discountType: SalesSaudaDiscountType = line.discount_type ?? 'per_kg';
    const gstPercent = Number(line.gst_percent ?? 0);

    if (discountValue < 0) {
      throw new ValidationError(`discount_value cannot be negative for product ${line.product_id}`);
    }
    if (discountType === 'percentage' && discountValue > 100) {
      throw new ValidationError(`discount_value cannot exceed 100 for percentage type for product ${line.product_id}`);
    }
    if (gstPercent < 0) {
      throw new ValidationError(`gst_percent cannot be negative for product ${line.product_id}`);
    }

    const isTaxable = packagingCapacity !== null ? packagingCapacity <= 25 : false;
    const financials = this.calculateLineFinancials({
      quantity,
      rate: Number(line.rate),
      discountValue,
      discountType,
      gstPercent,
      isTaxable,
    });

    return {
      ...line,
      quantity,
      quantity_unit: line.quantity_unit ?? 'kg',
      discount_value: discountValue,
      discount_type: discountType,
      gst_percent: isTaxable ? gstPercent : 0,
      amount: financials.amount,
      discount_amount: financials.discount_amount,
      gst_amount: financials.gst_amount,
      final_amount: financials.final_amount,
    };
  }

  private async recalculateAndUpdateSaudaAmount(saudaId: string, userId?: string): Promise<void> {
    const lines = await salesSaudaLineDAO.findBySalesSaudaId(saudaId);
    const totalAmount = this.round2(
      lines.reduce((sum, line) => sum + Number(line.final_amount ?? 0), 0)
    );
    await salesSaudaDAO.update(saudaId, {
      amount: totalAmount,
      updated_by: userId,
    });
  }

  private resolveFinancialYear(date?: string | Date | null): string {
    const source =
      date != null && String(date).trim() !== '' ? date : new Date();
    return financialYearFromDate(source).label;
  }

  async list(
    salesPartyId?: string,
    status?: SalesSaudaStatus,
    financialYear?: string
  ): Promise<SalesSauda[]> {
    return salesSaudaDAO.findAll(salesPartyId, status, financialYear);
  }

  async getById(id: string): Promise<SalesSauda & { lines?: any[] }> {
    const sauda = await salesSaudaDAO.findById(id);
    if (!sauda) throw new NotFoundError('Sales sauda not found');
    const lines = await salesSaudaLineDAO.findBySalesSaudaId(id);
    return { ...sauda, lines };
  }

  private async assertSalesmanExists(salesmanId: string | null | undefined): Promise<void> {
    if (salesmanId == null) return;
    const salesman = await salesmanDAO.findById(salesmanId);
    if (!salesman) throw new NotFoundError('Salesman not found');
  }

  async create(
    data: CreateSalesSaudaDTO & { lines?: CreateSalesSaudaLineDTO[] },
    userId?: string
  ): Promise<SalesSauda & { lines?: any[] }> {
    const salesParty = await salesPartyDAO.findById(data.sales_party_id);
    if (!salesParty) throw new NotFoundError('Sales party not found');
    await this.assertSalesmanExists(data.salesman_id);
    const createDto: CreateSalesSaudaDTO = {
      sales_party_id: data.sales_party_id,
      salesman_id: data.salesman_id ?? null,
      sauda_type: data.sauda_type,
      status: data.status ?? 'draft',
      sauda_date: data.sauda_date,
      financial_year: this.resolveFinancialYear(data.sauda_date),
      billing_address: data.billing_address ?? null,
      delivery_address: data.delivery_address ?? null,
      notes: data.notes,
      payment_terms: data.payment_terms,
      amount: 0,
      created_by: userId,
    };
    const sauda = await salesSaudaDAO.create(createDto);
    const lines = data.lines ?? [];
    for (let i = 0; i < lines.length; i++) {
      const product = await productDAO.findById(lines[i].product_id);
      if (!product) throw new ValidationError(`Product not found: ${lines[i].product_id}`);
      const normalizedLine = await this.normalizeLineForPersistence(lines[i]);
      await salesSaudaLineDAO.create(sauda.id, { ...normalizedLine, sort_order: lines[i].sort_order ?? i });
    }
    await this.recalculateAndUpdateSaudaAmount(sauda.id, userId);
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
    if (data.salesman_id !== undefined) {
      await this.assertSalesmanExists(data.salesman_id);
    }
    const updatePayload: UpdateSalesSaudaDTO = {
      sales_party_id: data.sales_party_id,
      salesman_id: data.salesman_id,
      sauda_type: data.sauda_type,
      status: data.status,
      sauda_date: data.sauda_date,
      billing_address: data.billing_address,
      delivery_address: data.delivery_address,
      notes: data.notes,
      payment_terms: data.payment_terms,
      updated_by: userId,
    };
    if (data.sauda_date !== undefined) {
      updatePayload.financial_year = this.resolveFinancialYear(data.sauda_date);
    }
    await salesSaudaDAO.update(id, updatePayload);
    if (data.lines !== undefined) {
      await salesSaudaLineDAO.deleteBySalesSaudaId(id);
      for (let i = 0; i < data.lines.length; i++) {
        const product = await productDAO.findById(data.lines[i].product_id);
        if (!product) throw new ValidationError(`Product not found: ${data.lines[i].product_id}`);
        const normalizedLine = await this.normalizeLineForPersistence(data.lines[i]);
        await salesSaudaLineDAO.create(id, { ...normalizedLine, sort_order: data.lines[i].sort_order ?? i });
      }
    }
    await this.recalculateAndUpdateSaudaAmount(id, userId);
    return this.getById(id);
  }

  async finalize(id: string, userId?: string): Promise<SalesSauda & { lines?: any[] }> {
    const existing = await salesSaudaDAO.findById(id);
    if (!existing) throw new NotFoundError('Sales sauda not found');
    if (existing.status !== 'draft') throw new ConflictError('Only draft sales sauda can be finalized');
    const lines = await salesSaudaLineDAO.findBySalesSaudaId(id);
    if (lines.length === 0) throw new ValidationError('Sales sauda must have at least one line to finalize');
    const financialYear =
      existing.financial_year || this.resolveFinancialYear(existing.sauda_date);
    const orderNumber = await salesSaudaDAO.getNextOrderNumber(financialYear);
    await salesSaudaDAO.update(id, {
      status: 'order',
      order_number: orderNumber,
      financial_year: financialYear,
      updated_by: userId,
    });
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
