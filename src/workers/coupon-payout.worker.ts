import { cashfreePayoutService } from '../services/cashfree-payout.service';
import { PayoutAttemptDAO } from '../dao/payout-attempt.dao';
import { RedemptionDAO } from '../dao/redemption.dao';
import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';

class CouponPayoutWorker {
  private queue = new Set<string>();
  private running = false;
  private interval: NodeJS.Timeout | null = null;

  enqueue(redemptionId: string) {
    if (!appConfig.coupons.payoutEnabled || !appConfig.coupons.payoutAuto) return;
    this.queue.add(redemptionId);
    void this.processQueue();
  }

  start(intervalMs = appConfig.coupons.payoutWorkerIntervalMs) {
    if (!appConfig.coupons.payoutEnabled || !appConfig.coupons.payoutAuto) return;
    if (this.interval) return;

    this.interval = setInterval(() => {
      void this.pollPending();
    }, intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.interval = null;
  }

  private async pollPending() {
    if (!appConfig.coupons.payoutEnabled || !appConfig.coupons.payoutAuto) return;
    try {
      const redemptionDAO = new RedemptionDAO();
      const attemptDAO = new PayoutAttemptDAO();

      const pending = await redemptionDAO.findPendingForPayout(20);
      for (const redemption of pending) {
        this.enqueue(redemption.redemption_id);
      }

      // Reconcile in-flight Cashfree transfers (5xx / missed webhooks)
      const initiated = await attemptDAO.findInitiatedForReconcile(20);
      for (const attempt of initiated) {
        this.enqueue(attempt.redemption_id);
      }
    } catch (error) {
      logger.error('Coupon payout worker poll failed', { error });
    }
  }

  private async processQueue() {
    if (this.running) return;
    this.running = true;

    try {
      while (this.queue.size > 0) {
        const [redemptionId] = this.queue;
        this.queue.delete(redemptionId!);
        try {
          await cashfreePayoutService.processRedemption(redemptionId!);
        } catch (error) {
          // Never let a single payout failure crash the API process
          logger.error('Coupon payout processing failed', { redemptionId, error });
        }
      }
    } finally {
      this.running = false;
      if (this.queue.size > 0) {
        void this.processQueue();
      }
    }
  }
}

export const couponPayoutWorker = new CouponPayoutWorker();
