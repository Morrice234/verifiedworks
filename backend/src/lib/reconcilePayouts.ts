
import prisma from "../config/database";
import { getPayPalPayoutStatus } from "./paypalPayouts";

export async function reconcilePayPalPayouts(): Promise<void> {
  const withdrawals = await prisma.withdrawal.findMany({
    where: {
      provider: "paypal",
      status: { in: ["processing", "payout_unknown"] },
      providerPayoutId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  for (const withdrawal of withdrawals) {
    const batchId = withdrawal.providerPayoutId;

    if (!batchId) continue;

    try {
      const result = await getPayPalPayoutStatus(batchId);

      if (result.status !== "checked") {
        console.warn(
          `Could not reconcile withdrawal ${withdrawal.id}: ${result.detail}`,
        );
        continue;
      }

      const eligibleStatuses = ["processing", "payout_unknown"];

      if (result.itemStatus === "SUCCESS") {
        await prisma.withdrawal.updateMany({
          where: {
            id: withdrawal.id,
            status: { in: eligibleStatuses },
            providerPayoutId: batchId,
          },
          data: {
            status: "completed",
            processedAt: new Date(),
            failureReason: null,
          },
        });

        continue;
      }

      const confirmedFailure =
        result.itemStatus === "FAILED" ||
        result.batchStatus === "DENIED";

      if (!confirmedFailure) continue;

      await prisma.$transaction(async (tx) => {
        const changed = await tx.withdrawal.updateMany({
          where: {
            id: withdrawal.id,
            status: { in: eligibleStatuses },
            providerPayoutId: batchId,
          },
          data: {
            status: "failed",
            failureReason: "PayPal confirmed the payout failed.",
            processedAt: new Date(),
          },
        });

        if (changed.count !== 1) return;

        await tx.walletLedgerEntry.create({
          data: {
            userId: withdrawal.userId,
            withdrawalId: withdrawal.id,
            amount: withdrawal.amount,
            type: "withdrawal_refund",
            sourceType: "withdrawal",
            sourceId: withdrawal.id,
            idempotencyKey: `withdrawal:${withdrawal.id}:refund`,
            description: "Refund for confirmed failed PayPal payout",
          },
        });
      });
    } catch (error) {
      console.error(
        `Reconciliation failed for withdrawal ${withdrawal.id}:`,
        error,
      );
    }
  }
}
