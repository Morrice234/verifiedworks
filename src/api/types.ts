// Shared types between the app and whichever backend is active (mock or FastAPI).

export type User = {
  id: string;
  username: string;
  email: string;
  inviteCode: string;
  invitedBy?: string | null;
  firstName?: string;
  lastName?: string;
  city?: string;
  createdAt: string;
  /** Server mode: the account owns an active (paid) key. */
  hasAccess?: boolean;
};

export type Session = {
  token: string;
  user: User;
};

export type ChallengeKind = 'text' | 'math' | 'shapes';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type ShapeName = 'circle' | 'square' | 'triangle' | 'star';

export type ShapeCell = { shape: ShapeName; color: string; rotation: number };

/**
 * A challenge never contains its answer. The backend keeps the solution and
 * checks submissions, the same way a real CAPTCHA service does.
 */
type ChallengeBase = {
  id: string;
  prompt: string;
  difficulty?: Difficulty;
  /** True when the server's OCR solver can be run on this challenge. */
  solvable?: boolean;
};

export type Challenge =
  | (ChallengeBase & {
      kind: 'text';
      // Either a server-rendered image (data URI or URL) ...
      imageUri?: string;
      // ... or glyph data the app draws itself with SVG (mock mode).
      glyphs?: { char: string; rotation: number; dy: number; color: string }[];
      noiseSeed?: number;
    })
  | (ChallengeBase & {
      kind: 'math';
      // Server mode sends an image, mock mode sends the expression to draw.
      imageUri?: string;
      expression?: string;
      noiseSeed?: number;
    })
  | (ChallengeBase & {
      kind: 'shapes';
      target: ShapeName;
      grid: ShapeCell[]; // 9 cells, 3x3
    });

export type AnswerPayload =
  | { kind: 'text' | 'math'; value: string }
  | { kind: 'shapes'; selected: number[] };


export type AnswerResult = {
  correct: boolean;
  pointsAwarded: number;
  rewardCents: number;
  difficulty?: Difficulty;
  durationMs: number;
  assisted?: boolean;
};


export type SolverResult = {
  status: 'completed' | 'failed';
  guess: string | null;
  correct: boolean;
  elapsedMs: number | null;
  error: string | null;
};


export type TaskRecord = {
  id: string;
  kind: ChallengeKind;
  correct: boolean;
  points: number;
  rewardCents: number;
  durationMs: number;
  createdAt: string;
  difficulty?: Difficulty;
  assisted?: boolean;
};


export type KindStat = { solved: number; attempted: number; avgMs?: number };

export type Stats = {
  totalPoints: number;
  todayPoints: number;
  solved: number;
  attempted: number;
  accuracy: number; // 0..1
  avgDurationMs: number;
  last7Days: { label: string; solved: number }[];
  byKind: Record<ChallengeKind, KindStat>;
  /** Server mode only: how the OCR solver did on the same kinds of challenge. */
  solver?: { runs: number; byKind: Record<'text' | 'math', KindStat> };
  totalEarningsCents: number;
  todayEarningsCents: number;
};

export type InviteInfo = {
  code: string;
  invitedCount: number;
  invited: { username: string; joinedAt: string }[];
};

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
  /** Email verification is switched off for now. Kept optional for when it comes back. */
  emailCode?: string;
  inviteCode?: string;
};

export type ProfilePatch = Partial<Pick<User, 'firstName' | 'lastName' | 'city'>>;



export type WalletWithdrawal = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
};

export type WalletSummary = {
  currency: string;
  balanceCents: number;
  minimumWithdrawalCents: number;
  withdrawals: {
    id: string;
    amountCents: number;
    currency: string;
    provider: string;
    status: string;
    createdAt: string;
  }[];
};

export type WithdrawalRequestResult = {
  withdrawal: WalletWithdrawal;
  repeated: boolean;
  detail: string;
};

export type WithdrawalStatusResult = {
  withdrawal: WalletWithdrawal;
  batchStatus?: string;
  itemStatus?: string | null;
  detail?: string;
};


export type LinkedWallet = {
  id: string;
  provider: string;
  accountIdentifier: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type LinkedWalletList = {
  wallets: LinkedWallet[];
};

export type LinkedWalletResult = {
  wallet: LinkedWallet;
  detail: string;
};


export type TransferResult = {
  transfer: {
    id: string;
    recipientUsername: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: string;
  };
  repeated: boolean;
  detail: string;
};

export type WalletTransfer = {
  id: string;
  senderUsername: string;
  recipientUsername: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
  direction: 'sent' | 'received';
};

export type TransferHistory = {
  transfers: WalletTransfer[];
};



export interface Backend {
  readonly mode: 'mock' | 'http';
  requestEmailCode(email: string): Promise<{ sent: true; devCode?: string }>;
  register(input: RegisterInput): Promise<Session>;
  login(email: string, password: string): Promise<Session>;
  me(token: string): Promise<User>;
  updateProfile(token: string, patch: ProfilePatch): Promise<User>;
  stats(token: string): Promise<Stats>;
  nextChallenge(token: string, difficulty?: Difficulty): Promise<Challenge>;
  /** Only the FastAPI backend has an OCR solver. */
  solve?(token: string, challengeId: string): Promise<SolverResult>;
  answer(token: string, challengeId: string, payload: AnswerPayload): Promise<AnswerResult>;
  history(token: string): Promise<TaskRecord[]>;
  invite(token: string): Promise<InviteInfo>;

  wallet?(token: string): Promise<WalletSummary>;
  requestWithdrawal?(
    token: string,
    amountCents: number,
    destination: string,
    idempotencyKey: string,
  ): Promise<WithdrawalRequestResult>;
  walletTransactions?(token: string): Promise<WalletWithdrawal[]>;
    withdrawalStatus?(
    token: string,
    withdrawalId: string,
  ): Promise<WithdrawalStatusResult>;

  linkedWallets?(token: string): Promise<LinkedWalletList>;

  linkWallet?(
    token: string,
    provider: string,
    accountIdentifier: string,
  ): Promise<LinkedWalletResult>;

  unlinkWallet?(token: string, walletId: string): Promise<{ detail: string }>;

  
  transferFunds?(
    token: string,
    recipientUsername: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<TransferResult>;

  transferHistory?(token: string): Promise<TransferHistory>;

}

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
