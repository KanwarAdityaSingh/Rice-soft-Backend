import { Response, NextFunction } from 'express';
import { purchaseSummaryDAO } from '../dao/purchase-summary.dao';
import { NotFoundError } from '../utils/errors';
import { ResponseHandler } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class PurchaseSummaryController {
  async getSaudaSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { saudaId } = req.params;
      const godownId = req.query.godown_id as string | undefined;

      // IGST removed - no options needed
      const summary = await purchaseSummaryDAO.getSaudaSummary(saudaId, godownId);

      return ResponseHandler.success(res, summary, 'Sauda summary retrieved successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Sauda not found') {
        next(new NotFoundError('Sauda not found'));
      } else {
        next(error);
      }
    }
  }

  async getIspSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { ispId } = req.params;
      const godownId = req.query.godown_id as string | undefined;

      // IGST removed - no options needed
      const summary = await purchaseSummaryDAO.getIspSummary(ispId, godownId);

      return ResponseHandler.success(res, summary, 'ISP summary retrieved successfully');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Inward slip pass not found') {
          next(new NotFoundError('Inward slip pass not found'));
        } else if (error.message === 'No saudas found for this ISP') {
          next(new NotFoundError('No saudas found for this ISP'));
        } else {
          next(error);
        }
      } else {
        next(error);
      }
    }
  }

  /** Kaanta-only overview: ISP rows + rollup (no sauda object in body). */
  async getKaantaPurchaseOverview(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { saudaId } = req.params;
      const godownId = req.query.godown_id as string | undefined;
      const data = await purchaseSummaryDAO.getKaantaPurchaseOverview(saudaId, godownId);
      return ResponseHandler.success(res, data, 'Kaanta purchase overview retrieved successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Sauda not found') {
        next(new NotFoundError('Sauda not found'));
      } else {
        next(error);
      }
    }
  }

  /** Drill-down: kaantas + lots for one ISP under a sauda (no sauda object in body). */
  async getKaantaPurchaseIspDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { saudaId, ispId } = req.params;
      const godownId = req.query.godown_id as string | undefined;
      const data = await purchaseSummaryDAO.getKaantaPurchaseIspDetail(saudaId, ispId, godownId);
      return ResponseHandler.success(res, data, 'Kaanta and lot details retrieved successfully');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Inward slip pass not found') {
          next(new NotFoundError('Inward slip pass not found'));
        } else if (error.message === 'No kaanta for this inward slip pass under this sauda') {
          next(new NotFoundError(error.message));
        } else {
          next(error);
        }
      } else {
        next(error);
      }
    }
  }
}

export const purchaseSummaryController = new PurchaseSummaryController();

