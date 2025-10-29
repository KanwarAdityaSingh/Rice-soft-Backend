import { Router } from 'express';
import { LeaderboardController } from '../controllers/leaderboard.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const leaderboardController = new LeaderboardController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Leaderboard routes
router.get('/getLeaderboard', leaderboardController.getLeaderboard.bind(leaderboardController));
router.get('/getTeamStats', leaderboardController.getTeamStats.bind(leaderboardController));

// Salesperson specific routes
router.get('/getSalespersonStats/:id', leaderboardController.getSalespersonStats.bind(leaderboardController));
router.get('/getSalespersonDetailStats/:id', leaderboardController.getSalespersonDetailStats.bind(leaderboardController));
router.get('/getSalespersonMonthlyTrends/:id', leaderboardController.getMonthlyTrends.bind(leaderboardController));
router.get('/getSalespersonRecentActivities/:id', leaderboardController.getRecentActivities.bind(leaderboardController));

export default router;