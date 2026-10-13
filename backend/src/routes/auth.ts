
import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt, randomBytes, createHash } from "node:crypto";
import prisma from "../config/database";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { hasActiveKey } from "../middleware/access";

const router = Router();
// Mounted at the app root so the client can call GET/PATCH /me for session restoration.
export const meRouter = Router();

function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === "P2002";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function makeToken(userId: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");

  return jwt.sign({}, secret, {
    subject: userId,
    expiresIn: "7d",
  });
}

function publicUser(user: {
  id: string;
  username: string;
  email: string;
  inviteCode: string;
  invitedBy: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    inviteCode: user.inviteCode,
    invitedBy: user.invitedBy,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    city: user.city ?? undefined,
    createdAt: user.createdAt.toISOString(),
  };
}

// Development only: production needs a real email provider.
router.post("/request-code", async (req, res) => {
  try {
    const email =
      typeof req.body?.email === "string"
        ? normalizeEmail(req.body.email)
        : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ detail: "Enter a valid email address" });
      return;
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = createHash("sha256").update(code).digest("hex");

    await prisma.emailVerification.upsert({
      where: { email },
      update: {
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      create: {
        email,
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const response: { sent: true; devCode?: string } = { sent: true };

    if (process.env.NODE_ENV !== "production") {
      response.devCode = code;
    }

    res.json(response);
  } catch (error) {
    console.error("Request email code failed:", error);
    res.status(500).json({ detail: "Could not request verification code" });
  }
});

router.post("/register", async (req, res) => {
  try {
    // Removed emailCode from the extracted fields
    const { username, password, inviteCode } = req.body ?? {};
    const email =
      typeof req.body?.email === "string"
        ? normalizeEmail(req.body.email)
        : "";

    // Validation without emailCode
    if (
      typeof username !== "string" ||
      !/^[A-Za-z0-9]{6,20}$/.test(username) ||
      typeof password !== "string" ||
      password.length < 8 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      res.status(400).json({ detail: "Invalid registration details (Username must be 6-20 characters, password at least 8)" });
      return;
    }

    // Check if email or username already exists
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username },
        ],
      },
    });

    if (existing) {
      res.status(409).json({ detail: "Email or username is already registered" });
      return;
    }

    let invitedBy: string | null = null;

    if (inviteCode !== undefined && inviteCode !== null && inviteCode !== "") {
      if (typeof inviteCode !== "string") {
        res.status(400).json({ detail: "Invalid invite code" });
        return;
      }

      const inviter = await prisma.user.findUnique({
        where: { inviteCode },
      });

      if (!inviter) {
        res.status(400).json({ detail: "Invalid invite code" });
        return;
      }

      invitedBy = inviter.id;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create user directly without checking/deleting email verification codes
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        inviteCode: randomBytes(6).toString("hex").toUpperCase(),
        invitedBy,
        emailVerified: true, // Automatically mark verified for now
      },
    });

    res.status(201).json({
      token: makeToken(user.id),
      user: { ...publicUser(user), hasAccess: false },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ detail: "Email or username is already registered" });
      return;
    }
    console.error("Registration failed:", error);
    res.status(500).json({ detail: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email =
      typeof req.body?.email === "string"
        ? normalizeEmail(req.body.email)
        : "";
    const password = req.body?.password;

    if (!email || typeof password !== "string") {
      res.status(400).json({ detail: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ detail: "Invalid email or password" });
      return;
    }

    res.json({
      token: makeToken(user.id),
      user: { ...publicUser(user), hasAccess: await hasActiveKey(user.id) },
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({ detail: "Login failed" });
  }
});

const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
    });

    if (!user) {
      res.status(404).json({ detail: "User not found" });
      return;
    }

    res.json({ ...publicUser(user), hasAccess: await hasActiveKey(user.id) });
  } catch (error) {
    console.error("Get profile failed:", error);
    res.status(500).json({ detail: "Could not retrieve profile" });
  }
};

const patchMe = async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, city, username } = req.body ?? {};
    
    // Build update payload dynamically based on provided fields
    const data: { firstName?: string; lastName?: string; city?: string; username?: string } = {};
    if (typeof firstName === "string") data.firstName = firstName.trim();
    if (typeof lastName === "string") data.lastName = lastName.trim();
    if (typeof city === "string") data.city = city.trim();
    
    if (typeof username === "string") {
      if (!/^[A-Za-z0-9]{6,20}$/.test(username)) {
        res.status(400).json({ detail: "Invalid username format" });
        return;
      }
      // Check if username is taken by someone else
      const existing = await prisma.user.findFirst({
        where: { username, NOT: { id: req.userId! } },
      });
      if (existing) {
        res.status(409).json({ detail: "Username is already taken" });
        return;
      }
      data.username = username;
    }

    const updated = await prisma.user.update({
      where: { id: req.userId! },
      data,
    });

    res.json({ ...publicUser(updated), hasAccess: await hasActiveKey(updated.id) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ detail: "Username is already taken" });
      return;
    }
    console.error("Update profile failed:", error);
    res.status(500).json({ detail: "Could not update profile" });
  }
};

router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, patchMe);
meRouter.get("/me", requireAuth, getMe);
meRouter.patch("/me", requireAuth, patchMe);

export default router;