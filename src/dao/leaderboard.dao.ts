import { db } from '../database/connection';
import { 
  SalespersonStats, 
  LeaderboardEntry, 
  LeaderboardFilters, 
  SalespersonDetailStats, 
  MonthlyTrend, 
  RecentActivity, 
  TeamStats 
} from '../models/leaderboard.model';

export class LeaderboardDAO {
  async getLeaderboard(filters: LeaderboardFilters = {}): Promise<LeaderboardEntry[]> {
    let query = `
      WITH salesperson_stats AS (
        SELECT 
          u.id as salesperson_id,
          u.username as salesperson_name,
          u.email as salesperson_email,
          COUNT(l.id) as total_leads,
          COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END) as converted_leads,
          CASE 
            WHEN COUNT(l.id) > 0 THEN 
              ROUND((COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END)::DECIMAL / COUNT(l.id)) * 100, 2)
            ELSE 0 
          END as conversion_rate,
          COALESCE(SUM(c.conversion_value), 0) as total_revenue,
          CASE 
            WHEN COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END) > 0 THEN 
              ROUND(COALESCE(SUM(c.conversion_value), 0) / COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END), 2)
            ELSE 0 
          END as avg_deal_size,
          -- Performance score: weighted combination of conversion rate (40%), total revenue (30%), total leads (20%), avg deal size (10%)
          CASE 
            WHEN COUNT(l.id) > 0 THEN 
              ROUND(
                ((COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END)::DECIMAL / COUNT(l.id)) * 100 * 0.4) +
                (LEAST(COALESCE(SUM(c.conversion_value), 0) / 100000, 100) * 0.3) +
                (LEAST(COUNT(l.id) / 10.0, 100) * 0.2) +
                (LEAST(CASE 
                  WHEN COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END) > 0 THEN 
                    COALESCE(SUM(c.conversion_value), 0) / COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END)
                  ELSE 0 
                END / 10000, 100) * 0.1), 2)
            ELSE 0 
          END as performance_score
        FROM users u
        LEFT JOIN leads l ON u.id = l.assigned_to
        LEFT JOIN conversions c ON l.id = c.lead_id
        WHERE u.user_type = 'salesman'
    `;

    const params: any[] = [];
    let paramCount = 1;

    // Add time range filter
    if (filters.time_range?.start_date && filters.time_range?.end_date) {
      query += ` AND l.created_at >= $${paramCount++} AND l.created_at <= $${paramCount++}`;
      params.push(filters.time_range.start_date, filters.time_range.end_date);
    }

    query += `
        GROUP BY u.id, u.username, u.email
      )
      SELECT 
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE WHEN $${paramCount++} = 'total_leads' THEN total_leads
                 WHEN $${paramCount++} = 'conversion_rate' THEN conversion_rate
                 WHEN $${paramCount++} = 'total_revenue' THEN total_revenue
                 WHEN $${paramCount++} = 'performance_score' THEN performance_score
                 ELSE performance_score END
            ${filters.sort_order === 'asc' ? 'ASC' : 'DESC'}
        ) as rank,
        salesperson_id,
        salesperson_name,
        salesperson_email,
        total_leads,
        converted_leads,
        conversion_rate,
        total_revenue,
        avg_deal_size,
        performance_score
      FROM salesperson_stats
      WHERE total_leads > 0
    `;

    // Add sorting parameters
    const sortBy = filters.sort_by || 'performance_score';
    params.push(sortBy, sortBy, sortBy, sortBy);

    // Add pagination
    if (filters.limit) {
      query += ` LIMIT $${paramCount++}`;
      params.push(filters.limit);
    }
    if (filters.offset) {
      query += ` OFFSET $${paramCount++}`;
      params.push(filters.offset);
    }

    const result = await db.query<LeaderboardEntry>(query, params);
    return result.rows;
  }

