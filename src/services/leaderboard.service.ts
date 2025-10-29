import { LeaderboardDAO } from '../dao/leaderboard.dao';
import { LeaderboardFilters, LeaderboardResponse } from '../models/leaderboard.model';

const leaderboardDAO = new LeaderboardDAO();

export class LeaderboardService {
  async getLeaderboard(filters: LeaderboardFilters): Promise<LeaderboardResponse> {
    const entries = await leaderboardDAO.getLeaderboard(filters);
    const totalCount = await leaderboardDAO.getLeaderboardCount(filters);

    return {
      entries,
      total_count: totalCount,
      filters_applied: filters,
      generated_at: new Date().toISOString()
    };
  }

  async getSalespersonStats(salespersonId: string, timeRange?: any): Promise<any> {
    return await leaderboardDAO.getSalespersonStats(salespersonId, timeRange);
  }

  async getSalespersonDetailStats(salespersonId: string, timeRange?: any): Promise<any> {
    return await leaderboardDAO.getSalespersonDetailStats(salespersonId, timeRange);
  }

  async getTeamStats(): Promise<any> {
    return await leaderboardDAO.getTeamStats();
  }

  async getMonthlyTrends(salespersonId: string, year: number, month: number): Promise<any> {
    return await leaderboardDAO.getMonthlyTrends(salespersonId, year, month);
  }

  async getRecentActivities(salespersonId: string, limit: number = 10): Promise<any[]> {
    return await leaderboardDAO.getRecentActivities(salespersonId, limit);
  }
}

export const leaderboardService = new LeaderboardService();

