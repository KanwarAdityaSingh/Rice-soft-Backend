import { expenseEntityLinkDAO } from '../dao/expense-entity-link.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import { salesSaudaDAO } from '../dao/sales-sauda.dao';
import {
  CreateExpenseEntityLinkDTO,
  AvailableEntity,
} from '../models/expense.model';
import { ValidationError } from '../utils/errors';

/** Entity types that must have transportation_cost > 0 to be linkable. */
const TRANSPORT_COST_ENTITY_TYPES = new Set(['invoice_dispatch', 'inward_slip_pass']);

function hasPositiveTransportationCost(value: unknown): boolean {
  if (value == null || value === '') return false;
  const n = parseFloat(String(value));
  return Number.isFinite(n) && n > 0;
}

function toTransportAmount(value: unknown): number | undefined {
  if (!hasPositiveTransportationCost(value)) return undefined;
  return parseFloat(String(value));
}

export class ExpenseLinkingService {
  async getAvailableEntities(
    entityType: string,
    filters?: {
      godown_id?: string;
      date_from?: string;
      date_to?: string;
      status?: string;
      /** When set, only return invoice_dispatch / inward_slip_pass for this transporter. */
      transporter_id?: string;
    }
  ): Promise<AvailableEntity[]> {
    const availableEntities: AvailableEntity[] = [];
    const transporterId = filters?.transporter_id?.trim() || undefined;

    switch (entityType) {
      case 'invoice_dispatch': {
        const invoices = await invoiceDispatchDAO.findAll(
          filters?.godown_id,
          undefined, // sales_sauda_id
          filters?.status as any,
          undefined, // to_godown_id
          { limit: 1000, offset: 0 }
        );

        // Only invoices with transportation cost (and matching transporter when provided)
        const withTransport = invoices.rows.filter((inv) => {
          if (!hasPositiveTransportationCost(inv.transportation_cost)) return false;
          if (transporterId && inv.transporter_id !== transporterId) return false;
          return true;
        });
        const invoiceIds = withTransport.map((inv) => inv.id);
        const linkedMap = await expenseEntityLinkDAO.findLinkedExpensesByEntities(
          'invoice_dispatch',
          invoiceIds
        );

        for (const invoice of withTransport) {
          if (!linkedMap.has(invoice.id)) {
            const displayDate = invoice.dispatch_date
              ? (typeof invoice.dispatch_date === 'string'
                  ? invoice.dispatch_date
                  : invoice.dispatch_date.toISOString().split('T')[0])
              : '';

            availableEntities.push({
              id: invoice.id,
              display_name: `${invoice.internal_invoice_number} - ${invoice.party_name}`,
              date: displayDate,
              amount: toTransportAmount(invoice.transportation_cost),
              party_name: invoice.party_name,
            });
          }
        }
        break;
      }

      case 'inward_slip_pass': {
        const isps = await inwardSlipPassDAO.findAll(
          undefined, // sauda_id
          filters?.godown_id,
          { limit: 1000, offset: 0 }
        );

        const withTransport = isps.rows.filter((isp) => {
          if (!hasPositiveTransportationCost(isp.transportation_cost)) return false;
          if (transporterId && isp.transporter_id !== transporterId) return false;
          return true;
        });
        const ispIds = withTransport.map((isp) => isp.id);
        const linkedMap = await expenseEntityLinkDAO.findLinkedExpensesByEntities(
          'inward_slip_pass',
          ispIds
        );

        for (const isp of withTransport) {
          if (!linkedMap.has(isp.id)) {
            availableEntities.push({
              id: isp.id,
              display_name: `${isp.slip_number} - ${isp.party_name}`,
              date: typeof isp.date === 'string' ? isp.date : isp.date.toISOString().split('T')[0],
              amount: toTransportAmount(isp.transportation_cost),
              party_name: isp.party_name,
            });
          }
        }
        break;
      }

      case 'sales_sauda': {
        const saudas = await salesSaudaDAO.findAll(
          undefined, // sales_party_id
          undefined, // status
          undefined, // financial_year
          'all', // movement_type
          { limit: 1000, offset: 0 }
        );

        const saudaIds = saudas.rows.map((sauda) => sauda.id);
        const linkedMap = await expenseEntityLinkDAO.findLinkedExpensesByEntities(
          'sales_sauda',
          saudaIds
        );

        for (const sauda of saudas.rows) {
          if (!linkedMap.has(sauda.id)) {
            const displayDate = sauda.sauda_date 
              ? (typeof sauda.sauda_date === 'string' ? sauda.sauda_date : sauda.sauda_date.toISOString().split('T')[0])
              : '';
            
            availableEntities.push({
              id: sauda.id,
              display_name: `Sauda #${sauda.id.substring(0, 8)}`,
              date: displayDate,
              party_name: undefined,
            });
          }
        }
        break;
      }

      default:
        throw new ValidationError(`Unsupported entity type: ${entityType}`);
    }

    return availableEntities;
  }

