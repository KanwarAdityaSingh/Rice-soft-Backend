export interface SalespersonStats {
  salesperson_id: string;
  salesperson_name: string;
  salesperson_email: string;
  total_leads: number;
  new_leads: number;
  contacted_leads: number;
  engaged_leads: number;
  converted_leads: number;
  rejected_leads: number;
  conversion_rate: number;
  total_revenue: number;
  avg_deal_size: number;
  avg_conversion_time_days: number;
  high_priority_leads: number;
  urgent_leads: number;
}

export interface LeaderboardEntry {
  rank: number;
  salesperson_id: string;
  salesperson_name: string;
  salesperson_email: string;
  total_leads: number;
  converted_leads: number;
  conversion_rate: number;
  total_revenue: number;
  avg_deal_size: number;
  performance_score: number;
}

export interface LeaderboardFilters {
  time_range?: {
    start_date: string;
    end_date: string;
  };
  sort_by?: 'total_leads' | 'conversion_rate' | 'total_revenue' | 'performance_score';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total_count: number;
  filters_applied: LeaderboardFilters;
  generated_at: string;
}

export interface SalespersonDetailStats {
  salesperson_id: string;
  salesperson_name: string;
  salesperson_email: string;
  stats: SalespersonStats;
  monthly_trends: MonthlyTrend[];
  recent_activities: RecentActivity[];
}

export interface MonthlyTrend {
  month: string;
  leads: number;
  conversions: number;
  revenue: number;
  conversion_rate: number;
}

export interface RecentActivity {
  activity_type: 'lead_created' | 'lead_converted' | 'status_changed';
  description: string;
  timestamp: string;
  lead_id: string;
  lead_company: string;
}

export interface TeamStats {
  total_salespeople: number;
  total_leads: number;
  total_conversions: number;
  overall_conversion_rate: number;
  total_revenue: number;
  avg_deal_size: number;
  top_performer: {
    name: string;
    conversion_rate: number;
    revenue: number;
  };
}
