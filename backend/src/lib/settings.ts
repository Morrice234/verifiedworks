// Settings the admin manages from the panel, stored in the database.
// Secrets are encrypted with AES-256-GCM. The key is derived from JWT_SECRET,
// so if JWT_SECRET ever changes, the PayPal secret has to be entered again.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import prisma from "../config/database";

export type PayPalMode = "sandbox" | "live";
export type PayPalConfig = { clientId: string; clientSecret: string; mode: PayPalMode; source: "admin" | "env" };

const KEYS = {
  clientId: "paypal.clientId",
  clientSecret: "paypal.clientSecret",
  mode: "paypal.mode",
} as const;

function encryptionKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return createHash("sha256").update(`verifiedworks-settings:${secret}`).digest();
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

function decrypt(stored: string): string | null {
  try {
    const [version, iv, tag, data] = stored.split(":");
    if (version !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key (JWT_SECRET changed) or corrupted value
  }
}

export const paypalBaseUrl = (mode: PayPalMode) =>
  mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

let cache: PayPalConfig | null | undefined;

/** Credentials saved in the admin panel win. The .env values are only a fallback. */
export async function getPayPalConfig(): Promise<PayPalConfig | null> {
  if (cache !== undefined) return cache;

  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;

  const clientId = get(KEYS.clientId);
  const storedSecret = get(KEYS.clientSecret);
  const clientSecret = storedSecret ? decrypt(storedSecret) : null;
  const mode: PayPalMode = get(KEYS.mode) === "live" ? "live" : "sandbox";

  if (clientId && clientSecret) {
    cache = { clientId, clientSecret, mode, source: "admin" };
  } else if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    cache = {
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      mode: process.env.PAYPAL_MODE === "live" ? "live" : "sandbox",
      source: "env",
    };
  } else {
    cache = null;
  }
  return cache;
}

/** Saves PayPal settings. Leave clientSecret empty to keep the one already stored. */
export async function savePayPalConfig(input: { clientId: string; clientSecret?: string; mode: PayPalMode }) {
  const writes = [
    prisma.setting.upsert({
      where: { key: KEYS.clientId },
      update: { value: input.clientId },
      create: { key: KEYS.clientId, value: input.clientId },
    }),
    prisma.setting.upsert({
      where: { key: KEYS.mode },
      update: { value: input.mode },
      create: { key: KEYS.mode, value: input.mode },
    }),
  ];
  if (input.clientSecret) {
    const value = encrypt(input.clientSecret);
    writes.push(
      prisma.setting.upsert({
        where: { key: KEYS.clientSecret },
        update: { value },
        create: { key: KEYS.clientSecret, value },
      }),
    );
  }
  await prisma.$transaction(writes);
  cache = undefined;
}

/** True when a secret is stored but can no longer be decrypted (JWT_SECRET changed). */
export async function storedSecretUnreadable() {
  const row = await prisma.setting.findUnique({ where: { key: KEYS.clientSecret } });
  return !!row && decrypt(row.value) === null;
}

/** Asks PayPal for an access token. Throws with PayPal's reason when the credentials are wrong. */
export async function fetchPayPalToken(cfg: { clientId: string; clientSecret: string; mode: PayPalMode }) {
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const response = await fetch(`${paypalBaseUrl(cfg.mode)}/v1/oauth2/token`, {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const reason = data.error_description || data.error || `HTTP ${response.status}`;
    throw new Error(`PayPal rejected the credentials: ${reason}`);
  }
  return data.access_token as string;
}

export const mask = (value: string) => (value.length <= 4 ? "••••" : `••••${value.slice(-4)}`);

/** 999 -> "9.99", the format PayPal expects */
export const centsToAmount = (cents: number) => (cents / 100).toFixed(2);