  async validateEntityLinks(
    links: CreateExpenseEntityLinkDTO[],
    options?: { transporter_id?: string }
  ): Promise<void> {
    const errors: string[] = [];
    const expectedTransporterId = options?.transporter_id?.trim() || undefined;

    for (const link of links) {
      // Check if entity exists
      const exists = await this.entityExists(link.entity_type, link.entity_id);
      if (!exists) {
        errors.push(
          `${link.entity_type} with ID ${link.entity_id} not found`
        );
        continue;
      }

      // Transport-linkable entities must have transportation_cost > 0
      if (TRANSPORT_COST_ENTITY_TYPES.has(link.entity_type)) {
        const transportCost = await this.getEntityTransportationCost(
          link.entity_type,
          link.entity_id
        );
        if (!hasPositiveTransportationCost(transportCost)) {
          errors.push(
            `${link.entity_type} ${link.entity_id} has no transportation cost and cannot be linked`
          );
          continue;
        }

        // When payee is a transporter, entity must belong to that transporter
        if (expectedTransporterId) {
          const entityTransporterId = await this.getEntityTransporterId(
            link.entity_type,
            link.entity_id
          );
          if (entityTransporterId !== expectedTransporterId) {
            errors.push(
              `${link.entity_type} ${link.entity_id} is not for the selected transporter`
            );
            continue;
          }
        }
      }

      // Check if already linked
      const isLinked = await expenseEntityLinkDAO.isEntityLinked(
        link.entity_type,
        link.entity_id
      );
      if (isLinked) {
        errors.push(
          `${link.entity_type} ${link.entity_id} is already linked to another expense`
        );
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(`Entity link validation failed: ${errors.join('; ')}`);
    }
  }

  private async getEntityTransportationCost(
    entityType: string,
    entityId: string
  ): Promise<number | null> {
    switch (entityType) {
      case 'invoice_dispatch': {
        const invoice = await invoiceDispatchDAO.findById(entityId);
        return invoice?.transportation_cost != null
          ? parseFloat(String(invoice.transportation_cost))
          : null;
      }
      case 'inward_slip_pass': {
        const isp = await inwardSlipPassDAO.findById(entityId);
        return isp?.transportation_cost != null
          ? parseFloat(String(isp.transportation_cost))
          : null;
      }
      default:
        return null;
    }
  }

  private async getEntityTransporterId(
    entityType: string,
    entityId: string
  ): Promise<string | null> {
    switch (entityType) {
      case 'invoice_dispatch': {
        const invoice = await invoiceDispatchDAO.findById(entityId);
        return invoice?.transporter_id ?? null;
      }
      case 'inward_slip_pass': {
        const isp = await inwardSlipPassDAO.findById(entityId);
        return isp?.transporter_id ?? null;
      }
      default:
        return null;
    }
  }

  async resolveEntityDisplayName(entityType: string, entityId: string): Promise<string> {
    try {
      switch (entityType) {
        case 'invoice_dispatch': {
          const invoice = await invoiceDispatchDAO.findById(entityId);
          if (invoice) {
            return `Invoice ${invoice.internal_invoice_number} - ${invoice.party_name}`;
          }
          break;
        }

        case 'inward_slip_pass': {
          const isp = await inwardSlipPassDAO.findById(entityId);
          if (isp) {
            return `ISP ${isp.slip_number} - ${isp.party_name}`;
          }
          break;
        }

        case 'sales_sauda': {
          const sauda = await salesSaudaDAO.findById(entityId);
          if (sauda) {
            return `Sauda #${sauda.id.substring(0, 8)}`;
          }
          break;
        }
      }
    } catch (error) {
      // If entity not found or error, return generic display
    }

    return `${entityType} ${entityId.substring(0, 8)}`;
  }

  private async entityExists(entityType: string, entityId: string): Promise<boolean> {
    try {
      switch (entityType) {
        case 'invoice_dispatch': {
          const invoice = await invoiceDispatchDAO.findById(entityId);
          return invoice !== null;
        }

        case 'inward_slip_pass': {
          const isp = await inwardSlipPassDAO.findById(entityId);
          return isp !== null;
        }

        case 'sales_sauda': {
          const sauda = await salesSaudaDAO.findById(entityId);
          return sauda !== null;
        }

        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }
}

export const expenseLinkingService = new ExpenseLinkingService();