  async getSalespersonStats(salespersonId: string, timeRange?: { start_date: string; end_date: string }): Promise<SalespersonStats | null> {
    let query = `
      SELECT 
        u.id as salesperson_id,
        u.username as salesperson_name,
        u.email as salesperson_email,
        COUNT(l.id) as total_leads,
        COUNT(CASE WHEN l.lead_status = 'new' THEN 1 END) as new_leads,
        COUNT(CASE WHEN l.lead_status = 'contacted' THEN 1 END) as contacted_leads,
        COUNT(CASE WHEN l.lead_status = 'engaged' THEN 1 END) as engaged_leads,
        COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END) as converted_leads,
        COUNT(CASE WHEN l.lead_status = 'rejected' THEN 1 END) as rejected_leads,
        CASE 
          WHEN COUNT(l.id) > 0 THEN 
            ROUND((COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END)::DECIMAL / COUNT(l.id)) * 100, 2)
          ELSE 0 
        END as conversion_rate,
        COALESCE(SUM(c.conversion_value), 0) as total_revenue,
        CASE 
          WHEN COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END) > 0 THEN 
            ROUND(COALESCE(SUM(c.conversion_value), 0) / COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END), 2)
          ELSE 0 
        END as avg_deal_size,
        CASE 
          WHEN COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END) > 0 THEN 
            ROUND(AVG(EXTRACT(DAYS FROM (c.conversion_date - l.created_at))), 1)
          ELSE 0 
        END as avg_conversion_time_days,
        COUNT(CASE WHEN l.priority = 'high' THEN 1 END) as high_priority_leads,
        COUNT(CASE WHEN l.priority = 'urgent' THEN 1 END) as urgent_leads
      FROM users u
      LEFT JOIN leads l ON u.id = l.assigned_to
      LEFT JOIN conversions c ON l.id = c.lead_id
      WHERE u.id = $1 AND u.user_type = 'salesman'
    `;

    const params = [salespersonId];

    if (timeRange?.start_date && timeRange?.end_date) {
      query += ` AND l.created_at >= $2 AND l.created_at <= $3`;
      params.push(timeRange.start_date, timeRange.end_date);
    }

    query += ` GROUP BY u.id, u.username, u.email`;

    const result = await db.query<SalespersonStats>(query, params);
    return result.rows[0] || null;
  }

  async getSalespersonDetailStats(salespersonId: string): Promise<SalespersonDetailStats | null> {
    // Get basic stats
    const stats = await this.getSalespersonStats(salespersonId);
    if (!stats) return null;

    // Get monthly trends
    const monthlyTrends = await this.getMonthlyTrends(salespersonId);

    // Get recent activities
    const recentActivities = await this.getRecentActivities(salespersonId);

    return {
      salesperson_id: stats.salesperson_id,
      salesperson_name: stats.salesperson_name,
      salesperson_email: stats.salesperson_email,
      stats,
      monthly_trends: monthlyTrends,
      recent_activities: recentActivities
    };
  }

  async getMonthlyTrends(salespersonId: string): Promise<MonthlyTrend[]> {
    const query = `
      SELECT 
        TO_CHAR(l.created_at, 'YYYY-MM') as month,
        COUNT(l.id) as leads,
        COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END) as conversions,
        COALESCE(SUM(c.conversion_value), 0) as revenue,
        CASE 
          WHEN COUNT(l.id) > 0 THEN 
            ROUND((COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END)::DECIMAL / COUNT(l.id)) * 100, 2)
          ELSE 0 
        END as conversion_rate
      FROM leads l
      LEFT JOIN conversions c ON l.id = c.lead_id
      WHERE l.assigned_to = $1
        AND l.created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY TO_CHAR(l.created_at, 'YYYY-MM')
      ORDER BY month DESC
    `;

    const result = await db.query<MonthlyTrend>(query, [salespersonId]);
    return result.rows;
  }

