import { PackagingWeight } from './packaging.model';
import { RiceType } from './lead.model';

export interface ProductRateHistory {
  id: string;
  product_id: string;
  holding_capacity: PackagingWeight;
  rate: number;
  effective_date: Date | string;
  created_at: Date;
  created_by: string | null;
}

export interface ProductRateHistoryPointResponse {
  id: string;
  holding_capacity: number;
  rate: number;
  /** YYYY-MM-DD — business date for this history line */
  effective_date: string;
  /** When the row was recorded in the system */
  created_at: string;
  created_by: { id: string; full_name: string } | null;
}

export interface ProductRateHistoryResponse {
  product: {
    id: string;
    name: string;
    description: string | null;
    brand: string | null;
    rice_type: RiceType | null;
  };
  points: ProductRateHistoryPointResponse[];
}

export interface UpdateRateHistoryPointResponse {
  point: ProductRateHistoryPointResponse;
  /** True when this row was also the current live rate for its capacity, so product_rates was updated too. */
  current_rate_updated: boolean;
}
