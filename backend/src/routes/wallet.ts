import { Router } from "express";
import prisma from "../config/database";
import { requireAuth, AuthRequest } from "../middleware/auth";
import {
  submitPayPalPayout,
  getPayPalPayoutStatus,
} from "../lib/paypalPayouts";

const router = Router();
const MIN_WITHDRAWAL_CENTS = 100;

// GET /wallet — current balance and recent withdrawal requests
router.get("/wallet", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const [ledger, withdrawals] = await Promise.all([
      prisma.walletLedgerEntry.aggregate({
        where: { userId },
        _sum: { amount: true },
      }),
      prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          amount: true,
          currency: true,
          provider: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    
    res.json({
      currency: "USD",
      balanceCents: ledger._sum.amount ?? 0,
      minimumWithdrawalCents: MIN_WITHDRAWAL_CENTS,
      withdrawals: withdrawals.map((item) => ({
        id: item.id,
        amountCents: item.amount,
        currency: item.currency,
        provider: item.provider,
        status: item.status,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    console.error("Wallet lookup failed:", error);
    res.status(500).json({ detail: "Could not load wallet" });
  }
});

// GET /wallet/transactions — authenticated user's ledger history
router.get(
  "/wallet/transactions",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const entries = await prisma.walletLedgerEntry.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      res.json({
        transactions: entries,
      });
    } catch (error) {
      console.error("Wallet history failed:", error);
      res.status(500).json({
        detail: "Could not load wallet transactions",
      });
    }
  }
);

// GET /wallet/withdrawals/:id/status
// Checks PayPal status without submitting another payout.
router.get(
  "/wallet/withdrawals/:id/status",
  requireAuth,
  async (req: AuthRequest, res) => {
    const userId = req.userId!;
    const withdrawalId = req.params.id;

    if (typeof withdrawalId !== "string") {
      res.status(400).json({
        detail: "Invalid withdrawal ID.",
      });
      return;
    }

    try {
      const withdrawal = await prisma.withdrawal.findFirst({
        where: {
          id: withdrawalId,
          userId,
          provider: "paypal",
        },
      });

      if (!withdrawal) {
        res.status(404).json({
          detail: "Withdrawal not found.",
        });
        return;
      }

      if (
        withdrawal.status === "completed" ||
        withdrawal.status === "failed"
      ) {
        res.json({
          withdrawalId: withdrawal.id,
          status: withdrawal.status,
          detail: "This withdrawal is already in a final state.",
        });
        return;
      }

      if (!withdrawal.providerPayoutId) {
        res.status(409).json({
          withdrawalId: withdrawal.id,
          status: withdrawal.status,
          detail:
            "No PayPal batch ID is recorded. Manual reconciliation is required before changing this withdrawal.",
        });
        return;
      }

      const result = await getPayPalPayoutStatus(
        withdrawal.providerPayoutId,
      );

      if (result.status === "unknown") {
        res.status(502).json({
          withdrawalId: withdrawal.id,
          status: withdrawal.status,
          detail: result.detail,
        });
        return;
      }

      const confirmedSuccess = result.itemStatus === "SUCCESS";
      const confirmedFailure =
        result.itemStatus === "FAILED" ||
        result.batchStatus === "DENIED";

      if (confirmedSuccess) {
        await prisma.withdrawal.updateMany({
          where: {
            id: withdrawal.id,
            userId,
            providerPayoutId: withdrawal.providerPayoutId,
            status: "processing",
          },
          data: {
            status: "completed",
            processedAt: new Date(),
            failureReason: null,
          },
        });
      } else if (confirmedFailure) {
        await prisma.$transaction(async (tx) => {
          // Only one concurrent status check can apply the refund.
          const changed = await tx.withdrawal.updateMany({
            where: {
              id: withdrawal.id,
              userId,
              providerPayoutId: withdrawal.providerPayoutId,
              status: "processing",
            },
            data: {
              status: "failed",
              failureReason:
                "PayPal confirmed that the payout failed.",
              processedAt: new Date(),
            },
          });

          if (changed.count === 1) {
            await tx.walletLedgerEntry.create({
              data: {
                userId,
                withdrawalId: withdrawal.id,
                amount: withdrawal.amount,
                type: "withdrawal_refund",
                sourceType: "withdrawal",
                sourceId: withdrawal.id,
                idempotencyKey:
                  `withdrawal:${withdrawal.id}:refund`,
                description:
                  "Refund for confirmed failed PayPal payout",
              },
            });
          }
        });
      }

      const updated = await prisma.withdrawal.findFirst({
        where: {
          id: withdrawal.id,
          userId,
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          providerPayoutId: true,
          createdAt: true,
          processedAt: true,
        },
      });

      res.json({
        withdrawal: updated,
        paypal: {
          batchStatus: result.batchStatus,
          itemStatus: result.itemStatus,
        },
        detail: confirmedSuccess
          ? "PayPal reports the recipient transaction succeeded."
          : confirmedFailure
            ? "PayPal reports a failed payout. Check the withdrawal status to confirm whether the refund was applied."
            : "The payout is not confirmed as successful or failed. Funds remain reserved.",
      });
    } catch (error) {
      console.error("PayPal payout status check failed:", error);
      res.status(500).json({
        detail: "Could not check payout status.",
      });
    }
  },
);

// POST /wallet/withdraw
// Reserves funds; does NOT send money to PayPal yet.
router.post(
  "/wallet/withdraw",
  requireAuth,
  async (req: AuthRequest, res) => {
    const userId = req.userId!;
    const amountCents = req.body?.amountCents;
    const destination =
      typeof req.body?.destination === "string"
        ? req.body.destination.trim()
        : "";
    const provider = req.body?.provider ?? "paypal";
    const idempotencyKey = req.get("Idempotency-Key")?.trim();

    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < MIN_WITHDRAWAL_CENTS
    ) {
      res.status(400).json({
        detail: "Minimum withdrawal is $1.00 (100 cents).",
      });
      return;
    }

    if (provider !== "paypal") {
      res.status(400).json({
        detail: "Only PayPal withdrawals are currently supported.",
      });
      return;
    }

    if (
      destination.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)
    ) {
      res.status(400).json({
        detail: "Enter a valid PayPal email address.",
      });
      return;
    }

    if (
      !idempotencyKey ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 128
    ) {
      res.status(400).json({
        detail: "A unique Idempotency-Key header is required.",
      });
      return;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Repeated requests with the same key must not reserve twice.
        const existing = await tx.withdrawal.findUnique({
          where: { idempotencyKey },
        });

        if (existing) {
          if (
            existing.userId !== userId ||
            existing.amount !== amountCents ||
            existing.destination !== destination ||
            existing.provider !== provider
          ) {
            throw new Error("IDEMPOTENCY_CONFLICT");
          }

          return { withdrawal: existing, repeated: true };
        }

        const aggregate = await tx.walletLedgerEntry.aggregate({
          where: { userId },
          _sum: { amount: true },
        });

        const balanceCents = aggregate._sum.amount ?? 0;

        if (balanceCents < amountCents) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        const withdrawal = await tx.withdrawal.create({
          data: {
            userId,
            provider,
            destination,
            amount: amountCents,
            currency: "USD",
            status: "pending",
            idempotencyKey,
          },
        });

        await tx.walletLedgerEntry.create({
          data: {
            userId,
            withdrawalId: withdrawal.id,
            amount: -amountCents,
            type: "withdrawal_reserve",
            sourceType: "withdrawal",
            sourceId: withdrawal.id,
            idempotencyKey: `withdrawal:${withdrawal.id}:reserve`,
            description: "Funds reserved for withdrawal",
          },
        });

        return { withdrawal, repeated: false };
      });

        let withdrawal = result.withdrawal;
        let detail = result.repeated
          ? "Existing withdrawal request returned. No new payout was submitted."
          : "Withdrawal created.";

        if (!result.repeated) {
          const payout = await submitPayPalPayout({
            withdrawalId: withdrawal.id,
            destination: withdrawal.destination,
            amountCents: withdrawal.amount,
          });

          if (payout.status === "accepted") {
            withdrawal = await prisma.withdrawal.update({
              where: { id: withdrawal.id },
              data: {
                status: "processing",
                providerPayoutId: payout.batchId,
              },
            });

            detail =
              `PayPal accepted the payout batch. PayPal status: ${payout.paypalStatus}. The recipient's payment is not yet confirmed.`;
          } else if (payout.status === "unknown") {
            withdrawal = await prisma.withdrawal.update({
              where: { id: withdrawal.id },
              data: {
                status: "payout_unknown",
                failureReason: payout.detail,
              },
            });

            detail =
              "PayPal's response is uncertain. Funds remain reserved. Reconcile the payout before retrying.";
          } else {
            // Refund only when PayPal definitively rejected the payout.
            withdrawal = await prisma.$transaction(async (tx) => {
              const changed = await tx.withdrawal.updateMany({
                where: {
                  id: withdrawal.id,
                  status: "pending",
                  providerPayoutId: null,
                },
                data: {
                  status: "failed",
                  failureReason: payout.detail,
                  processedAt: new Date(),
                },
              });

              if (changed.count === 1) {
                await tx.walletLedgerEntry.create({
                  data: {
                    userId,
                    withdrawalId: withdrawal.id,
                    amount: withdrawal.amount,
                    type: "withdrawal_refund",
                    sourceType: "withdrawal",
                    sourceId: withdrawal.id,
                    idempotencyKey: `withdrawal:${withdrawal.id}:refund`,
                    description: "Refund for definitively rejected PayPal payout",
                  },
                });
              }

              const current = await tx.withdrawal.findUniqueOrThrow({
                where: { id: withdrawal.id },
              });

              return current;
            });

            detail =
              withdrawal.status === "failed"
                ? "PayPal rejected the payout. The reserved balance has been restored."
                : "The withdrawal status changed before the refund could be applied. Check the withdrawal record.";
          }
        }

        res.status(result.repeated ? 200 : 201).json({
          withdrawal: {
            id: withdrawal.id,
            amountCents: withdrawal.amount,
            currency: withdrawal.currency,
            status: withdrawal.status,
            createdAt: withdrawal.createdAt,
          },
          repeated: result.repeated,
          detail,
        });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "INSUFFICIENT_BALANCE") {
          res.status(400).json({
            detail: "Insufficient available balance.",
          });
          return;
        }

        if (error.message === "IDEMPOTENCY_CONFLICT") {
          res.status(409).json({
            detail: "This Idempotency-Key was already used for another request.",
          });
          return;
        }
      }

      console.error("Withdrawal request failed:", error);
      res.status(500).json({
        detail: "Could not create withdrawal request.",
      });
    }
  }
);

export default router;
