
import "dotenv/config";
import app from "./app";
import { reconcilePayPalPayouts } from "./lib/reconcilePayouts";

const port = Number(process.env.PORT) || 4000;
const RECONCILE_INTERVAL_MS = 60_000;

let reconciliationRunning = false;

async function runReconciliation(): Promise<void> {
  if (reconciliationRunning) return;

  reconciliationRunning = true;

  try {
    await reconcilePayPalPayouts();
  } catch (error) {
    console.error("PayPal reconciliation job failed:", error);
  } finally {
    reconciliationRunning = false;
  }
}

app.listen(port, "0.0.0.0", () => {
  console.log(`VerifiedWorks API running on port ${port}`);

  // Check existing payouts at startup and then every 60 seconds.
  void runReconciliation();
  setInterval(() => {
    void runReconciliation();
  }, RECONCILE_INTERVAL_MS);
});
