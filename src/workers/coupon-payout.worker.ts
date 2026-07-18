import { razorpayPayoutService } from '../services/razorpay-payout.service';
import { RedemptionDAO } from '../dao/redemption.dao';
import { appConfig } from '../config/app.config';

class CouponPayoutWorker {
  private queue = new Set<string>();
  private running = false;
  private interval: NodeJS.Timeout | null = null;

  enqueue(redemptionId: string) {
    if (!appConfig.coupons.payoutEnabled) return;
    this.queue.add(redemptionId);
    void this.processQueue();
  }

  start(intervalMs = appConfig.coupons.payoutWorkerIntervalMs) {
    if (!appConfig.coupons.payoutEnabled) return;
    if (this.interval) return;

    this.interval = setInterval(() => {
      void this.pollPending();
    }, intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async pollPending() {
    if (!appConfig.coupons.payoutEnabled) return;
    const dao = new RedemptionDAO();
    const pending = await dao.findPendingForPayout(20);
    for (const redemption of pending) {
      this.enqueue(redemption.redemption_id);
    }
  }

  private async processQueue() {
    if (this.running) return;
    this.running = true;

    try {
      while (this.queue.size > 0) {
        const [redemptionId] = this.queue;
        this.queue.delete(redemptionId!);
        await razorpayPayoutService.processRedemption(redemptionId!);
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
