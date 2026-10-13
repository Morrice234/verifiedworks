// HTTP backend: talks to the Express server in /backend.
import { getDeviceId } from '@/lib/device';
import {
  ApiError,
  Backend,
  Challenge,
  InviteInfo,
  Stats,
  TaskRecord,
  User,
  Session,
  AnswerResult,
  WalletSummary,
  WithdrawalRequestResult,
  WalletWithdrawal,
  LinkedWalletList,
  LinkedWalletResult,
  TransferResult,
  WithdrawalStatusResult,
  TransferHistory,
} from './types';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

async function request<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': await getDeviceId(),
    ...options.headers,
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(`Can't reach the server at ${BASE_URL}. Is the backend running and on the same Wi-Fi?`, 0);
  }

  let data: any = null;
  if (res.headers.get('content-type')?.includes('application/json')) {
    data = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const message = data?.detail || data?.message || `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}

export const httpBackend: Backend = {
  mode: 'http',

  requestEmailCode: (email) => request('/auth/request-code', { method: 'POST', body: { email } }),
  register: (input) => request<Session>('/auth/register', { method: 'POST', body: input }),
  login: (email, password) => request<Session>('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token) => request<User>('/me', { token }),
  updateProfile: (token, patch) => request<User>('/me', { method: 'PATCH', token, body: patch }),

  stats: (token) => request<Stats>('/stats', { token }),
  history: (token) => request<TaskRecord[]>('/history', { token }),
  invite: (token) => request<InviteInfo>('/invite', { token }),
  nextChallenge: (token, difficulty = 'medium') =>
    request<Challenge>(`/challenges/next?difficulty=${encodeURIComponent(difficulty)}`, { token }),
  answer: (token, challengeId, payload) =>
    request<AnswerResult>(`/challenges/${encodeURIComponent(challengeId)}/answer`, { method: 'POST', token, body: payload }),


  wallet: (token) =>
    request<WalletSummary>('/wallet', { token }),

  requestWithdrawal: (
    token,
    amountCents,
    destination,
    idempotencyKey,
  ) =>
    request<WithdrawalRequestResult>('/wallet/withdraw', {
      method: 'POST',
      token,
      body: {
        amountCents,
        destination,
        provider: 'paypal',
      },
      // The request helper must support this header.
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }),

      withdrawalStatus: (token, withdrawalId) =>
    request<WithdrawalStatusResult>(
      `/wallet/withdrawals/${encodeURIComponent(withdrawalId)}/status`,
      { token },
    ),

  walletTransactions: (token) =>
    request<WalletWithdrawal[]>('/wallet/transactions', { token }),

  linkedWallets: (token) =>
    request<LinkedWalletList>('/wallets/linked', { token }),

  linkWallet: (token, provider, accountIdentifier) =>
    request<LinkedWalletResult>('/wallets/linked', {
      method: 'POST',
      token,
      body: { provider, accountIdentifier },
    }),

  unlinkWallet: (token, walletId) =>
    request<{ detail: string }>(
      `/wallets/linked/${encodeURIComponent(walletId)}`,
      { method: 'DELETE', token },
    ),

    
  transferFunds: (
    token,
    recipientUsername,
    amountCents,
    idempotencyKey,
  ) =>
    request<TransferResult>('/wallet/transfer', {
      method: 'POST',
      token,
      body: {
        recipientUsername,
        amountCents,
      },
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }),

  transferHistory: (token) =>
    request<TransferHistory>('/wallet/transfers', { token }),

};
