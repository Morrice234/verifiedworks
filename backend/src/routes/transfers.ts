
import { Router } from "express";
import prisma from "../config/database";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const MIN_TRANSFER_CENTS = 1;
const MAX_TRANSFER_CENTS = 100_000_000;

router.post(
  "/wallet/transfer",
  requireAuth,
  async (req: AuthRequest, res) => {
    const senderId = req.userId!;
    const recipientUsername =
      typeof req.body?.recipientUsername === "string"
        ? req.body.recipientUsername.trim()
        : "";
    const amountCents = req.body?.amountCents;
    const idempotencyKey = req.get("Idempotency-Key")?.trim();

    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < MIN_TRANSFER_CENTS ||
      amountCents > MAX_TRANSFER_CENTS
    ) {
      res.status(400).json({
        detail: "Enter a valid transfer amount in cents.",
      });
      return;
    }

    if (!recipientUsername || recipientUsername.length > 50) {
      res.status(400).json({
        detail: "Enter a valid recipient username.",
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
        const existing = await tx.transfer.findUnique({
          where: { idempotencyKey },
        });

        if (existing) {
          if (
            existing.senderId !== senderId ||
            existing.amount !== amountCents
          ) {
            throw new Error("IDEMPOTENCY_CONFLICT");
          }

          return { transfer: existing, repeated: true };
        }

        const recipient = await tx.user.findUnique({
          where: { username: recipientUsername },
          select: { id: true, username: true },
        });

        if (!recipient) {
          throw new Error("RECIPIENT_NOT_FOUND");
        }

        if (recipient.id === senderId) {
          throw new Error("SELF_TRANSFER");
        }

        const balance = await tx.walletLedgerEntry.aggregate({
          where: { userId: senderId },
          _sum: { amount: true },
        });

        if ((balance._sum.amount ?? 0) < amountCents) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        const transfer = await tx.transfer.create({
          data: {
            senderId,
            recipientId: recipient.id,
            amount: amountCents,
            currency: "USD",
            status: "completed",
            idempotencyKey,
          },
        });

        await tx.walletLedgerEntry.createMany({
          data: [
            {
              userId: senderId,
              amount: -amountCents,
              type: "transfer_sent",
              sourceType: "transfer",
              sourceId: transfer.id,
              idempotencyKey: `transfer:${transfer.id}:debit`,
              description: `Transfer to ${recipient.username}`,
            },
            {
              userId: recipient.id,
              amount: amountCents,
              type: "transfer_received",
              sourceType: "transfer",
              sourceId: transfer.id,
              idempotencyKey: `transfer:${transfer.id}:credit`,
              description: "Transfer received",
            },
          ],
        });

        return { transfer, repeated: false };
      });

      res.status(result.repeated ? 200 : 201).json({
        transfer: {
          id: result.transfer.id,
          recipientUsername,
          amountCents: result.transfer.amount,
          currency: result.transfer.currency,
          status: result.transfer.status,
          createdAt: result.transfer.createdAt,
        },
        repeated: result.repeated,
        detail: result.repeated
          ? "Your existing transfer was confirmed."
          : "Transfer completed successfully.",
      });
    } catch (error) {
      if (error instanceof Error) {
        const errors: Record<string, { status: number; detail: string }> = {
          RECIPIENT_NOT_FOUND: {
            status: 404,
            detail: "Recipient account was not found.",
          },
          SELF_TRANSFER: {
            status: 400,
            detail: "You cannot transfer funds to yourself.",
          },
          INSUFFICIENT_BALANCE: {
            status: 400,
            detail: "Insufficient available balance.",
          },
          IDEMPOTENCY_CONFLICT: {
            status: 409,
            detail: "This Idempotency-Key was already used for another transfer.",
          },
        };

        const known = errors[error.message];

        if (known) {
          res.status(known.status).json({ detail: known.detail });
          return;
        }
      }

      console.error("Transfer failed:", error);
      res.status(500).json({
        detail: "Could not complete the transfer.",
      });
    }
  },
);

router.get(
  "/wallet/transfers",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.userId!;

      const transfers = await prisma.transfer.findMany({
        where: {
          OR: [{ senderId: userId }, { recipientId: userId }],
        },
        include: {
          sender: { select: { username: true } },
          recipient: { select: { username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      res.json({
        transfers: transfers.map((item) => ({
          id: item.id,
          senderUsername: item.sender.username,
          recipientUsername: item.recipient.username,
          amountCents: item.amount,
          currency: item.currency,
          status: item.status,
          createdAt: item.createdAt,
          direction: item.senderId === userId ? "sent" : "received",
        })),
      });
    } catch (error) {
      console.error("Transfer history failed:", error);
      res.status(500).json({
        detail: "Could not load transfer history.",
      });
    }
  },
);

export default router;
