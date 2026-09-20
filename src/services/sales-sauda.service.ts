import { db } from '../database/connection';
import { salesSaudaDAO } from '../dao/sales-sauda.dao';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import { salesmanDAO } from '../dao/salesman.dao';
import { brokerDAO } from '../dao/broker.dao';
import { productDAO } from '../dao/product.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { lotInventoryDAO } from '../dao/lot-inventory.dao';
import {
  SalesSauda,
  SalesSaudaStatus,
  SalesMovementType,
  CreateSalesSaudaDTO,
  UpdateSalesSaudaDTO,
} from '../models/sales-sauda.model';
import {
  CreateSalesSaudaLineDTO,
  SalesSaudaDiscountType,
  SalesSaudaLine,
} from '../models/sales-sauda-line.model';
import type { Address } from '../models/vendor.model';
import type { BrokerCommissionType } from '../models/sauda.model';
import type {
  SalesmanCommissionConfig,
  SalesmanCommissionType,
} from '../constants/salesman-commission-types';
import { financialYearFromDate } from '../constants/financial-year';
import {
  getFulfillmentForSauda,
  getFulfillmentForSaudas,
  hasRemainingQuantity,
  isFullyDispatched,
  type SalesSaudaLineWithFulfillment,
} from './sales-sauda-fulfillment';
import { ensureSalesPartyForGodown } from './godown-sales-party.service';
import { godownService } from './godown.service';
import {
  assertRiceQualityRatesCoverLines,
  computeSalesmanCommission,
  isSalesmanCommissionType,
  parseSalesmanCommissionConfig,
} from './salesman-commission';
import {
  computeSalesBrokerCommission,
  isBrokerCommissionType,
} from './sales-broker-commission';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { calculateSalesLineFinancials } from '../utils/sales-line-financials';

export type SalesSaudaListItem = SalesSauda & {
  lines?: SalesSaudaLineWithFulfillment[];
  has_remaining_quantity?: boolean;
  is_fully_dispatched?: boolean;
};

export class SalesSaudaService {
  private round2(value: number): number {
    return Number(value.toFixed(2));
  }

  private round3(value: number): number {
    return Number(value.toFixed(3));
  }

  /** v1: all lines must be product OR all lot — no mix. Lot saudas cannot be godown_transfer. */
  private assertHomogeneousLines(
    lines: CreateSalesSaudaLineDTO[],
    movementType: SalesMovementType
  ): 'product' | 'lot' | null {
    if (lines.length === 0) return null;
    const types = new Set(lines.map((l) => l.line_type ?? 'product'));
    if (types.size > 1) {
      throw new ValidationError(
        'Sales sauda cannot mix product lines and lot lines; use separate saudas'
      );
    }
    const lineType = types.has('lot') ? 'lot' : 'product';
    if (lineType === 'lot' && movementType === 'godown_transfer') {
      throw new ValidationError('Lot sales are not allowed on godown_transfer saudas');
    }
    return lineType;
  }

  private async validateAndNormalizeLines(
    lines: CreateSalesSaudaLineDTO[],
    movementType: SalesMovementType
  ): Promise<CreateSalesSaudaLineDTO[]> {
    this.assertHomogeneousLines(lines, movementType);
    const normalized: CreateSalesSaudaLineDTO[] = [];
    for (const line of lines) {
      normalized.push(await this.normalizeLineForPersistence(line));
    }
    return normalized;
  }

  /** Hard-check lot inventory covers ordered qty (finalize / optional create). */
  private async assertLotInventoryCoversLines(
    lines: Array<Pick<SalesSaudaLine, 'line_type' | 'lot_id' | 'quantity'>>
  ): Promise<void> {
    const byLot = new Map<string, number>();
    for (const line of lines) {
      if ((line.line_type ?? 'product') !== 'lot' || !line.lot_id) continue;
      const qty = Number(line.quantity) || 0;
      byLot.set(line.lot_id, (byLot.get(line.lot_id) ?? 0) + qty);
    }
    for (const [lotId, needed] of byLot) {
      const available = await lotInventoryDAO.getAvailableQuantity(lotId);
      if (needed > available + 1e-6) {
        const lot = await inwardSlipLotDAO.findById(lotId);
        throw new ValidationError(
          `Insufficient lot inventory for lot ${lot?.lot_number ?? lotId}: need ${needed} kg, available ${available} kg`
        );
      }
    }
  }

