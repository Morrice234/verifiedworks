// An offline backend that lives in AsyncStorage. It behaves like a real server
// (tokens, server-side answer checking, validation errors) so the screens don't
// need to change when you switch to your FastAPI backend.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRandomChallenge, POINTS } from '@/lib/captcha';
import { randInt, uid } from '@/lib/random';
import {
  AnswerPayload,
  ApiError,
  Backend,
  ChallengeKind,
  Difficulty,
  ProfilePatch,
  RegisterInput,
  Stats,
  TaskRecord,
  User,
} from './types';

type StoredUser = User & { passwordHash: string };
type Pending = {
  userId: string;
  kind: ChallengeKind;
  difficulty: Difficulty;
  solution: string;
  issuedAt: number;
};
type Db = {
  users: StoredUser[];
  tokens: Record<string, string>;
  records: Record<string, TaskRecord[]>;
  pending: Record<string, Pending>;
  emailCodes: Record<string, string>;
};

const KEY = 'captchalab.mockdb.v1';
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

// NOT a secure hash. Fine for an offline demo, never for a real server.
function weakHash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

async function load(): Promise<Db> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // fall through to a fresh db
  }
  return { users: [], tokens: {}, records: {}, pending: {}, emailCodes: {} };
}

async function save(db: Db) {
  await AsyncStorage.setItem(KEY, JSON.stringify(db));
}

function publicUser(u: StoredUser): User {
  const { passwordHash: _ignored, ...rest } = u;
  return rest;
}

function requireUser(db: Db, token: string): StoredUser {
  const id = db.tokens[token];
  const user = db.users.find((u) => u.id === id);
  if (!user) throw new ApiError('Your session expired. Please sign in again.', 401);
  return user;
}

