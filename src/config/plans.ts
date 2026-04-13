// ─── Plan limits — single source of truth ────────────────────────────────────
// Keep in sync with the subscriptions table defaults in:
//   supabase/migrations/20260413000001_subscriptions_plan_limits.sql
//   supabase/migrations/20260413000002_subscriptions_plan_columns.sql

export interface PlanLimits {
  providers:     number;  // max connected providers (-1 = unlimited)
  activeJobs:    number;  // max active/pending jobs  (-1 = unlimited)
  transferBytes: number;  // monthly transfer quota in bytes
  threads:       number;  // parallel file-processing threads in the worker
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    providers:     3,
    activeJobs:    1,
    transferBytes: 5   * 1024 ** 3,   // 5 GB
    threads:       1,
  },
  pro: {
    providers:     10,
    activeJobs:    10,
    transferBytes: 100 * 1024 ** 3,   // 100 GB
    threads:       4,
  },
  business: {
    providers:     20,
    activeJobs:    -1,                // -1 = unlimited
    transferBytes: 1024 * 1024 ** 3,  // 1 TB
    threads:       8,
  },
  enterprise: {                       // alias — same as business
    providers:     20,
    activeJobs:    -1,
    transferBytes: 1024 * 1024 ** 3,
    threads:       8,
  },
};

export type PlanName = keyof typeof PLAN_LIMITS;
