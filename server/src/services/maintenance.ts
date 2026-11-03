import { expireStalePendingBookings } from "./availability.js";
import { sweepUnattachedUploads } from "./media.js";
import { reconcileExpiredPaymentHolds, type CancelOrderFn } from "./payments.js";

/** Not tied to public reads. One API process runs this timer. */
export const HOLD_MAINTENANCE_INTERVAL_MS = 5 * 60_000;

export async function runHoldMaintenance(deps: { cancelOrder?: CancelOrderFn } = {}) {
  const ids = await expireStalePendingBookings();
  await reconcileExpiredPaymentHolds(deps, ids);
}

export function startBackgroundMaintenance() {
  const timer = setInterval(() => {
    runHoldMaintenance().catch((err) => {
      console.error("[maintenance] hold cleanup failed", err instanceof Error ? err.name : "Error");
    });
    sweepUnattachedUploads().catch((err) => {
      console.error("[maintenance] upload cleanup failed", err instanceof Error ? err.name : "Error");
    });
  }, HOLD_MAINTENANCE_INTERVAL_MS);
  timer.unref();
  return timer;
}
