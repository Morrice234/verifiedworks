import type { Response, NextFunction } from "express";
import prisma from "../config/database";
import type { AuthRequest } from "./auth";

/** True when the user owns an active key that hasn't expired (lifetime keys have no expiry). */
export async function hasActiveKey(userId: string) {
  const key = await prisma.cardKey.findFirst({
    where: {
      userId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return !!key;
}

/** Use after requireAuth. Blocks the lab until the admin has given the account a key. */
export async function requireActiveKey(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (await hasActiveKey(req.userId!)) {
      next();
      return;
    }
    res.status(402).json({ detail: "Your account doesn't have access yet. The admin needs to give you a key.", code: "KEY_REQUIRED" });
  } catch (error) {
    console.error("Access check failed:", error);
    res.status(500).json({ detail: "Could not check your access" });
  }
}
