// Admin panel: a web page at /admin plus its JSON API at /admin/api.
import path from "node:path";
import express, { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import prisma from "../config/database";
import {
  fetchPayPalToken,
  getPayPalConfig,
  mask,
  savePayPalConfig,
  storedSecretUnreadable,
  type PayPalMode,
} from "../lib/settings";
import { sendAccessEmail } from "../lib/mailer";
import { MAX_VALID_DAYS, expiryFrom, keySource, keyState, makeCardCode, whereState, type KeyState } from "../lib/cardKeys";

const router = Router();

type AdminRequest = Request & { adminId?: string };

// Same folder from src/routes and dist/routes: backend/admin
const PANEL_DIR = path.join(__dirname, "..", "..", "admin");

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

function makeAdminToken(adminId: string) {
  return jwt.sign({}, jwtSecret(), { subject: adminId, audience: "admin", expiresIn: "12h" });
}

function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ detail: "Please sign in" });
    return;
  }
  try {
    const payload = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"], audience: "admin" }) as jwt.JwtPayload;
    if (typeof payload.sub !== "string") throw new Error("bad token");
    req.adminId = payload.sub;
    next();
  } catch {
    res.status(401).json({ detail: "Your session expired. Please sign in again." });
  }
}

function isLocalRequest(req: Request) {
  const ip = req.socket.remoteAddress ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

// Simple brute-force guard for the login form: 10 failed tries per IP per 15 minutes
const failures = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;

function tooManyAttempts(ip: string) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() > f.until) {
    failures.delete(ip);
    return false;
  }
  return f.count >= 10;
}

function recordFailure(ip: string) {
  const f = failures.get(ip);
  if (!f || Date.now() > f.until) failures.set(ip, { count: 1, until: Date.now() + WINDOW_MS });
  else f.count++;
}

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

// The panel itself (HTML, CSS, JS)
router.use("/admin", express.static(PANEL_DIR, { index: "index.html" }));

const api = Router();
router.use("/admin/api", api);

// Has an admin account been created yet?
api.get("/setup-status", async (req, res) => {
  const count = await prisma.admin.count();
  res.json({ needsSetup: count === 0, setupAllowedHere: isLocalRequest(req) });
});

// First-run setup. Only possible from the server's own machine, so nobody on the
// network can claim the admin account before you do.
api.post("/setup", async (req, res) => {
  try {
    if (!isLocalRequest(req)) {
      res.status(403).json({ detail: "Create the admin account from the server itself: open http://localhost:4000/admin on that PC." });
      return;
    }
    if ((await prisma.admin.count()) > 0) {
      res.status(409).json({ detail: "An admin account already exists. Sign in instead." });
      return;
    }
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      res.status(400).json({ detail: "Username must be 3 to 32 letters, numbers, dots, dashes or underscores." });
      return;
    }
    if (typeof password !== "string" || password.length < 10) {
      res.status(400).json({ detail: "Use a password of at least 10 characters." });
      return;
    }
    const admin = await prisma.admin.create({
      data: { username, passwordHash: await bcrypt.hash(password, 12) },
    });
    res.status(201).json({ token: makeAdminToken(admin.id), username: admin.username });
  } catch (error) {
    console.error("Admin setup failed:", error);
    res.status(500).json({ detail: "Could not create the admin account" });
  }
});

api.post("/login", async (req, res) => {
  const ip = req.socket.remoteAddress ?? "unknown";
  try {
    if (tooManyAttempts(ip)) {
      res.status(429).json({ detail: "Too many failed attempts. Try again in 15 minutes." });
      return;
    }
    const { username, password } = req.body ?? {};
    const admin =
      typeof username === "string" ? await prisma.admin.findUnique({ where: { username } }) : null;
    if (!admin || typeof password !== "string" || !(await bcrypt.compare(password, admin.passwordHash))) {
      recordFailure(ip);
      res.status(401).json({ detail: "Wrong username or password" });
      return;
    }
    failures.delete(ip);
    res.json({ token: makeAdminToken(admin.id), username: admin.username });
  } catch (error) {
    console.error("Admin login failed:", error);
    res.status(500).json({ detail: "Could not sign in" });
  }
});

api.get("/me", requireAdmin, async (req: AdminRequest, res) => {
  const admin = await prisma.admin.findUnique({ where: { id: req.adminId! } });
  if (!admin) {
    res.status(401).json({ detail: "Please sign in" });
    return;
  }
  res.json({ username: admin.username });
});