function makeInviteCode(db: Db) {
  let code = '';
  do code = randInt(100000, 999999).toString(36).toUpperCase();
  while (db.users.some((u) => u.inviteCode === code));
  return code;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const mockBackend: Backend = {
  mode: 'mock',

  async requestEmailCode(email) {
    await delay();
    const db = await load();
    const code = String(randInt(100000, 999999));
    db.emailCodes[email.trim().toLowerCase()] = code;
    await save(db);
    // A real server would email this. The mock hands it back so you can test the flow.
    return { sent: true, devCode: code };
  },

  async register(input: RegisterInput) {
    await delay();
    const db = await load();
    const email = input.email.trim().toLowerCase();
    if (db.users.some((u) => u.email === email)) throw new ApiError('That email is already registered.');
    if (db.users.some((u) => u.username.toLowerCase() === input.username.toLowerCase()))
      throw new ApiError('That username is taken.');

    let invitedBy: string | null = null;
    if (input.inviteCode?.trim()) {
      const inviter = db.users.find((u) => u.inviteCode === input.inviteCode!.trim().toUpperCase());
      if (!inviter) throw new ApiError('That invite code does not exist.');
      invitedBy = inviter.id;
    }

    const user: StoredUser = {
      id: uid('u_'),
      username: input.username.trim(),
      email,
      inviteCode: makeInviteCode(db),
      invitedBy,
      createdAt: new Date().toISOString(),
      passwordHash: weakHash(input.password),
    };
    db.users.push(user);
    delete db.emailCodes[email];
    const token = uid('t_');
    db.tokens[token] = user.id;
    await save(db);
    return { token, user: publicUser(user) };
  },

  async login(email, password) {
    await delay();
    const db = await load();
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user || user.passwordHash !== weakHash(password))
      throw new ApiError('Email or password is incorrect.', 401);
    const token = uid('t_');
    db.tokens[token] = user.id;
    await save(db);
    return { token, user: publicUser(user) };
  },

  async me(token) {
    const db = await load();
    return publicUser(requireUser(db, token));
  },

  async updateProfile(token, patch: ProfilePatch) {
    await delay();
    const db = await load();
    const user = requireUser(db, token);
    Object.assign(user, patch);
    await save(db);
    return publicUser(user);
  },

  async nextChallenge(token, difficulty: Difficulty = 'medium') {
    await delay(150);
    const db = await load();
    const user = requireUser(db, token);
    const { challenge, solution } = makeRandomChallenge();

    db.pending[challenge.id] = {
      userId: user.id,
      kind: challenge.kind,
      difficulty,
      solution,
      issuedAt: Date.now(),
    };

    await save(db);
    return challenge;
  },

  async answer(token, challengeId, payload: AnswerPayload) {
    await delay(200);
    const db = await load();
    const user = requireUser(db, token);
    const pending = db.pending[challengeId];
    if (!pending || pending.userId !== user.id) throw new ApiError('This challenge has expired.', 410);
    delete db.pending[challengeId];

    const given =
      payload.kind === 'shapes'
        ? [...payload.selected].sort((a, b) => a - b).join(',')
        : payload.value.trim().toUpperCase();
    const correct = given === pending.solution.toUpperCase();
    const durationMs = Date.now() - pending.issuedAt;
    const points = correct ? POINTS[pending.kind] : 0;

    const rewardByDifficulty: Record<Difficulty, number> = {
      easy: 1,
      medium: 2,
      hard: 3,
    };

    const rewardCents = correct ? rewardByDifficulty[pending.difficulty] : 0;

    const record: TaskRecord = {
      id: challengeId,
      kind: pending.kind,
      difficulty: pending.difficulty,
      correct,
      points,
      rewardCents,
      durationMs,
      createdAt: new Date().toISOString(),
    };

    db.records[user.id] = [
      record,
      ...(db.records[user.id] ?? []),
    ].slice(0, 500);

    await save(db);

    return {
      correct,
      pointsAwarded: points,
      rewardCents,
      difficulty: pending.difficulty,
      durationMs,
    };
  },

  async history(token) {
    const db = await load();
    const user = requireUser(db, token);
    return db.records[user.id] ?? [];
  },

  async stats(token) {
    const db = await load();
    const user = requireUser(db, token);
    const recs = db.records[user.id] ?? [];
    const today = startOfDay(new Date());
    const solvedRecs = recs.filter((r) => r.correct);

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const dayStart = today - (6 - i) * 86400000;
      const dayEnd = dayStart + 86400000;
      const d = new Date(dayStart);
      return {
        label: d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3),
        solved: solvedRecs.filter((r) => {
          const t = new Date(r.createdAt).getTime();
          return t >= dayStart && t < dayEnd;
        }).length,
      };
    });

    const byKind = { text: { solved: 0, attempted: 0 }, math: { solved: 0, attempted: 0 }, shapes: { solved: 0, attempted: 0 } };
    for (const r of recs) {
      byKind[r.kind].attempted++;
      if (r.correct) byKind[r.kind].solved++;
    }

    const stats: Stats = {
      totalPoints: recs.reduce((s, r) => s + r.points, 0),
      todayPoints: recs.filter((r) => new Date(r.createdAt).getTime() >= today).reduce((s, r) => s + r.points, 0),
      solved: solvedRecs.length,
      attempted: recs.length,
      accuracy: recs.length ? solvedRecs.length / recs.length : 0,
      avgDurationMs: recs.length ? recs.reduce((s, r) => s + r.durationMs, 0) / recs.length : 0,
      last7Days,
      byKind,
      totalEarningsCents: recs.reduce((sum, r) => sum + (r.rewardCents ?? 0), 0),
      todayEarningsCents: recs
        .filter((r) => new Date(r.createdAt).getTime() >= today)
        .reduce((sum, r) => sum + (r.rewardCents ?? 0), 0),
    };
    return stats;
  },

  async invite(token) {
    const db = await load();
    const user = requireUser(db, token);
    const invited = db.users
      .filter((u) => u.invitedBy === user.id)
      .map((u) => ({ username: u.username, joinedAt: u.createdAt }));
    return { code: user.inviteCode, invitedCount: invited.length, invited };
  },
};

export async function resetMockDb() {
  await AsyncStorage.removeItem(KEY);
}
