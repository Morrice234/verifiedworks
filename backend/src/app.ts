import express from "express";
import cors from "cors";
import helmet from "helmet";
import prisma from "./config/database";
import authRoutes, { meRouter } from "./routes/auth";
import practiceRoutes from "./routes/practice";
import adminRoutes from "./routes/admin";
import walletRoutes from "./routes/wallet";
import linkedWalletRoutes from "./routes/linkedWallets";
import transferRoutes from "./routes/transfers";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(adminRoutes); // web panel at /admin, API at /admin/api
app.use(practiceRoutes); // /challenges, /stats, /history, /invite
app.use(walletRoutes);
app.use(linkedWalletRoutes);
app.use(transferRoutes);

app.use("/auth", authRoutes);
app.use(meRouter); // GET/PATCH /me for session restoration (only /me, not /login etc.)

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "verifiedworks-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

export default app;