api.post("/password", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    const admin = await prisma.admin.findUnique({ where: { id: req.adminId! } });
    if (!admin || typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, admin.passwordHash))) {
      res.status(400).json({ detail: "Your current password is wrong" });
      return;
    }
    if (typeof newPassword !== "string" || newPassword.length < 10) {
      res.status(400).json({ detail: "Use a new password of at least 10 characters." });
      return;
    }
    await prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("Admin password change failed:", error);
    res.status(500).json({ detail: "Could not change the password" });
  }
});

// Users and keys at a glance
api.get("/summary", requireAdmin, async (_req, res) => {
  try {
    const now = Date.now();
    const days = (n: number) => new Date(now - n * 86_400_000);
    const activeKey = whereState("active");

    const [
      totalUsers,
      usersLast7,
      usersLast30,
      accessUsers,
      unassignedKeys,
      keysGiven30,
      waitingCount,
      waiting,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: days(7) } } }),
      prisma.user.count({ where: { createdAt: { gte: days(30) } } }),
      prisma.user.count({ where: { cardKeys: { some: activeKey } } }),
      prisma.cardKey.count({ where: whereState("unassigned") }),
      prisma.cardKey.count({ where: { assignedAt: { gte: days(30) } } }),
      prisma.user.count({ where: { cardKeys: { none: activeKey } } }),
      prisma.user.findMany({
        where: { cardKeys: { none: activeKey } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { username: true, email: true, createdAt: true },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          username: true,
          email: true,
          createdAt: true,
          cardKeys: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { userId: true, status: true, expiresAt: true, payment: { select: { provider: true } } },
          },
        },
      }),
    ]);

    res.json({
      users: {
        total: totalUsers,
        last7Days: usersLast7,
        last30Days: usersLast30,
        withAccess: accessUsers,
        waiting: waitingCount,
      },
      keys: { unassigned: unassignedKeys, givenLast30Days: keysGiven30 },
      waiting: waiting.map((u) => ({ username: u.username, email: u.email, joinedAt: u.createdAt.toISOString() })),
      recentUsers: recentUsers.map((u) => {
        const active = u.cardKeys.find((k) => keyState(k) === "active");
        const latest = active ?? u.cardKeys[0];
        return {
          username: u.username,
          email: u.email,
          joinedAt: u.createdAt.toISOString(),
          access: active ? "active" : latest ? keyState(latest) : "none",
          source: latest ? keySource(latest.payment) : null,
        };
      }),
    });
  } catch (error) {
    console.error("Admin summary failed:", error);
    res.status(500).json({ detail: "Could not load the summary" });
  }
});

// PayPal settings. The secret itself is never sent back to the browser.
api.get("/paypal", requireAdmin, async (_req, res) => {
  try {
    const cfg = await getPayPalConfig();
    res.json({
      configured: !!cfg,
      source: cfg?.source ?? null,
      clientId: cfg?.source === "admin" ? cfg.clientId : "",
      clientIdHint: cfg ? mask(cfg.clientId) : null,
      secretHint: cfg ? mask(cfg.clientSecret) : null,
      mode: cfg?.mode ?? "sandbox",
      secretUnreadable: await storedSecretUnreadable(),
    });
  } catch (error) {
    console.error("Load PayPal settings failed:", error);
    res.status(500).json({ detail: "Could not load PayPal settings" });
  }
});

function readPayPalInput(body: any) {
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret = typeof body?.clientSecret === "string" ? body.clientSecret.trim() : "";
  const mode: PayPalMode = body?.mode === "live" ? "live" : "sandbox";
  return { clientId, clientSecret, mode };
}

// Checks the credentials with PayPal, then saves them. Nothing is saved if PayPal says no.
api.put("/paypal", requireAdmin, async (req, res) => {
  try {
    const input = readPayPalInput(req.body);
    if (!input.clientId) {
      res.status(400).json({ detail: "Enter the Client ID" });
      return;
    }

    // Blank secret = keep the stored one, but only if it belongs to admin-saved settings
    let secretToTest = input.clientSecret;
    if (!secretToTest) {
      const current = await getPayPalConfig();
      if (current?.source !== "admin") {
        res.status(400).json({ detail: "Enter the Secret" });
        return;
      }
      secretToTest = current.clientSecret;
    }

    try {
      await fetchPayPalToken({ clientId: input.clientId, clientSecret: secretToTest, mode: input.mode });
    } catch (error) {
      res.status(400).json({ detail: error instanceof Error ? error.message : "PayPal rejected the credentials" });
      return;
    }

    await savePayPalConfig({ clientId: input.clientId, clientSecret: input.clientSecret || undefined, mode: input.mode });
    res.json({ ok: true, mode: input.mode });
  } catch (error) {
    console.error("Save PayPal settings failed:", error);
    res.status(500).json({ detail: "Could not save PayPal settings" });
  }
});