  async getRecentActivities(salespersonId: string, limit = 10): Promise<RecentActivity[]> {
    const query = `
      SELECT 
        'lead_created' as activity_type,
        'Lead created for ' || l.company_name as description,
        l.created_at as timestamp,
        l.id as lead_id,
        l.company_name as lead_company
      FROM leads l
      WHERE l.assigned_to = $1
      
      UNION ALL
      
      SELECT 
        'lead_converted' as activity_type,
        'Lead converted for ' || l.company_name as description,
        c.conversion_date as timestamp,
        l.id as lead_id,
        l.company_name as lead_company
      FROM leads l
      JOIN conversions c ON l.id = c.lead_id
      WHERE l.assigned_to = $1
      
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const result = await db.query<RecentActivity>(query, [salespersonId, limit]);
    return result.rows;
  }

  async getTeamStats(): Promise<TeamStats> {
    const query = `
      WITH team_stats AS (
        SELECT 
          COUNT(DISTINCT u.id) as total_salespeople,
          COUNT(l.id) as total_leads,
          COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END) as total_conversions,
          CASE 
            WHEN COUNT(l.id) > 0 THEN 
              ROUND((COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END)::DECIMAL / COUNT(l.id)) * 100, 2)
            ELSE 0 
          END as overall_conversion_rate,
          COALESCE(SUM(c.conversion_value), 0) as total_revenue,
          CASE 
            WHEN COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END) > 0 THEN 
              ROUND(COALESCE(SUM(c.conversion_value), 0) / COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END), 2)
            ELSE 0 
          END as avg_deal_size
        FROM users u
        LEFT JOIN leads l ON u.id = l.assigned_to
        LEFT JOIN conversions c ON l.id = c.lead_id
        WHERE u.user_type = 'salesman'
      ),
      top_performer AS (
        SELECT 
          u.username as name,
          CASE 
            WHEN COUNT(l.id) > 0 THEN 
              ROUND((COUNT(CASE WHEN l.lead_status = 'converted' THEN 1 END)::DECIMAL / COUNT(l.id)) * 100, 2)
            ELSE 0 
          END as conversion_rate,
          COALESCE(SUM(c.conversion_value), 0) as revenue
        FROM users u
        LEFT JOIN leads l ON u.id = l.assigned_to
        LEFT JOIN conversions c ON l.id = c.lead_id
        WHERE u.user_type = 'salesman'
        GROUP BY u.id, u.username
        ORDER BY conversion_rate DESC, revenue DESC
        LIMIT 1
      )
      SELECT 
        ts.*,
        tp.name as top_performer_name,
        tp.conversion_rate as top_performer_conversion_rate,
        tp.revenue as top_performer_revenue
      FROM team_stats ts
      LEFT JOIN top_performer tp ON true
    `;

    const result = await db.query(query);
    const row = result.rows[0];

    // Handle case where no rows are returned (no salespeople)
    if (!row) {
      return {
        total_salespeople: 0,
        total_leads: 0,
        total_conversions: 0,
        overall_conversion_rate: 0,
        total_revenue: 0,
        avg_deal_size: 0,
        top_performer: {
          name: '',
          conversion_rate: 0,
          revenue: 0
        }
      };
    }

    return {
      total_salespeople: parseInt(row.total_salespeople || '0'),
      total_leads: parseInt(row.total_leads || '0'),
      total_conversions: parseInt(row.total_conversions || '0'),
      overall_conversion_rate: parseFloat(row.overall_conversion_rate || '0'),
      total_revenue: parseFloat(row.total_revenue || '0'),
      avg_deal_size: parseFloat(row.avg_deal_size || '0'),
      top_performer: {
        name: row.top_performer_name || null,
        conversion_rate: parseFloat(row.top_performer_conversion_rate || '0'),
        revenue: parseFloat(row.top_performer_revenue || '0')
      }
    };
  }

  async getLeaderboardCount(filters: LeaderboardFilters = {}): Promise<number> {
    let query = `
      SELECT COUNT(DISTINCT u.id) as count
      FROM users u
      LEFT JOIN leads l ON u.id = l.assigned_to
      WHERE u.user_type = 'salesman'
    `;

    const params: any[] = [];
    let paramCount = 1;

    if (filters.time_range?.start_date && filters.time_range?.end_date) {
      query += ` AND l.created_at >= $${paramCount++} AND l.created_at <= $${paramCount++}`;
      params.push(filters.time_range.start_date, filters.time_range.end_date);
    }

    query += ` AND EXISTS (SELECT 1 FROM leads l2 WHERE l2.assigned_to = u.id)`;

    const result = await db.query(query, params);
    return parseInt(result.rows[0].count);
  }
}
