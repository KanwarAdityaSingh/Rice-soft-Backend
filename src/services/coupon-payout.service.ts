import { RedemptionDAO } from '../dao/redemption.dao';
import { MarkRedemptionPaidDTO } from '../models/coupon.model';
import { BadRequestError, NotFoundError } from '../utils/errors';

export type BulkMarkPaidItem = {
  redemption_id: string;
  payment_reference: string;
};

export type BulkMarkPaidResult = {
  succeeded: Array<{
    redemptionId: string;
    publicRef: string;
    payoutStatus: string;
    totalAmountPaise: number;
  }>;
  failed: Array<{ redemptionId: string; error: string }>;
};

export class CouponPayoutService {
  constructor(private redemptionDAO = new RedemptionDAO()) {}

  async markPaid(redemptionId: string, data: MarkRedemptionPaidDTO) {
    const redemption = await this.redemptionDAO.findById(redemptionId);
    if (!redemption) throw new NotFoundError('Redemption not found');
    if (redemption.payout_status === 'paid') {
      throw new BadRequestError('Redemption is already paid');
    }

    const updated = await this.redemptionDAO.markPaid(redemptionId, {
      payment_reference: data.payment_reference,
      paid_via: 'manual',
      paid_by: data.paid_by ?? null,
    });

    if (!updated) throw new BadRequestError('Failed to mark redemption as paid');

    return this.toPaidResponse(updated);
  }

  async bulkMarkPaid(
    items: BulkMarkPaidItem[],
    paidBy?: string
  ): Promise<BulkMarkPaidResult> {
    const succeeded: BulkMarkPaidResult['succeeded'] = [];
    const failed: BulkMarkPaidResult['failed'] = [];

    for (const item of items) {
      try {
        const result = await this.markPaid(item.redemption_id, {
          payment_reference: item.payment_reference,
          paid_by: paidBy,
        });
        succeeded.push({
          redemptionId: result.redemptionId,
          publicRef: result.publicRef,
          payoutStatus: result.payoutStatus,
          totalAmountPaise: result.totalAmountPaise,
        });
      } catch (error) {
        failed.push({
          redemptionId: item.redemption_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { succeeded, failed };
  }

  async unmarkPaid(redemptionId: string, _reason?: string) {
    const redemption = await this.redemptionDAO.findById(redemptionId);
    if (!redemption) throw new NotFoundError('Redemption not found');
    if (redemption.payout_status !== 'paid') {
      throw new BadRequestError('Redemption is not paid');
    }

    const updated = await this.redemptionDAO.unmarkPaid(redemptionId);
    if (!updated) throw new BadRequestError('Failed to undo paid status');

    return {
      redemptionId: updated.redemption_id,
      publicRef: updated.public_ref,
      payoutStatus: updated.payout_status,
      previousPaidVia: redemption.paid_via,
      previousPaymentReference: redemption.payment_reference,
      previousPaidAt: redemption.paid_at,
    };
  }

  private toPaidResponse(updated: {
    redemption_id: string;
    public_ref: string;
    payout_status: string;
    paid_via: string | null;
    payment_reference: string | null;
    paid_at: Date | null;
    total_amount_paise: number;
  }) {
    return {
      redemptionId: updated.redemption_id,
      publicRef: updated.public_ref,
      payoutStatus: updated.payout_status,
      paidVia: updated.paid_via,
      paymentReference: updated.payment_reference,
      paidAt: updated.paid_at,
      totalAmountPaise: updated.total_amount_paise,
    };
  }
}

export const couponPayoutService = new CouponPayoutService();