/**
 * Record an administrator-approved earning.
 * POST /admin/api/earnings/credit
 *
 * This records an accounting credit only; it does not send money.
 */
api.post("/earnings/credit", requireAdmin, async (req, res) => {
  try {
    const userId =
      typeof req.body?.userId === "string"
        ? req.body.userId.trim()
        : "";

    const sourceId =
      typeof req.body?.sourceId === "string"
        ? req.body.sourceId.trim()
        : "";

    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim()
        : "";

    const amountCents = req.body?.amountCents;

    if (!userId || userId.length > 128) {
      res.status(400).json({ detail: "A valid user ID is required." });
      return;
    }

    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents > 100_000_000
    ) {
      res.status(400).json({
        detail: "Amount must be a positive integer number of cents.",
      });
      return;
    }

    if (
      !sourceId ||
      sourceId.length > 100 ||
      !/^[A-Za-z0-9._:-]+$/.test(sourceId)
    ) {
      res.status(400).json({
        detail: "A valid completed-work reference is required.",
      });
      return;
    }

    if (description.length > 250) {
      res.status(400).json({
        detail: "Description must be 250 characters or fewer.",
      });
      return;
    }

    // A stable key prevents the same work reference being credited twice
    // through this endpoint, even if an administrator retries the request.
    const idempotencyKey = `earning:${sourceId}`;

    const existing = await prisma.walletLedgerEntry.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      if (
        existing.userId === userId &&
        existing.amount === amountCents &&
        existing.sourceType === "verified_work" &&
        existing.sourceId === sourceId
      ) {
        res.json({
          credited: false,
          repeated: true,
          entryId: existing.id,
          detail: "This work reference has already been credited.",
        });
        return;
      }

      res.status(409).json({
        detail: "This work reference has already been used.",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      res.status(404).json({ detail: "User not found." });
      return;
    }

    const entry = await prisma.walletLedgerEntry.create({
      data: {
        userId,
        amount: amountCents,
        type: "earning_credit",
        sourceType: "verified_work",
        sourceId,
        idempotencyKey,
        description: description || "Administrator-approved completed work",
      },
    });

    res.status(201).json({
      credited: true,
      entryId: entry.id,
      amountCents: entry.amount,
      currency: "USD",
      detail: "Approved earning recorded in the wallet ledger.",
    });
  } catch (error) {
    // Handle concurrent retries that race to create the same unique key.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        detail: "This work reference has already been processed.",
      });
      return;
    }

    console.error("Approved earning credit failed:", error);
    res.status(500).json({
      detail: "Could not record the approved earning.",
    });
  }
});

const PAGE_SIZE = 25;

function pageOf(req: Request) {
  const n = Number(req.query.page);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

function textQuery(req: Request) {
  return typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
}

/** Finds an account by username or email, as typed in the panel. */
async function findUser(identifier: unknown) {
  const value = typeof identifier === "string" ? identifier.trim() : "";
  if (!value) return null;
  return (
    (await prisma.user.findUnique({ where: { username: value } })) ??
    (await prisma.user.findUnique({ where: { email: value.toLowerCase() } }))
  );
}

async function userHasActiveKey(userId: string, exceptKeyId?: string) {
  const key = await prisma.cardKey.findFirst({
    where: { AND: [{ userId }, whereState("active"), exceptKeyId ? { id: { not: exceptKeyId } } : {}] },
    select: { code: true },
  });
  return key;
}

/** Lets the user know their account is unlocked. A failed email never undoes the key. */
async function emailAccess(key: { code: string; expiresAt: Date | null; user: { username: string; email: string } | null }) {
  if (!key.user) return null;
  try {
    const result = await sendAccessEmail({ to: key.user.email, username: key.user.username, code: key.code, expiresAt: key.expiresAt });
    return result.delivered ? "sent" : "simulated";
  } catch (error) {
    console.error("Access email failed:", error);
    return "failed";
  }
}

const KEY_STATES: KeyState[] = ["unassigned", "active", "expired", "revoked"];

const keyInclude = {
  user: { select: { id: true, username: true, email: true } },
  payment: { select: { provider: true } },
} satisfies Prisma.CardKeyInclude;

type KeyWithRelations = Prisma.CardKeyGetPayload<{ include: typeof keyInclude }>;

function keyRow(k: KeyWithRelations) {
  const state = keyState(k);
  return {
    id: k.id,
    code: k.code,
    state,
    source: keySource(k.payment),
    validDays: k.validDays,
    lifetime: k.userId ? !k.expiresAt : k.validDays === 0,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    daysLeft:
      state === "active" && k.expiresAt ? Math.max(0, Math.ceil((k.expiresAt.getTime() - Date.now()) / 86_400_000)) : null,
    assignedAt: k.assignedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
    note: k.note ?? "",
    user: k.user ? { id: k.user.id, username: k.user.username, email: k.user.email } : null,
  };
}

function readValidDays(value: unknown) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 0 && days <= MAX_VALID_DAYS ? days : null;
}

