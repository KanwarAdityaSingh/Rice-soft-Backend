import type { ReplenishmentMode, ReplenishmentPlanStatus } from '../constants/replenishment';

export type { ReplenishmentMode, ReplenishmentPlanStatus };

export interface TruckSizeConfig {
  id: string;
  tonnes: number;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TruckSizeConfigInput {
  tonnes: number;
  label?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface ReplenishmentStockRow {
  product_id: string;
  product_name: string;
  packaging_id: string;
  holding_capacity: number;
  packet_type: string | null;
  fgi_kg: number;
  fgi_packets: number;
}

export interface ReplenishmentDraftAllocation {
  invoice_dispatch_id: string;
  invoice_dispatch_line_id: string;
  internal_invoice_number: string;
  serial_number: number | null;
  party_name: string;
  sales_sauda_id: string | null;
  order_number: string | null;
  product_id: string;
  product_name: string;
  packaging_id: string;
  holding_capacity: number;
  quantity_kg: number;
  packets: number;
  status: 'draft';
}

export interface ReplenishmentTrendRow {
  product_id: string;
  product_name: string;
  packaging_id: string;
  holding_capacity: number;
  sold_kg: number;
}

export interface DemandSaudaBreakdown {
  sales_sauda_id: string;
  order_number: string | null;
  party_name: string | null;
  product_id: string;
  packaging_id: string;
  ordered_kg: number;
  allocated_kg: number;
  returned_kg: number;
  remaining_kg: number;
}

export interface ReplenishmentPreviewRequest {
  godown_id: string;
  sales_sauda_ids?: string[];
  mode: ReplenishmentMode;
  truck_tonnes?: number;
  trend_window_days?: number;
  safety_days?: number;
}

export interface ReplenishmentAtpDraft {
  invoice_dispatch_id: string;
  invoice_dispatch_line_id: string;
  internal_invoice_number: string;
  serial_number: number | null;
  party_name: string;
  sales_sauda_id: string | null;
  order_number: string | null;
  quantity_kg: number;
  packets: number;
  status: 'draft';
}

export interface ReplenishmentDemandSauda {
  sales_sauda_id: string;
  order_number: string | null;
  party_name: string | null;
  ordered_kg: number;
  allocated_kg: number;
  returned_kg: number;
  remaining_kg: number;
}

export interface ReplenishmentPreviewLine {
  product_id: string;
  product_name: string;
  packaging_id: string;
  holding_capacity: number;
  fgi_kg: number;
  fgi_packets: number;
  draft_kg: number;
  available_kg: number;
  available_packets: number;
  demand_kg: number;
  demand_packets: number;
  gap_kg: number;
  gap_packets: number;
  surplus_kg: number;
  trend_sold_kg: number;
  daily_kg: number;
  safety_kg: number;
  safety_packets: number;
  trend_share: number;
  load_orders_kg: number;
  load_orders_packets: number;
  load_orders_tonnes: number;
  load_with_safety_kg: number;
  load_with_safety_packets: number;
  load_with_safety_tonnes: number;
  for_orders_kg: number | null;
  for_orders_packets: number | null;
  for_trend_kg: number | null;
  for_trend_packets: number | null;
  fill_truck_kg: number | null;
  fill_truck_packets: number | null;
  fill_truck_tonnes: number | null;
  still_short_kg: number | null;
  still_short_packets: number | null;
  atp_drafts: ReplenishmentAtpDraft[];
  demand_saudas: ReplenishmentDemandSauda[];
}

export interface TruckSnapBlock {
  exact_tonnes: number;
  snap_up_tonnes: number | null;
  snap_down_tonnes: number | null;
  shortfall_if_down_kg: number | null;
}

export interface FillTruckTotals {
  truck_tonnes: number;
  capacity_kg: number;
  allocated_kg: number;
  unallocated_kg: number;
  still_short_kg: number;
}

export interface ReplenishmentPreviewResponse {
  godown_id: string;
  godown_name: string;
  sauda_ids: string[];
  defaults: {
    trend_window_days: number;
    safety_days: number;
  };
  totals: {
    fgi_kg: number;
    draft_kg: number;
    available_kg: number;
    demand_kg: number;
    gap_kg: number;
    surplus_kg: number;
    tonnes_for_orders: number;
    tonnes_for_orders_plus_safety: number;
    truck_snap_orders: TruckSnapBlock;
    truck_snap_with_safety: TruckSnapBlock;
  };
  truck_sizes: number[];
  fill_truck: FillTruckTotals | null;
  lines: ReplenishmentPreviewLine[];
}

export interface CreateReplenishmentPlanDTO extends ReplenishmentPreviewRequest {
  notes?: string | null;
}

export interface ReplenishmentPlanRecord {
  id: string;
  godown_id: string;
  status: ReplenishmentPlanStatus;
  mode: ReplenishmentMode;
  truck_tonnes_input: number | null;
  tonnes_for_orders: number;
  tonnes_for_orders_plus_safety: number;
  snapped_truck_tonnes_orders: number | null;
  snapped_truck_tonnes_with_safety: number | null;
  trend_window_days: number;
  safety_days: number;
  notes: string | null;
  preview_json: ReplenishmentPreviewResponse | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  committed_at: Date | null;
  committed_by: string | null;
}

export interface ReplenishmentPlanLineRecord {
  id: string;
  plan_id: string;
  product_id: string;
  packaging_id: string;
  holding_capacity: number;
  fgi_kg: number;
  draft_kg: number;
  available_kg: number;
  demand_kg: number;
  gap_kg: number;
  surplus_kg: number;
  trend_sold_kg: number;
  daily_kg: number;
  safety_kg: number;
  trend_share: number;
  recommended_kg_orders: number;
  recommended_packets_orders: number;
  recommended_kg_with_safety: number;
  recommended_packets_with_safety: number;
  fill_truck_kg: number | null;
  fill_truck_packets: number | null;
  still_short_kg: number | null;
  atp_drafts: ReplenishmentAtpDraft[];
  demand_saudas: ReplenishmentDemandSauda[];
}

export interface ReplenishmentPlanDetail {
  plan: ReplenishmentPlanRecord;
  sauda_ids: string[];
  lines: ReplenishmentPlanLineRecord[];
  preview: ReplenishmentPreviewResponse | null;
}

export interface ReplenishmentLedgerEntry {
  id: string;
  godown_id: string;
  product_id: string;
  product_name: string | null;
  packaging_id: string | null;
  holding_capacity: number | null;
  quantity_change: number;
  packets_change: number | null;
  source_type: string;
  source_id: string | null;
  stock_before: number;
  stock_after: number;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string | null;
  created_at: string;
  created_by: string | null;
}
