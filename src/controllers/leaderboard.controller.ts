import { Response, NextFunction } from 'express';
import { LeaderboardDAO } from '../dao/leaderboard.dao';
import { ResponseHandler } from '../utils/response';
import { LeaderboardFilters, LeaderboardResponse } from '../models/leaderboard.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { NotFoundError } from '../utils/errors';
import { validate, uuidSchema } from '../utils/validators';

const leaderboardDAO = new LeaderboardDAO();

export class LeaderboardController {
  async getLeaderboard(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const filters: LeaderboardFilters = {
        time_range: req.query.start_date && req.query.end_date ? {
          start_date: req.query.start_date as string,
          end_date: req.query.end_date as string
        } : undefined,
        sort_by: req.query.sort_by as any || 'performance_score',
        sort_order: req.query.sort_order as any || 'desc',
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const entries = await leaderboardDAO.getLeaderboard(filters);
      const totalCount = await leaderboardDAO.getLeaderboardCount(filters);

      const response: LeaderboardResponse = {
        entries,
        total_count: totalCount,
        filters_applied: filters,
        generated_at: new Date().toISOString()
      };

      return ResponseHandler.success(res, response);
    } catch (error) {
      next(error);
    }
  }

  async getSalespersonStats(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const salespersonId = validate<string>(uuidSchema, req.params.id);
      
      const timeRange = req.query.start_date && req.query.end_date ? {
        start_date: req.query.start_date as string,
        end_date: req.query.end_date as string
      } : undefined;

      const stats = await leaderboardDAO.getSalespersonStats(salespersonId, timeRange);
      if (!stats) {
        throw new NotFoundError('Salesperson not found or has no leads');
      }

      return ResponseHandler.success(res, stats);
    } catch (error) {
      next(error);
    }
  }

  async getSalespersonDetailStats(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const salespersonId = validate<string>(uuidSchema, req.params.id);
      
      const detailStats = await leaderboardDAO.getSalespersonDetailStats(salespersonId);
      if (!detailStats) {
        throw new NotFoundError('Salesperson not found or has no leads');
      }

      return ResponseHandler.success(res, detailStats);
    } catch (error) {
      next(error);
    }
  }

  async getTeamStats(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const teamStats = await leaderboardDAO.getTeamStats();
      return ResponseHandler.success(res, teamStats);
    } catch (error) {
      next(error);
    }
  }

  async getMonthlyTrends(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const salespersonId = validate<string>(uuidSchema, req.params.id);
      
      const trends = await leaderboardDAO.getMonthlyTrends(salespersonId);
      return ResponseHandler.success(res, trends);
    } catch (error) {
      next(error);
    }
  }

  async getRecentActivities(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const salespersonId = validate<string>(uuidSchema, req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      
      const activities = await leaderboardDAO.getRecentActivities(salespersonId, limit);
      return ResponseHandler.success(res, activities);
    } catch (error) {
      next(error);
    }
  }
}
