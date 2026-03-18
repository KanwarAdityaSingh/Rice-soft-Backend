import { Response, NextFunction } from 'express';
import { productRateDAO } from '../dao/product-rate.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { ResponseHandler } from '../utils/response';
import { validate, suggestedRateQuerySchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { NotFoundError, BadRequestError } from '../utils/errors';

export interface SuggestedRateQuery {
  product_id: string;
  packaging_id: string;
}

/**
 * GET /suggested-rate?product_id=...&packaging_id=...
 * Returns the product's suggested sell rate for the given packaging (by holding capacity).
 * Used to pre-fill rate when creating/editing a sales sauda line. Rate is not linked;
 * once saved on the line, it stays fixed.
 */
export class SuggestedRateController {
  async getSuggestedRate(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const query = validate<SuggestedRateQuery>(suggestedRateQuerySchema, req.query);

      const packaging = await packagingDAO.findById(query.packaging_id);
      if (!packaging) {
        throw new NotFoundError('Packaging not found');
      }
      if (packaging.product_id !== query.product_id) {
        throw new BadRequestError('Packaging does not belong to the selected product');
      }

      const rate = await productRateDAO.findByProductAndHoldingCapacity(
        query.product_id,
        packaging.holding_capacity
      );
      if (rate === null) {
        throw new NotFoundError('No rate set for this product and packaging capacity');
      }

      return ResponseHandler.success(res, { rate });
    } catch (error) {
      next(error);
    }
  }
}
