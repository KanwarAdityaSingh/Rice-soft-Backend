import { CouponBatchDAO } from '../dao/coupon-batch.dao';
import { NotFoundError } from '../utils/errors';
import { buildRedeemUrl } from '../utils/coupon.helpers';

export class CouponExportService {
  constructor(private batchDAO = new CouponBatchDAO()) {}

  async exportBatchCsv(batchId: string): Promise<string> {
    const batch = await this.batchDAO.findById(batchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');

    const { db } = await import('../database/connection');
    const result = await db.query<{ code: string }>(
      `SELECT code FROM coupons WHERE coupon_batch_id = $1 ORDER BY code ASC`,
      [batchId]
    );

    const lines = ['code,redeem_url,face_value_paise,face_value_rupees'];

    for (const row of result.rows) {
      const url = buildRedeemUrl(row.code, batch.redeem_base_url);
      lines.push(`${row.code},${url},${batch.face_value_paise},${batch.face_value_paise / 100}`);
    }

    return lines.join('\n');
  }
}

export const couponExportService = new CouponExportService();
