export const REPLENISHMENT_DEFAULT_TREND_WINDOW_DAYS = 30;
export const REPLENISHMENT_DEFAULT_SAFETY_DAYS = 7;

export const REPLENISHMENT_MODES = ['recommend_truck', 'fill_truck'] as const;
export type ReplenishmentMode = (typeof REPLENISHMENT_MODES)[number];

export const REPLENISHMENT_PLAN_STATUSES = ['draft', 'committed', 'cancelled'] as const;
export type ReplenishmentPlanStatus = (typeof REPLENISHMENT_PLAN_STATUSES)[number];

export const KG_PER_TONNE = 1000;
