import type { Address } from './vendor.model';
import type { SalesSaudaType } from '../constants/sales-sauda-types';
import type { SalesMovementType } from '../constants/sales-movement-types';
import type {
  SalesmanCommissionConfig,
  SalesmanCommissionType,
} from '../constants/salesman-commission-types';

export type SalesSaudaStatus = 'draft' | 'order' | 'cancelled';
export type { SalesSaudaType, SalesMovementType };

export interface SalesSauda {
  id: string;
  sales_party_id: string;
  salesman_id: string | null;
  /** Joined from salesmen when selected */
  salesman_name?: string | null;
  /** Applied commission type snapshot (sale only). */
  salesman_commission_type: SalesmanCommissionType | null;
  /** Applied commission rate values snapshot. */
  salesman_commission_config: SalesmanCommissionConfig | null;
  sauda_type: SalesSaudaType | null;
  /** sale (default) or godown_transfer */
  movement_type: SalesMovementType;
  from_godown_id: string | null;
  to_godown_id: string | null;
  status: SalesSaudaStatus;
  order_number: string | null;
  sauda_date: Date | string | null;
  /** Indian FY label Apr–Mar, e.g. 2025-2026 */
  financial_year: string;
  billing_address: Address | null;
  delivery_address: Address | null;
  notes: string | null;
  payment_terms: string | null;
  /** Optional supporting docs (S3 URLs) */
  customer_po_url: string | null;
  email_attachment_url: string | null;
  agreement_url: string | null;
  whatsapp_screenshot_url: string | null;
  amount: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateSalesSaudaDTO {
  /** Required for sale; optional for godown_transfer (auto from to_godown) */
  sales_party_id?: string;
  salesman_id?: string | null;
  salesman_commission_type?: SalesmanCommissionType | null;
  salesman_commission_config?: SalesmanCommissionConfig | null;
  sauda_type: SalesSaudaType;
  movement_type?: SalesMovementType;
  from_godown_id?: string | null;
  to_godown_id?: string | null;
  status?: SalesSaudaStatus;
  sauda_date?: string | Date;
  financial_year?: string;
  billing_address?: Address | null;
  delivery_address?: Address | null;
  notes?: string;
  payment_terms?: string | null;
  customer_po_url?: string | null;
  email_attachment_url?: string | null;
  agreement_url?: string | null;
  whatsapp_screenshot_url?: string | null;
  amount?: number;
  created_by?: string;
}

export interface UpdateSalesSaudaDTO {
  sales_party_id?: string;
  salesman_id?: string | null;
  salesman_commission_type?: SalesmanCommissionType | null;
  salesman_commission_config?: SalesmanCommissionConfig | null;
  sauda_type?: SalesSaudaType;
  movement_type?: SalesMovementType;
  from_godown_id?: string | null;
  to_godown_id?: string | null;
  status?: SalesSaudaStatus;
  order_number?: string | null;
  sauda_date?: string | Date;
  financial_year?: string;
  billing_address?: Address | null;
  delivery_address?: Address | null;
  notes?: string;
  payment_terms?: string | null;
  customer_po_url?: string | null;
  email_attachment_url?: string | null;
  agreement_url?: string | null;
  whatsapp_screenshot_url?: string | null;
  amount?: number;
  updated_by?: string;
}

export interface SalesSaudaResponse {
  id: string;
  /** First 4 hex digits of id — compact table label */
  display_id: string;
  sales_party_id: string;
  salesman_id: string | null;
  salesman_name: string | null;
  salesman_commission_type: SalesmanCommissionType | null;
  salesman_commission_config: SalesmanCommissionConfig | null;
  /** Preview only — not persisted. */
  salesman_commission_preview?: number | null;
  sauda_type: SalesSaudaType | null;
  movement_type: SalesMovementType;
  from_godown_id: string | null;
  to_godown_id: string | null;
  status: SalesSaudaStatus;
  order_number: string | null;
  sauda_date: string | null;
  financial_year: string;
  billing_address: Address | null;
  delivery_address: Address | null;
  notes: string | null;
  payment_terms: string | null;
  customer_po_url: string | null;
  email_attachment_url: string | null;
  agreement_url: string | null;
  whatsapp_screenshot_url: string | null;
  amount: number;
  created_at: string;
  updated_at: string;
}
