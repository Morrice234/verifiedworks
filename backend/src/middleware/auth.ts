
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthRequest = Request & {
  userId?: string;
};

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ detail: "Authentication required" });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not configured");

    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as jwt.JwtPayload;

    // Admin panel tokens are for /admin only, never for the app's user routes
    if (typeof payload.sub !== "string" || payload.aud === "admin") {
      res.status(401).json({ detail: "Invalid token" });
      return;
    }

    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ detail: "Invalid or expired token" });
  }
}