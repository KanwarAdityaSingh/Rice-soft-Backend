import { Response, NextFunction } from 'express';
import { purchaseSummaryDAO } from '../dao/purchase-summary.dao';
import { GetSummaryOptions } from '../models/purchase-summary.model';
import { NotFoundError } from '../utils/errors';
import { ResponseHandler } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class PurchaseSummaryController {
  async getSaudaSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { saudaId } = req.params;
      const igstPercentage = req.query.igst_percentage ? parseFloat(req.query.igst_percentage as string) : undefined;

      const options: GetSummaryOptions = {
        igst_percentage: igstPercentage,
      };

      const summary = await purchaseSummaryDAO.getSaudaSummary(saudaId, options);

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
      const igstPercentage = req.query.igst_percentage ? parseFloat(req.query.igst_percentage as string) : undefined;

      const options: GetSummaryOptions = {
        igst_percentage: igstPercentage,
      };

      const summary = await purchaseSummaryDAO.getIspSummary(ispId, options);

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
}

export const purchaseSummaryController = new PurchaseSummaryController();

