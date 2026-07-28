import { CouponBatchDAO } from '../dao/coupon-batch.dao';
import { ConflictError, NotFoundError } from '../utils/errors';
import { buildRedeemUrl } from '../utils/coupon.helpers';
import { COUPON_BATCH_LOCKED_MESSAGE } from './coupon-batch.service';

export class CouponExportService {
  constructor(private batchDAO = new CouponBatchDAO()) {}

  async exportBatchCsv(batchId: string): Promise<{ csv: string; batchCode: string }> {
    const batch = await this.batchDAO.findById(batchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');
    if (batch.is_locked) {
      throw new ConflictError(COUPON_BATCH_LOCKED_MESSAGE);
    }

    const { db } = await import('../database/connection');
    const result = await db.query<{
      serial_number: string;
      batch_sequence: number;
      code: string;
    }>(
      `SELECT serial_number, batch_sequence, code
       FROM coupons
       WHERE coupon_batch_id = $1
       ORDER BY batch_sequence ASC`,
      [batchId]
    );

    const lines = [
      'serial_number,batch_sequence,code,redeem_url,face_value_paise,face_value_rupees',
    ];

    for (const row of result.rows) {
      const url = buildRedeemUrl(row.code, batch.redeem_base_url);
      lines.push(
        `${row.serial_number},${row.batch_sequence},${row.code},${url},${batch.face_value_paise},${batch.face_value_paise / 100}`
      );
    }

    return { csv: lines.join('\n'), batchCode: batch.batch_code };
  }
}

export const couponExportService = new CouponExportService();
