export interface LoginHistory {
  id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  login_status: 'success' | 'failed' | 'blocked';
  failure_reason: string | null;
  login_at: Date;
  created_at: Date;
}

export interface CreateLoginHistoryDTO {
  user_id: string;
  ip_address?: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  operating_system?: string;
  login_status: 'success' | 'failed' | 'blocked';
  failure_reason?: string;
}

export interface LoginHistoryFilters {
  user_id?: string;
  login_status?: 'success' | 'failed' | 'blocked';
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

 Numerable;
}