  private async normalizeLineForPersistence(
    line: CreateSalesSaudaLineDTO
  ): Promise<CreateSalesSaudaLineDTO> {
    const lineType = line.line_type ?? 'product';

    if (lineType === 'lot') {
      if (!line.lot_id) throw new ValidationError('lot_id is required for lot lines');
      if (line.product_id) {
        throw new ValidationError('product_id is not allowed on lot lines');
      }
      if (line.product_alias != null && String(line.product_alias).trim() !== '') {
        throw new ValidationError('product_alias is not allowed on lot lines');
      }
      if (line.packaging_id || line.packet_count != null) {
        throw new ValidationError('packaging_id and packet_count are not allowed on lot lines');
      }
      const lot = await inwardSlipLotDAO.findById(line.lot_id);
      if (!lot) throw new ValidationError(`Lot not found: ${line.lot_id}`);
      const inv = await lotInventoryDAO.findByLotId(line.lot_id);
      if (!inv) {
        throw new ValidationError(`Lot inventory not found for lot ${lot.lot_number}`);
      }

      const noOfBags =
        line.no_of_bags != null && Number(line.no_of_bags) >= 1
          ? Math.trunc(Number(line.no_of_bags))
          : null;
      // Prefer explicit bag_weight; else lot master bag_weight when bags are set
      let bagWeight: number | null = null;
      if (line.bag_weight != null && Number(line.bag_weight) > 0) {
        bagWeight = this.round2(Number(line.bag_weight));
      } else if (noOfBags != null && lot.bag_weight != null && Number(lot.bag_weight) > 0) {
        bagWeight = this.round2(Number(lot.bag_weight));
      }

      // quantity is source of truth for money/inventory. If omitted, soft-derive from bags×weight.
      // Never hard-check that quantity === no_of_bags × bag_weight (ops can diverge).
      let quantity: number;
      if (line.quantity !== undefined && line.quantity !== null) {
        quantity = this.round3(Number(line.quantity));
      } else if (noOfBags != null && bagWeight != null) {
        quantity = this.round3(noOfBags * bagWeight);
      } else {
        throw new ValidationError(
          `quantity or (no_of_bags with bag_weight) is required for lot ${lot.lot_number}`
        );
      }

      const discountValue = Number(line.discount_value ?? 0);
      const discountType: SalesSaudaDiscountType = line.discount_type ?? 'per_kg';
      const gstPercent = Number(line.gst_percent ?? 0);
      if (discountValue < 0) {
        throw new ValidationError(`discount_value cannot be negative for lot ${lot.lot_number}`);
      }
      if (discountType === 'percentage' && discountValue > 100) {
        throw new ValidationError(
          `discount_value cannot exceed 100 for percentage type for lot ${lot.lot_number}`
        );
      }
      if (gstPercent < 0) {
        throw new ValidationError(`gst_percent cannot be negative for lot ${lot.lot_number}`);
      }

      // Lot sales: GST applies when gst_percent > 0 (no packaging tax rule)
      const isTaxable = gstPercent > 0;
      const financials = calculateSalesLineFinancials({
        quantity,
        rate: Number(line.rate),
        discountValue,
        discountType,
        gstPercent,
        isTaxable,
      });

      return {
        ...line,
        line_type: 'lot',
        product_id: undefined,
        product_alias: null,
        lot_id: line.lot_id,
        packaging_id: undefined,
        packet_count: undefined,
        no_of_bags: noOfBags ?? undefined,
        bag_weight: bagWeight ?? undefined,
        quantity,
        quantity_unit: line.quantity_unit ?? 'kg',
        discount_value: discountValue,
        discount_type: discountType,
        gst_percent: isTaxable ? gstPercent : 0,
        amount: financials.gross,
        discount_amount: financials.discount_amount,
        gst_amount: financials.gst_amount,
        final_amount: financials.final_amount,
      };
    }

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
      throw new ValidationError(
        `discount_value cannot exceed 100 for percentage type for product ${line.product_id}`
      );
    }
    if (gstPercent < 0) {
      throw new ValidationError(`gst_percent cannot be negative for product ${line.product_id}`);
    }

    const isTaxable = packagingCapacity !== null ? packagingCapacity <= 25 : false;
    const financials = calculateSalesLineFinancials({
      quantity,
      rate: Number(line.rate),
      discountValue,
      discountType,
      gstPercent,
      isTaxable,
    });

    const productAlias =
      line.product_alias != null && String(line.product_alias).trim() !== ''
        ? String(line.product_alias).trim()
        : null;

