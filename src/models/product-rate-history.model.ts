import { PackagingWeight } from './packaging.model';
import { Brand } from './product.model';
import { RiceType } from './lead.model';

export interface ProductRateHistory {
  id: string;
  product_id: string;
  holding_capacity: PackagingWeight;
  rate: number;
  created_at: Date;
  created_by: string | null;
}

export interface ProductRateHistoryPointResponse {
  id: string;
  holding_capacity: number;
  rate: number;
  created_at: string;
  created_by: { id: string; full_name: string } | null;
}

export interface ProductRateHistoryResponse {
  product: {
    id: string;
    name: string;
    description: string | null;
    brand: Brand | null;
    rice_type: RiceType | null;
  };
  points: ProductRateHistoryPointResponse[];
}
