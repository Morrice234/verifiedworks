import { Router } from "express";
import prisma from "../config/database";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireActiveKey } from "../middleware/access";
import { ChallengeKind, Difficulty, makeRandomChallenge, POINTS } from "../lib/captcha";

const router = Router();

// Challenges waiting for an answer. Kept in memory: restarting the server
// simply expires any challenge that was on screen at the time.
type Pending = {
  userId: string;
  kind: ChallengeKind;
  difficulty: Difficulty;
  solution: string;
  issuedAt: number;
};
const pending = new Map<string, Pending>();
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function sweep() {
  const cutoff = Date.now() - CHALLENGE_TTL_MS;
  for (const [id, p] of pending) if (p.issuedAt < cutoff) pending.delete(id);
}

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

router.get("/challenges/next", requireAuth, requireActiveKey, (req: AuthRequest, res) => {
  sweep();
  const asked = String(req.query.difficulty ?? "medium") as Difficulty;
  const difficulty = DIFFICULTIES.includes(asked) ? asked : "medium";

  const { challenge, solution } = makeRandomChallenge(difficulty);
  pending.set(challenge.id, {
  userId: req.userId!,
  kind: challenge.kind,
  difficulty,
  solution,
  issuedAt: Date.now(),
});
  res.json(challenge);
});


router.post("/challenges/:id/answer", requireAuth, requireActiveKey, async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const p = pending.get(id);

  if (!p || p.userId !== req.userId || Date.now() - p.issuedAt > CHALLENGE_TTL_MS) {
    pending.delete(id);
    res.status(410).json({ detail: "This challenge has expired." });
    return;
  }

  // Consume the challenge once to prevent repeated submissions.
  pending.delete(id);

  try {
    const body = req.body ?? {};
    let given = "";

    if (body.kind === "shapes" && Array.isArray(body.selected)) {
      given = body.selected
        .map((n: unknown) => Number(n))
        .filter((n: number) => Number.isInteger(n))
        .sort((a: number, b: number) => a - b)
        .join(",");
    } else if (typeof body.value === "string") {
      given = body.value.trim().toUpperCase();
    }

    const correct = given === p.solution.toUpperCase();
    const durationMs = Date.now() - p.issuedAt;
    const points = correct ? POINTS[p.kind] : 0;

    const rewardByDifficulty: Record<Difficulty, number> = {
      easy: 1,
      medium: 2,
      hard: 3,
    };

    const rewardCents = correct ? rewardByDifficulty[p.difficulty] : 0;

    const task = await prisma.$transaction(async (tx) => {
      const createdTask = await tx.taskRecord.create({
        data: {
          userId: req.userId!,
          challengeId: id,
          kind: p.kind,
          difficulty: p.difficulty,
          correct,
          points,
          rewardCents,
          durationMs,
        },
      });

      if (rewardCents > 0) {
        await tx.walletLedgerEntry.create({
          data: {
            userId: req.userId!,
            amount: rewardCents,
            type: "task_reward",
            sourceType: "task",
            sourceId: createdTask.id,
            idempotencyKey: `task:${id}:reward`,
            description: `${p.difficulty} ${p.kind} challenge reward`,
          },
        });
      }

      return createdTask;
    });

    res.json({
      correct,
      pointsAwarded: points,
      rewardCents: task.rewardCents,
      difficulty: task.difficulty,
      durationMs,
    });
  } catch (error) {
    console.error("Answer failed:", error);
    res.status(500).json({ detail: "Could not check your answer" });
  }
});


router.get("/history", requireAuth, requireActiveKey, async (req: AuthRequest, res) => {
  try {
    const records = await prisma.taskRecord.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    res.json(records.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (error) {
    console.error("History failed:", error);
    res.status(500).json({ detail: "Could not load history" });
  }
});

router.get("/stats", requireAuth, requireActiveKey, async (req: AuthRequest, res) => {
  try {
    const recs = await prisma.taskRecord.findMany({ where: { userId: req.userId! } });
    const today = startOfDay(new Date());
    const solved = recs.filter((r) => r.correct);

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const dayStart = today - (6 - i) * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      return {
        label: new Date(dayStart).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3),
        solved: solved.filter((r) => {
          const t = r.createdAt.getTime();
          return t >= dayStart && t < dayEnd;
        }).length,
      };
    });

    const byKind: Record<ChallengeKind, { solved: number; attempted: number }> = {
      text: { solved: 0, attempted: 0 },
      math: { solved: 0, attempted: 0 },
      shapes: { solved: 0, attempted: 0 },
    };
    for (const r of recs) {
      const k = byKind[r.kind as ChallengeKind];
      if (!k) continue;
      k.attempted++;
      if (r.correct) k.solved++;
    }

    res.json({
      totalPoints: recs.reduce((s, r) => s + r.points, 0),
      todayPoints: recs.filter((r) => r.createdAt.getTime() >= today).reduce((s, r) => s + r.points, 0),
      solved: solved.length,
      attempted: recs.length,
      accuracy: recs.length ? solved.length / recs.length : 0,
      avgDurationMs: recs.length ? recs.reduce((s, r) => s + r.durationMs, 0) / recs.length : 0,
      last7Days,
      byKind,
    });
  } catch (error) {
    console.error("Stats failed:", error);
    res.status(500).json({ detail: "Could not load stats" });
  }
});

router.get("/invite", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) {
      res.status(404).json({ detail: "User not found" });
      return;
    }
    const invited = await prisma.user.findMany({
      where: { invitedBy: user.id },
      orderBy: { createdAt: "desc" },
      select: { username: true, createdAt: true },
    });
    res.json({
      code: user.inviteCode,
      invitedCount: invited.length,
      invited: invited.map((u) => ({ username: u.username, joinedAt: u.createdAt.toISOString() })),
    });
  } catch (error) {
    console.error("Invite failed:", error);
    res.status(500).json({ detail: "Could not load invite info" });
  }
});

export default router;