function readNote(value: unknown) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" && value.trim().length <= 120 ? value.trim() : null;
}

// Card keys: list and filter
api.get("/keys", requireAdmin, async (req, res) => {
  try {
    const q = textQuery(req);
    const state = KEY_STATES.includes(req.query.state as KeyState) ? (req.query.state as KeyState) : null;
    const page = pageOf(req);

    const search: Prisma.CardKeyWhereInput = q
      ? {
          OR: [
            { code: { contains: q.toUpperCase() } },
            { note: { contains: q } },
            { user: { username: { contains: q } } },
            { user: { email: { contains: q.toLowerCase() } } },
          ],
        }
      : {};
    const where: Prisma.CardKeyWhereInput = state ? { AND: [search, whereState(state)] } : search;

    const [keys, total, ...counts] = await Promise.all([
      prisma.cardKey.findMany({
        where,
        include: keyInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.cardKey.count({ where }),
      prisma.cardKey.count({ where: search }),
      ...KEY_STATES.map((s) => prisma.cardKey.count({ where: { AND: [search, whereState(s)] } })),
    ]);

    res.json({
      keys: keys.map(keyRow),
      total,
      page,
      pageSize: PAGE_SIZE,
      counts: {
        all: counts[0],
        ...Object.fromEntries(KEY_STATES.map((s, i) => [s, counts[i + 1]])),
      },
    });
  } catch (error) {
    console.error("Admin key list failed:", error);
    res.status(500).json({ detail: "Could not load the keys" });
  }
});

// Card keys: generate. With a user, one key is made and handed to that account straight away.
// Without one, up to 50 unassigned keys are made for the admin to hand out later.
api.post("/keys/generate", requireAdmin, async (req, res) => {
  try {
    const count = req.body?.count === undefined ? 1 : Number(req.body.count);
    const validDays = readValidDays(req.body?.validDays);
    const note = readNote(req.body?.note);
    const identifier = typeof req.body?.user === "string" ? req.body.user.trim() : "";

    if (!Number.isInteger(count) || count < 1 || count > 50) {
      res.status(400).json({ detail: "Make between 1 and 50 keys at a time." });
      return;
    }
    if (validDays === null) {
      res.status(400).json({ detail: `Validity must be 0 (lifetime) to ${MAX_VALID_DAYS} days.` });
      return;
    }
    if (note === null) {
      res.status(400).json({ detail: "Keep the note to 120 characters." });
      return;
    }

    let userId: string | null = null;
    if (identifier) {
      if (count !== 1) {
        res.status(400).json({ detail: "A key for a specific user is made one at a time. Set the quantity to 1." });
        return;
      }
      const user = await findUser(identifier);
      if (!user) {
        res.status(404).json({ detail: `No account with the username or email "${identifier}".` });
        return;
      }
      const existing = await userHasActiveKey(user.id);
      if (existing) {
        res.status(409).json({ detail: `${user.username} already has an active key (${existing.code}). Revoke it first to replace it.` });
        return;
      }
      userId = user.id;
    }

    const now = new Date();
    const created = await prisma.$transaction(
      Array.from({ length: count }, () =>
        prisma.cardKey.create({
          data: {
            code: makeCardCode(),
            status: "active",
            validDays,
            note: note || null,
            userId,
            assignedAt: userId ? now : null,
            expiresAt: userId ? expiryFrom(validDays, now) : null,
          },
          include: keyInclude,
        }),
      ),
    );

    const email = userId ? await emailAccess(created[0]) : null;
    res.status(201).json({ keys: created.map(keyRow), email });
  } catch (error) {
    console.error("Admin key generation failed:", error);
    res.status(500).json({ detail: "Could not generate the keys" });
  }
});

async function loadKey(id: string) {
  return prisma.cardKey.findUnique({ where: { id }, include: keyInclude });
}

function keyIdOf(req: Request) {
  const id = req.params.id;
  return typeof id === "string" && id.length <= 64 ? id : "";
}

// Card keys: hand an unassigned key to an account. The validity clock starts now.
api.post("/keys/:id/assign", requireAdmin, async (req, res) => {
  try {
    const key = await loadKey(keyIdOf(req));
    if (!key) {
      res.status(404).json({ detail: "Key not found" });
      return;
    }
    if (keyState(key) !== "unassigned") {
      res.status(409).json({ detail: "Only unassigned, active keys can be given to a user." });
      return;
    }
    const user = await findUser(req.body?.user);
    if (!user) {
      res.status(404).json({ detail: "No account with that username or email." });
      return;
    }
    const existing = await userHasActiveKey(user.id);
    if (existing) {
      res.status(409).json({ detail: `${user.username} already has an active key (${existing.code}). Revoke it first to replace it.` });
      return;
    }
    const now = new Date();
    const updated = await prisma.cardKey.update({
      where: { id: key.id },
      data: { userId: user.id, assignedAt: now, expiresAt: expiryFrom(key.validDays, now) },
      include: keyInclude,
    });
    res.json({ key: keyRow(updated), email: await emailAccess(updated) });
  } catch (error) {
    console.error("Admin key assign failed:", error);
    res.status(500).json({ detail: "Could not assign the key" });
  }
});

// Card keys: take an admin-made key back from an account so it can be handed to someone else.
// Purchased keys stay with the buyer; revoke those instead.
api.post("/keys/:id/unassign", requireAdmin, async (req, res) => {
  try {
    const key = await loadKey(keyIdOf(req));
    if (!key) {
      res.status(404).json({ detail: "Key not found" });
      return;
    }
    if (key.payment) {
      res.status(409).json({ detail: "This key was paid for, so it stays with the buyer. Revoke it instead." });
      return;
    }
    if (!key.userId) {
      res.status(409).json({ detail: "This key isn't assigned to anyone." });
      return;
    }
    const updated = await prisma.cardKey.update({
      where: { id: key.id },
      data: { userId: null, assignedAt: null, expiresAt: null, deviceId: null },
      include: keyInclude,
    });
    res.json({ key: keyRow(updated) });
  } catch (error) {
    console.error("Admin key unassign failed:", error);
    res.status(500).json({ detail: "Could not unassign the key" });
  }
});

// Card keys: revoke (locks the account out at once) or restore
api.post("/keys/:id/revoke", requireAdmin, async (req, res) => {
  try {
    const key = await loadKey(keyIdOf(req));
    if (!key) {
      res.status(404).json({ detail: "Key not found" });
      return;
    }
    const updated = await prisma.cardKey.update({ where: { id: key.id }, data: { status: "revoked" }, include: keyInclude });
    res.json({ key: keyRow(updated) });
  } catch (error) {
    console.error("Admin key revoke failed:", error);
    res.status(500).json({ detail: "Could not revoke the key" });
  }
});

api.post("/keys/:id/restore", requireAdmin, async (req, res) => {
  try {
    const key = await loadKey(keyIdOf(req));
    if (!key) {
      res.status(404).json({ detail: "Key not found" });
      return;
    }
    if (key.userId) {
      const existing = await userHasActiveKey(key.userId, key.id);
      if (existing) {
        res.status(409).json({ detail: `${key.user?.username} already has another active key (${existing.code}).` });
        return;
      }
    }
    const updated = await prisma.cardKey.update({ where: { id: key.id }, data: { status: "active" }, include: keyInclude });
    res.json({ key: keyRow(updated) });
  } catch (error) {
    console.error("Admin key restore failed:", error);
    res.status(500).json({ detail: "Could not restore the key" });
  }
});

// Card keys: change the note, or extend an assigned key's access
api.patch("/keys/:id", requireAdmin, async (req, res) => {
  try {
    const key = await loadKey(keyIdOf(req));
    if (!key) {
      res.status(404).json({ detail: "Key not found" });
      return;
    }
    const data: Prisma.CardKeyUpdateInput = {};

    if (req.body?.note !== undefined) {
      const note = readNote(req.body.note);
      if (note === null) {
        res.status(400).json({ detail: "Keep the note to 120 characters." });
        return;
      }
      data.note = note || null;
    }

    if (req.body?.addDays !== undefined) {
      const addDays = readValidDays(req.body.addDays);
      if (!addDays) {
        res.status(400).json({ detail: `Add between 1 and ${MAX_VALID_DAYS} days.` });
        return;
      }
      if (!key.userId) {
        // Not running yet, so this just lengthens what the user will get
        data.validDays = key.validDays === 0 ? 0 : Math.min(MAX_VALID_DAYS, key.validDays + addDays);
      } else if (key.expiresAt) {
        // Counts from today if it already ran out, otherwise from the current end date
        const base = Math.max(Date.now(), key.expiresAt.getTime());
        data.expiresAt = new Date(base + addDays * 86_400_000);
      }
    }

    if (req.body?.lifetime === true) {
      data.validDays = 0;
      data.expiresAt = null;
    }

    const updated = await prisma.cardKey.update({ where: { id: key.id }, data, include: keyInclude });
    res.json({ key: keyRow(updated) });
  } catch (error) {
    console.error("Admin key update failed:", error);
    res.status(500).json({ detail: "Could not update the key" });
  }
});

// Card keys: delete. Only admin-made keys can go; paid keys are part of the payment record.
api.delete("/keys/:id", requireAdmin, async (req, res) => {
  try {
    const key = await loadKey(keyIdOf(req));
    if (!key) {
      res.status(404).json({ detail: "Key not found" });
      return;
    }
    if (key.payment) {
      res.status(409).json({ detail: "This key belongs to a payment record and can't be deleted. Revoke it instead." });
      return;
    }
    await prisma.cardKey.delete({ where: { id: key.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error("Admin key delete failed:", error);
    res.status(500).json({ detail: "Could not delete the key" });
  }
});

// Users: searchable list with access state and wallet balance
api.get("/users", requireAdmin, async (req, res) => {
  try {
    const q = textQuery(req);
    const page = pageOf(req);
    const where: Prisma.UserWhereInput = q
      ? { OR: [{ username: { contains: q } }, { email: { contains: q.toLowerCase() } }, { id: q }] }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          cardKeys: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, code: true, userId: true, status: true, expiresAt: true, payment: { select: { provider: true } } },
          },
          _count: { select: { taskRecords: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const ids = users.map((u) => u.id);
    const balances = ids.length
      ? await prisma.walletLedgerEntry.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _sum: { amount: true } })
      : [];
    const balanceOf = new Map(balances.map((b) => [b.userId, b._sum.amount ?? 0]));

    res.json({
      users: users.map((u) => {
        const active = u.cardKeys.find((k) => keyState(k) === "active");
        const latest = active ?? u.cardKeys[0];
        return {
          id: u.id,
          username: u.username,
          email: u.email,
          name: [u.firstName, u.lastName].filter(Boolean).join(" "),
          joinedAt: u.createdAt.toISOString(),
          access: active ? "active" : latest ? keyState(latest) : "none",
          key: latest
            ? {
                id: latest.id,
                code: latest.code,
                source: keySource(latest.payment),
                expiresAt: latest.expiresAt?.toISOString() ?? null,
              }
            : null,
          tasks: u._count.taskRecords,
          balanceCents: balanceOf.get(u.id) ?? 0,
        };
      }),
      total,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    console.error("Admin user list failed:", error);
    res.status(500).json({ detail: "Could not load users" });
  }
});

// Withdrawals: read-only view of payout requests
const WITHDRAWAL_STATES = ["pending", "processing", "payout_unknown", "completed", "failed"];

api.get("/withdrawals", requireAdmin, async (req, res) => {
  try {
    const page = pageOf(req);
    const status = WITHDRAWAL_STATES.includes(String(req.query.status)) ? String(req.query.status) : null;
    const where: Prisma.WithdrawalWhereInput = status ? { status } : {};

    const [rows, total, pendingAgg] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { user: { select: { username: true, email: true } } },
      }),
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.aggregate({
        where: { status: { in: ["pending", "processing", "payout_unknown"] } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    res.json({
      withdrawals: rows.map((w) => ({
        id: w.id,
        username: w.user.username,
        email: w.user.email,
        destination: w.destination,
        amountCents: w.amount,
        currency: w.currency,
        status: w.status,
        failureReason: w.failureReason,
        createdAt: w.createdAt.toISOString(),
        processedAt: w.processedAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      open: { count: pendingAgg._count, amountCents: pendingAgg._sum.amount ?? 0 },
    });
  } catch (error) {
    console.error("Admin withdrawal list failed:", error);
    res.status(500).json({ detail: "Could not load withdrawals" });
  }
});

export default router;
