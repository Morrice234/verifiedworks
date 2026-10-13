// Card keys are made only by the admin and always belong to an account.
// Users never create, buy, enter or remove keys themselves. Older keys may still
// be linked to a payment from before checkout was removed.
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const MAX_VALID_DAYS = 3650;

/** e.g. VW-9F3A-7B21-C04E */
export function makeCardCode() {
  const hex = randomBytes(6).toString("hex").toUpperCase();
  return `VW-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export type KeyState = "unassigned" | "active" | "expired" | "revoked";

type KeyLike = { userId: string | null; status: string; expiresAt: Date | null };

export function keyState(k: KeyLike, now = Date.now()): KeyState {
  if (k.status !== "active") return "revoked";
  if (!k.userId) return "unassigned";
  if (k.expiresAt && k.expiresAt.getTime() <= now) return "expired";
  return "active";
}

/** Prisma filters matching each state, so lists can be filtered in the database. */
export function whereState(state: KeyState, now = new Date()): Prisma.CardKeyWhereInput {
  switch (state) {
    case "revoked":
      return { status: { not: "active" } };
    case "unassigned":
      return { status: "active", userId: null };
    case "expired":
      return { status: "active", userId: { not: null }, expiresAt: { lte: now } };
    case "active":
      return {
        status: "active",
        userId: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      };
  }
}

/** When access ends if the key is assigned now. Null means lifetime. */
export function expiryFrom(validDays: number, from = new Date()) {
  return validDays > 0 ? new Date(from.getTime() + validDays * 86_400_000) : null;
}

/** Where a key came from: a payment, the free giveaway, a test purchase, or the admin. */
export function keySource(payment: { provider: string } | null | undefined) {
  if (!payment) return "admin";
  if (payment.provider === "paypal") return "paypal";
  if (payment.provider === "free") return "free";
  if (payment.provider === "simulation") return "test";
  return payment.provider;
}