    return {
      ...line,
      line_type: 'product',
      product_alias: productAlias,
      lot_id: undefined,
      quantity,
      quantity_unit: line.quantity_unit ?? 'kg',
      discount_value: discountValue,
      discount_type: discountType,
      gst_percent: isTaxable ? gstPercent : 0,
      amount: financials.gross,
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

  /**
   * List saudas. When includeFulfillment is true, attach per-line remaining
   * (same math as getById) plus has_remaining_quantity / is_fully_dispatched.
   * Prefer GET ?include_fulfillment=true or ?for_dispatch=1 for dispatch modal.
   */
  async list(
    salesPartyId?: string,
    status?: SalesSaudaStatus,
    financialYear?: string,
    movementType?: SalesMovementType | 'all',
    includeFulfillment = false,
    pagination?: { limit: number; offset: number },
    search?: string
  ): Promise<{ items: SalesSaudaListItem[]; total: number }> {
    const { rows, total } = await salesSaudaDAO.findAll(
      salesPartyId,
      status,
      financialYear,
      movementType,
      pagination,
      search
    );
    if (!includeFulfillment) {
      return {
        items: rows.map((s) => ({ ...s, lines: [] as SalesSaudaLineWithFulfillment[] })),
        total,
      };
    }

    const fulfillmentBySauda = await getFulfillmentForSaudas(rows.map((s) => s.id));
    return {
      items: rows.map((s) => {
        const lines = fulfillmentBySauda.get(s.id) ?? [];
        return {
          ...s,
          lines,
          has_remaining_quantity: hasRemainingQuantity(lines),
          is_fully_dispatched: isFullyDispatched(lines),
        };
      }),
      total,
    };
  }

  async getById(id: string): Promise<
    SalesSauda & {
      lines?: any[];
      salesman_commission_preview?: number | null;
      broker_commission_preview?: number | null;
    }
  > {
    const sauda = await salesSaudaDAO.findById(id);
    if (!sauda) throw new NotFoundError('Sales sauda not found');
    const lines = await getFulfillmentForSauda(id);
    const preview = await this.buildCommissionPreview(sauda, lines);
    const brokerPreview = this.buildBrokerCommissionPreview(sauda, lines);
    return {
      ...sauda,
      lines,
      salesman_commission_preview: preview,
      broker_commission_preview: brokerPreview,
    };
  }

  private async assertSalesmanExists(salesmanId: string | null | undefined) {
    if (salesmanId == null) return null;
    const salesman = await salesmanDAO.findById(salesmanId);
    if (!salesman) throw new NotFoundError('Salesman not found');
    return salesman;
  }

  private async assertBrokerExists(brokerId: string | null | undefined) {
    if (brokerId == null) return null;
    const broker = await brokerDAO.findById(brokerId);
    if (!broker) throw new NotFoundError('Broker not found');
    return broker;
  }

  /**
   * Resolve broker commission snapshot for create/update.
   * Godown transfer: always null.
   */
  private resolveBrokerCommissionSnapshot(input: {
    movementType: SalesMovementType;
    brokerId: string | null;
    commission?: number | null;
    type?: BrokerCommissionType | null;
    commissionProvided: boolean;
    typeProvided: boolean;
    existing?: SalesSauda;
  }): {
    broker_id: string | null;
    broker_commission: number | null;
    broker_commission_type: BrokerCommissionType | null;
  } {
    if (input.movementType === 'godown_transfer') {
      if (
        input.brokerId != null ||
        (input.commissionProvided && input.commission != null) ||
        (input.typeProvided && input.type != null)
      ) {
        throw new ValidationError('Broker commission is not allowed for godown_transfer');
      }
      return { broker_id: null, broker_commission: null, broker_commission_type: null };
    }

    const nextBrokerId = input.brokerId;
    const nextCommission = input.commissionProvided
      ? input.commission ?? null
      : input.existing?.broker_commission ?? null;
    const nextType = input.typeProvided
      ? input.type ?? null
      : input.existing?.broker_commission_type ?? null;

    // Clearing broker clears commission
    if (nextBrokerId == null) {
      if (nextCommission != null || nextType != null) {
        throw new ValidationError('broker_id is required when broker commission is set');
      }
      return { broker_id: null, broker_commission: null, broker_commission_type: null };
    }

    if (nextCommission == null && nextType == null) {
      return { broker_id: nextBrokerId, broker_commission: null, broker_commission_type: null };
    }
    if (nextCommission == null || nextType == null) {
      throw new ValidationError(
        'broker_commission and broker_commission_type are required together'
      );
    }
    if (!isBrokerCommissionType(nextType)) {
      throw new ValidationError(`Invalid broker_commission_type: ${nextType}`);
    }
    if (!(Number(nextCommission) >= 0)) {
      throw new ValidationError('broker_commission must be >= 0');
    }
    if (nextType === 'percentage' && Number(nextCommission) > 100) {
      throw new ValidationError('broker_commission percentage cannot exceed 100');
    }

    return {
      broker_id: nextBrokerId,
      broker_commission: Number(nextCommission),
      broker_commission_type: nextType,
    };
  }

  private buildBrokerCommissionPreview(
    sauda: SalesSauda,
    lines: Array<{ quantity: number | string }>
  ): number | null {
    if (
      sauda.movement_type === 'godown_transfer' ||
      !sauda.broker_id ||
      sauda.broker_commission == null ||
      !sauda.broker_commission_type
    ) {
      return null;
    }
    try {
      const quantityKg = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
      const saleAmount = Number(sauda.amount) || 0;
      return computeSalesBrokerCommission({
        type: sauda.broker_commission_type,
        rate: Number(sauda.broker_commission),
        quantity_kg: quantityKg,
        sale_amount: saleAmount,
      });
    } catch {
      return null;
    }
  }

  /**
   * Resolve / validate commission snapshot for create/update.
   * Godown transfer: always null (no commission).
   */
  private async resolveCommissionSnapshot(input: {
    movementType: SalesMovementType;
    salesmanId: string | null;
    type?: SalesmanCommissionType | null;
    config?: SalesmanCommissionConfig | null;
    typeProvided: boolean;
    configProvided: boolean;
    existing?: SalesSauda;
    lineProductIds?: string[];
  }): Promise<{
    salesman_commission_type: SalesmanCommissionType | null;
    salesman_commission_config: SalesmanCommissionConfig | null;
  }> {
    if (input.movementType === 'godown_transfer') {
      if (
        (input.typeProvided && input.type != null) ||
        (input.configProvided && input.config != null)
      ) {
        throw new ValidationError('Commission is not allowed for godown_transfer');
      }
      return { salesman_commission_type: null, salesman_commission_config: null };
    }

    if (input.salesmanId == null) {
      if (
        (input.typeProvided && input.type != null) ||
        (input.configProvided && input.config != null)
      ) {
        throw new ValidationError('salesman_id is required when setting commission');
      }
      return { salesman_commission_type: null, salesman_commission_config: null };
    }

    const salesman = await this.assertSalesmanExists(input.salesmanId);
    if (!salesman) {
      return { salesman_commission_type: null, salesman_commission_config: null };
    }

    const nextType = input.typeProvided
      ? input.type ?? null
      : input.existing?.salesman_commission_type ?? null;
    const nextConfigRaw = input.configProvided
      ? input.config ?? null
      : input.existing?.salesman_commission_config ?? null;

    if (nextType == null && nextConfigRaw == null) {
      return { salesman_commission_type: null, salesman_commission_config: null };
    }
    if (nextType == null || nextConfigRaw == null) {
      throw new ValidationError(
        'salesman_commission_type and salesman_commission_config are required together'
      );
    }
    if (!isSalesmanCommissionType(nextType)) {
      throw new ValidationError(`Invalid salesman_commission_type: ${nextType}`);
    }

    const enabled = Array.isArray(salesman.commission_types) ? salesman.commission_types : [];
    if (!enabled.includes(nextType)) {
      throw new ValidationError(
        `Commission type '${nextType}' is not enabled for this salesman. Enabled: ${
          enabled.length ? enabled.join(', ') : '(none)'
        }`
      );
    }

    const config = parseSalesmanCommissionConfig(nextType, nextConfigRaw);

    if (nextType === 'by_rice_quality' && input.lineProductIds && input.lineProductIds.length > 0) {
      const riceTypes: Array<string | null> = [];
      for (const productId of input.lineProductIds) {
        const product = await productDAO.findById(productId);
        riceTypes.push(product?.rice_type ?? null);
      }
      assertRiceQualityRatesCoverLines(config, riceTypes);
    }

    return { salesman_commission_type: nextType, salesman_commission_config: config };
  }

  private async buildCommissionPreview(
    sauda: SalesSauda,
    lines: Array<{
      product_id?: string | null;
      lot_id?: string | null;
      line_type?: string;
      quantity: number | string;
      final_amount?: number | string;
      amount?: number | string;
    }>
  ): Promise<number | null> {
    if (
      sauda.movement_type === 'godown_transfer' ||
      !sauda.salesman_commission_type ||
      !sauda.salesman_commission_config
    ) {
      return null;
    }

    const quantityKg = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const saleAmount = Number(sauda.amount) || 0;
    const basisLines = [];
    for (const line of lines) {
      let riceType: string | null = null;
      if (line.line_type === 'lot' && line.lot_id) {
        const lot = await inwardSlipLotDAO.findById(line.lot_id);
        riceType = lot?.rice_type ?? null;
      } else if (line.product_id) {
        const product = await productDAO.findById(line.product_id);
        riceType = product?.rice_type ?? null;
      }
      basisLines.push({
        rice_type: riceType,
        quantity_kg: Number(line.quantity) || 0,
        sale_amount: Number(line.final_amount ?? line.amount ?? 0),
      });
    }

    try {
      return computeSalesmanCommission({
        type: sauda.salesman_commission_type,
        config: sauda.salesman_commission_config,
        quantity_kg: quantityKg,
        sale_amount: saleAmount,
        lines: basisLines,
      });
    } catch {
      return null;
    }
  }

  /**
   * Resolve movement fields and sales_party_id for create/update.
   * Godown transfer: auto-link sales party from to_godown; prefill addresses from to-godown.
   */
  private async resolveMovementContext(
    input: {
      movement_type?: SalesMovementType;
      from_godown_id?: string | null;
      to_godown_id?: string | null;
      sales_party_id?: string;
      billing_address?: Address | null;
      delivery_address?: Address | null;
    },
    existing?: SalesSauda,
    userId?: string
  ): Promise<{
    movement_type: SalesMovementType;
    from_godown_id: string | null;
    to_godown_id: string | null;
    sales_party_id: string;
    billing_address: Address | null;
    delivery_address: Address | null;
  }> {
    const movementType: SalesMovementType =
      input.movement_type ?? existing?.movement_type ?? 'sale';

    if (movementType === 'sale') {
      const salesPartyId = input.sales_party_id ?? existing?.sales_party_id;
      if (!salesPartyId) throw new ValidationError('sales_party_id is required for sale');
      const salesParty = await salesPartyDAO.findById(salesPartyId);
      if (!salesParty) throw new NotFoundError('Sales party not found');
      return {
        movement_type: 'sale',
        from_godown_id: null,
        to_godown_id: null,
        sales_party_id: salesPartyId,
        billing_address:
          input.billing_address !== undefined
            ? input.billing_address ?? null
            : existing?.billing_address ?? null,
        delivery_address:
          input.delivery_address !== undefined
            ? input.delivery_address ?? null
            : existing?.delivery_address ?? null,
      };
    }

    const fromGodownId =
      input.from_godown_id !== undefined ? input.from_godown_id : existing?.from_godown_id ?? null;
    const toGodownId =
      input.to_godown_id !== undefined ? input.to_godown_id : existing?.to_godown_id ?? null;

    if (!fromGodownId || !toGodownId) {
      throw new ValidationError('from_godown_id and to_godown_id are required for godown_transfer');
    }
    if (fromGodownId === toGodownId) {
      throw new ValidationError('from_godown_id and to_godown_id must be different');
    }

    const fromGodown = await godownService.assertActive(fromGodownId);
    const toGodown = await godownService.assertActive(toGodownId);

    const salesPartyId =
      input.sales_party_id ??
      (await ensureSalesPartyForGodown(toGodownId, userId));

    const salesParty = await salesPartyDAO.findById(salesPartyId);
    if (!salesParty) throw new NotFoundError('Sales party not found');

    void fromGodown;

    return {
      movement_type: 'godown_transfer',
      from_godown_id: fromGodownId,
      to_godown_id: toGodownId,
      sales_party_id: salesPartyId,
      billing_address:
        input.billing_address !== undefined
          ? input.billing_address ?? null
          : existing?.billing_address ?? toGodown.address,
      delivery_address:
        input.delivery_address !== undefined
          ? input.delivery_address ?? null
          : existing?.delivery_address ?? toGodown.address,
    };
  }

  async create(
    data: CreateSalesSaudaDTO & { lines?: CreateSalesSaudaLineDTO[] },
    userId?: string
  ): Promise<
    SalesSauda & {
      lines?: any[];
      salesman_commission_preview?: number | null;
      broker_commission_preview?: number | null;
    }
  > {
    const ctx = await this.resolveMovementContext(data, undefined, userId);
    await this.assertSalesmanExists(data.salesman_id);
    await this.assertBrokerExists(data.broker_id);

    const lines = data.lines ?? [];
    const lineProductIds = lines
      .filter((l) => (l.line_type ?? 'product') === 'product' && l.product_id)
      .map((l) => l.product_id!) as string[];
    const commission = await this.resolveCommissionSnapshot({
      movementType: ctx.movement_type,
      salesmanId: data.salesman_id ?? null,
      type: data.salesman_commission_type,
      config: data.salesman_commission_config,
      typeProvided: data.salesman_commission_type !== undefined,
      configProvided: data.salesman_commission_config !== undefined,
      lineProductIds,
    });
    const brokerCommission = this.resolveBrokerCommissionSnapshot({
      movementType: ctx.movement_type,
      brokerId: data.broker_id ?? null,
      commission: data.broker_commission,
      type: data.broker_commission_type,
      commissionProvided: data.broker_commission !== undefined,
      typeProvided: data.broker_commission_type !== undefined,
    });

    const createDto: CreateSalesSaudaDTO = {
      sales_party_id: ctx.sales_party_id,
      salesman_id: data.salesman_id ?? null,
      salesman_commission_type: commission.salesman_commission_type,
      salesman_commission_config: commission.salesman_commission_config,
      broker_id: brokerCommission.broker_id,
      broker_commission: brokerCommission.broker_commission,
      broker_commission_type: brokerCommission.broker_commission_type,
      sauda_type: data.sauda_type,
      movement_type: ctx.movement_type,
      from_godown_id: ctx.from_godown_id,
      to_godown_id: ctx.to_godown_id,
      status: data.status ?? 'draft',
      sauda_date: data.sauda_date,
      financial_year: this.resolveFinancialYear(data.sauda_date),
      billing_address: ctx.billing_address,
      delivery_address: ctx.delivery_address,
      notes: data.notes,
      payment_terms: data.payment_terms,
      customer_po_url: data.customer_po_url,
      email_attachment_url: data.email_attachment_url,
      agreement_url: data.agreement_url,
      whatsapp_screenshot_url: data.whatsapp_screenshot_url,
      amount: 0,
      created_by: userId,
    };
    const sauda = await salesSaudaDAO.create(createDto);
    const normalizedLines = await this.validateAndNormalizeLines(lines, ctx.movement_type);
    for (let i = 0; i < normalizedLines.length; i++) {
      const line = normalizedLines[i];
      if ((line.line_type ?? 'product') === 'product') {
        if (!line.product_id) throw new ValidationError('product_id is required for product lines');
        const product = await productDAO.findById(line.product_id);
        if (!product) throw new ValidationError(`Product not found: ${line.product_id}`);
      }
      await salesSaudaLineDAO.create(sauda.id, {
        ...line,
        sort_order: lines[i].sort_order ?? i,
      });
    }
    await this.recalculateAndUpdateSaudaAmount(sauda.id, userId);
    return this.getById(sauda.id);
  }

  async update(
    id: string,
    data: UpdateSalesSaudaDTO & { lines?: CreateSalesSaudaLineDTO[] },
    userId?: string
  ): Promise<
    SalesSauda & {
      lines?: any[];
      salesman_commission_preview?: number | null;
      broker_commission_preview?: number | null;
    }
  > {
    const existing = await salesSaudaDAO.findById(id);
    if (!existing) throw new NotFoundError('Sales sauda not found');
    if (existing.status !== 'draft') throw new ConflictError('Only draft sales sauda can be updated');

    const touchesMovement =
      data.movement_type !== undefined ||
      data.from_godown_id !== undefined ||
      data.to_godown_id !== undefined ||
      data.sales_party_id !== undefined ||
      data.billing_address !== undefined ||
      data.delivery_address !== undefined;

    let ctx: Awaited<ReturnType<SalesSaudaService['resolveMovementContext']>> | null = null;
    if (touchesMovement) {
      ctx = await this.resolveMovementContext(data, existing, userId);
    }

    const movementType = ctx?.movement_type ?? existing.movement_type;
    const nextSalesmanId =
      data.salesman_id !== undefined ? data.salesman_id ?? null : existing.salesman_id;
    const nextBrokerId =
      data.broker_id !== undefined ? data.broker_id ?? null : existing.broker_id;

    if (data.salesman_id !== undefined) {
      await this.assertSalesmanExists(data.salesman_id);
    }
    if (data.broker_id !== undefined) {
      await this.assertBrokerExists(data.broker_id);
    }

    let lineProductIds: string[] | undefined;
    if (data.lines !== undefined) {
      lineProductIds = data.lines
        .filter((l) => (l.line_type ?? 'product') === 'product' && l.product_id)
        .map((l) => l.product_id!) as string[];
    } else if (
      data.salesman_commission_type !== undefined ||
      data.salesman_commission_config !== undefined ||
      data.salesman_id !== undefined
    ) {
      const existingLines = await salesSaudaLineDAO.findBySalesSaudaId(id);
      lineProductIds = existingLines
        .filter((l) => l.line_type === 'product' && l.product_id)
        .map((l) => l.product_id!) as string[];
    }

    const clearCommission = nextSalesmanId == null || movementType === 'godown_transfer';
    const commission = clearCommission
      ? { salesman_commission_type: null as SalesmanCommissionType | null, salesman_commission_config: null as SalesmanCommissionConfig | null }
      : await this.resolveCommissionSnapshot({
          movementType,
          salesmanId: nextSalesmanId,
          type: data.salesman_commission_type,
          config: data.salesman_commission_config,
          typeProvided: data.salesman_commission_type !== undefined,
          configProvided: data.salesman_commission_config !== undefined,
          existing,
          lineProductIds,
        });

    if (clearCommission && (
      (data.salesman_commission_type != null) ||
      (data.salesman_commission_config != null)
    )) {
      if (movementType === 'godown_transfer') {
        throw new ValidationError('Commission is not allowed for godown_transfer');
      }
    }

    const clearBroker =
      nextBrokerId == null ||
      movementType === 'godown_transfer' ||
      data.broker_id === null;
    const brokerCommission = clearBroker
      ? {
          broker_id: null as string | null,
          broker_commission: null as number | null,
          broker_commission_type: null as BrokerCommissionType | null,
        }
      : this.resolveBrokerCommissionSnapshot({
          movementType,
          brokerId: nextBrokerId,
          commission: data.broker_commission,
          type: data.broker_commission_type,
          commissionProvided: data.broker_commission !== undefined,
          typeProvided: data.broker_commission_type !== undefined,
          existing,
        });

    const updatePayload: UpdateSalesSaudaDTO = {
      salesman_id: data.salesman_id,
      salesman_commission_type: commission.salesman_commission_type,
      salesman_commission_config: commission.salesman_commission_config,
      broker_id: brokerCommission.broker_id,
      broker_commission: brokerCommission.broker_commission,
      broker_commission_type: brokerCommission.broker_commission_type,
      sauda_type: data.sauda_type,
      status: data.status,
      sauda_date: data.sauda_date,
      notes: data.notes,
      payment_terms: data.payment_terms,
      customer_po_url: data.customer_po_url,
      email_attachment_url: data.email_attachment_url,
      agreement_url: data.agreement_url,
      whatsapp_screenshot_url: data.whatsapp_screenshot_url,
      updated_by: userId,
    };
    if (ctx) {
      updatePayload.movement_type = ctx.movement_type;
      updatePayload.from_godown_id = ctx.from_godown_id;
      updatePayload.to_godown_id = ctx.to_godown_id;
      updatePayload.sales_party_id = ctx.sales_party_id;
      updatePayload.billing_address = ctx.billing_address;
      updatePayload.delivery_address = ctx.delivery_address;
    }
    if (data.sauda_date !== undefined) {
      updatePayload.financial_year = this.resolveFinancialYear(data.sauda_date);
    }
    await salesSaudaDAO.update(id, updatePayload);
    if (data.lines !== undefined) {
      const normalizedLines = await this.validateAndNormalizeLines(data.lines, movementType);
      await salesSaudaLineDAO.deleteBySalesSaudaId(id);
      for (let i = 0; i < normalizedLines.length; i++) {
        const line = normalizedLines[i];
        if ((line.line_type ?? 'product') === 'product') {
          if (!line.product_id) throw new ValidationError('product_id is required for product lines');
          const product = await productDAO.findById(line.product_id);
          if (!product) throw new ValidationError(`Product not found: ${line.product_id}`);
        }
        await salesSaudaLineDAO.create(id, {
          ...line,
          sort_order: data.lines[i].sort_order ?? i,
        });
      }
      if (commission.salesman_commission_type === 'by_rice_quality' && commission.salesman_commission_config) {
        await this.resolveCommissionSnapshot({
          movementType,
          salesmanId: nextSalesmanId,
          type: commission.salesman_commission_type,
          config: commission.salesman_commission_config,
          typeProvided: true,
          configProvided: true,
          lineProductIds: normalizedLines
            .filter((l) => (l.line_type ?? 'product') === 'product' && l.product_id)
            .map((l) => l.product_id!) as string[],
        });
      }
    }
    await this.recalculateAndUpdateSaudaAmount(id, userId);
    return this.getById(id);
  }

  async finalize(id: string, userId?: string): Promise<SalesSauda & { lines?: any[]; salesman_commission_preview?: number | null }> {
    const existing = await salesSaudaDAO.findById(id);
    if (!existing) throw new NotFoundError('Sales sauda not found');
    if (existing.status !== 'draft') throw new ConflictError('Only draft sales sauda can be finalized');
    const lines = await salesSaudaLineDAO.findBySalesSaudaId(id);
    if (lines.length === 0) throw new ValidationError('Sales sauda must have at least one line to finalize');

    this.assertHomogeneousLines(
      lines.map((l) => ({
        line_type: l.line_type,
        product_id: l.product_id ?? undefined,
        lot_id: l.lot_id ?? undefined,
        rate: Number(l.rate),
        quantity: Number(l.quantity),
      })),
      existing.movement_type
    );
    await this.assertLotInventoryCoversLines(lines);

    if (
      existing.movement_type === 'sale' &&
      existing.salesman_commission_type === 'by_rice_quality' &&
      existing.salesman_commission_config
    ) {
      const riceTypes: Array<string | null> = [];
      for (const line of lines) {
        if (line.line_type === 'lot' && line.lot_id) {
          const lot = await inwardSlipLotDAO.findById(line.lot_id);
          riceTypes.push(lot?.rice_type ?? null);
        } else if (line.product_id) {
          const product = await productDAO.findById(line.product_id);
          riceTypes.push(product?.rice_type ?? null);
        } else {
          riceTypes.push(null);
        }
      }
      assertRiceQualityRatesCoverLines(existing.salesman_commission_config, riceTypes);
    }

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

  /** Clone draft, order, or cancelled sauda into a new draft (same lines; new ids). */
  async clone(
    id: string,
    userId?: string,
    opts?: { copyAttachments?: boolean }
  ): Promise<
    SalesSauda & {
      lines?: any[];
      salesman_commission_preview?: number | null;
      broker_commission_preview?: number | null;
    }
  > {
    const source = await this.getById(id);

    const cloneable: SalesSaudaStatus[] = ['draft', 'order', 'cancelled'];
    if (!cloneable.includes(source.status)) {
      throw new ConflictError(`Cannot clone sales sauda in status '${source.status}'`);
    }

    if (!source.sauda_type) {
      throw new ValidationError('Source sales sauda is missing sauda_type and cannot be cloned');
    }

    const ref = source.order_number ?? source.id.slice(0, 8).toUpperCase();
    const cloneNote = source.notes?.trim()
      ? `${source.notes.trim()}\n\nCloned from ${ref}`
      : `Cloned from ${ref}`;

    const today = new Date().toISOString().slice(0, 10);
    const copyAttachments = opts?.copyAttachments === true;

    const lines: CreateSalesSaudaLineDTO[] = (source.lines ?? []).map((line, i) => {
      const lineType = line.line_type ?? 'product';
      const base = {
        line_type: lineType,
        quantity: Number(line.quantity),
        quantity_unit: line.quantity_unit ?? 'kg',
        rate: Number(line.rate),
        discount_value: Number(line.discount_value ?? 0),
        discount_type: (line.discount_type ?? 'per_kg') as SalesSaudaDiscountType,
        gst_percent: Number(line.gst_percent ?? 0),
        sort_order: line.sort_order ?? i,
      };

      if (lineType === 'lot') {
        return {
          ...base,
          lot_id: line.lot_id ?? undefined,
          no_of_bags: line.no_of_bags != null ? Number(line.no_of_bags) : undefined,
          bag_weight: line.bag_weight != null ? Number(line.bag_weight) : undefined,
        };
      }

      return {
        ...base,
        product_id: line.product_id ?? undefined,
        product_alias: line.product_alias ?? null,
        packaging_id: line.packaging_id ?? undefined,
        packet_count: line.packet_count != null ? Number(line.packet_count) : undefined,
      };
    });

    return this.create(
      {
        sales_party_id: source.sales_party_id,
        salesman_id: source.salesman_id,
        salesman_commission_type: source.salesman_commission_type,
        salesman_commission_config: source.salesman_commission_config,
        broker_id: source.broker_id,
        broker_commission: source.broker_commission,
        broker_commission_type: source.broker_commission_type,
        sauda_type: source.sauda_type,
        movement_type: source.movement_type,
        from_godown_id: source.from_godown_id,
        to_godown_id: source.to_godown_id,
        status: 'draft',
        sauda_date: today,
        billing_address: source.billing_address,
        delivery_address: source.delivery_address,
        notes: cloneNote,
        payment_terms: source.payment_terms,
        customer_po_url: copyAttachments ? source.customer_po_url : null,
        email_attachment_url: copyAttachments ? source.email_attachment_url : null,
        agreement_url: copyAttachments ? source.agreement_url : null,
        whatsapp_screenshot_url: copyAttachments ? source.whatsapp_screenshot_url : null,
        lines,
      },
      userId
    );
  }

  /**
   * Delete draft or finalized (order) sales sauda.
   * Blocked while invoice dispatches, credit notes, or commission ledger rows exist.
   */
  async delete(id: string): Promise<void> {
    const existing = await salesSaudaDAO.findById(id);
    if (!existing) throw new NotFoundError('Sales sauda not found');

    if (existing.status !== 'draft' && existing.status !== 'order' && existing.status !== 'cancelled') {
      throw new ConflictError(`Cannot delete sales sauda in status '${existing.status}'`);
    }

    await this.assertSaudaHardDeletable(id);

    const deleted = await salesSaudaDAO.delete(id);
    if (!deleted) throw new NotFoundError('Sales sauda not found');
  }

  /** Downstream docs use ON DELETE RESTRICT — require them gone first. */
  private async assertSaudaHardDeletable(id: string): Promise<void> {
    const dispatchCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM invoice_dispatches WHERE sales_sauda_id = $1`,
      [id]
    );
    const dispatches = Number(dispatchCount.rows[0]?.count ?? 0);
    if (dispatches > 0) {
      throw new ConflictError(
        `Cannot delete sales sauda that has ${dispatches} invoice dispatch(es); delete them first`
      );
    }

    const creditNoteCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM credit_notes WHERE sales_sauda_id = $1`,
      [id]
    );
    const creditNotes = Number(creditNoteCount.rows[0]?.count ?? 0);
    if (creditNotes > 0) {
      throw new ConflictError(
        `Cannot delete sales sauda that has ${creditNotes} credit note(s); remove them first`
      );
    }

    const commissionCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM salesman_commission_entries WHERE sales_sauda_id = $1`,
      [id]
    );
    const commissions = Number(commissionCount.rows[0]?.count ?? 0);
    if (commissions > 0) {
      throw new ConflictError(
        `Cannot delete sales sauda that has ${commissions} salesman commission entr(y/ies); remove linked dispatches/credit notes first`
      );
    }

    const brokerCommissionCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM broker_commission_entries WHERE sales_sauda_id = $1`,
      [id]
    );
    const brokerCommissions = Number(brokerCommissionCount.rows[0]?.count ?? 0);
    if (brokerCommissions > 0) {
      throw new ConflictError(
        `Cannot delete sales sauda that has ${brokerCommissions} broker commission entr(y/ies); remove linked dispatches/credit notes first`
      );
    }
  }
}

export const salesSaudaService = new SalesSaudaService();
