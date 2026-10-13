
import { Router } from "express";
import prisma from "../config/database";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// Only allow providers that the app explicitly supports.
const ALLOWED_PROVIDERS = ["paypal"] as const;

// GET /wallets/linked
// List the authenticated user's linked wallets.
router.get(
  "/wallets/linked",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const wallets = await prisma.linkedWallet.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          provider: true,
          accountIdentifier: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.json({ wallets });
    } catch (error) {
      console.error("Linked wallet lookup failed:", error);
      res.status(500).json({ detail: "Could not load linked wallets." });
    }
  }
);

// POST /wallets/linked
// Record a wallet account. This does not verify ownership.
router.post(
  "/wallets/linked",
  requireAuth,
  async (req: AuthRequest, res) => {
    const provider =
      typeof req.body?.provider === "string"
        ? req.body.provider.trim().toLowerCase()
        : "";

    const accountIdentifier =
      typeof req.body?.accountIdentifier === "string"
        ? req.body.accountIdentifier.trim()
        : "";

    if (!ALLOWED_PROVIDERS.includes(provider as (typeof ALLOWED_PROVIDERS)[number])) {
      res.status(400).json({
        detail: "Unsupported wallet provider.",
      });
      return;
    }

    if (
      accountIdentifier.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountIdentifier)
    ) {
      res.status(400).json({
        detail: "Enter a valid PayPal email address.",
      });
      return;
    }

    try {
      const existing = await prisma.linkedWallet.findUnique({
        where: {
          userId_provider: {
            userId: req.userId!,
            provider,
          },
        },
      });

      if (existing) {
        res.status(409).json({
          detail: "You already have a linked account for this provider.",
        });
        return;
      }

      const wallet = await prisma.linkedWallet.create({
        data: {
          userId: req.userId!,
          provider,
          accountIdentifier,
          status: "pending",
        },
        select: {
          id: true,
          provider: true,
          accountIdentifier: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.status(201).json({
        wallet,
        detail: "Account recorded. Ownership has not been verified.",
      });
    } catch (error) {
      console.error("Linked wallet creation failed:", error);
      res.status(500).json({
        detail: "Could not link wallet account.",
      });
    }
  }
);

// DELETE /wallets/linked/:id
// Delete only a record owned by the authenticated user.
router.delete(
  "/wallets/linked/:id",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const walletId = req.params.id;

        if (typeof walletId !== "string" || !walletId.trim()) {
        res.status(400).json({
            detail: "A valid linked wallet ID is required.",
        });
        return;
        }

        const result = await prisma.linkedWallet.deleteMany({
        where: {
            id: walletId,
            userId: req.userId!,
        },
    });

      if (result.count === 0) {
        res.status(404).json({
          detail: "Linked wallet not found.",
        });
        return;
      }

      res.json({ detail: "Linked wallet removed." });
    } catch (error) {
      console.error("Linked wallet deletion failed:", error);
      res.status(500).json({
        detail: "Could not remove linked wallet.",
      });
    }
  }
);

export default router;
