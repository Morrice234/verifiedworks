// src/auth/AuthContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ProfilePatch, RegisterInput, User } from '@/api';

// Storage key keeps the old app prefix so existing installs stay signed in after the rename
const TOKEN_KEY = 'captchalab.token';

type AuthState = {
  ready: boolean;
  token: string | null;
  user: User | null;
  /** The lab is unlocked: the admin gave the account a key, or the app runs on the offline demo. */
  hasAccess: boolean;
  /** Re-reads the account from the server, e.g. to see if the admin has given access. */
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Restore a saved session on launch.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TOKEN_KEY);
        if (saved) {
          const me = await api.me(saved);
          setToken(saved);
          setUser(me);
        }
      } catch (e: any) {
        // Safe check for 401 Unauthorized status without relying on faulty instanceof
        if (e?.status === 401 || e?.statusCode === 401) {
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const begin = useCallback(async (t: string, u: User) => {
    await AsyncStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      token,
      user,
      hasAccess: api.mode === 'mock' || !!user?.hasAccess,
      refreshUser: async () => {
        if (!token) return;
        setUser(await api.me(token));
      },
      login: async (email, password) => {
        const s = await api.login(email, password);
        await begin(s.token, s.user);
      },
      register: async (input) => {
        const s = await api.register(input);
        await begin(s.token, s.user);
      },
      logout: async () => {
        await AsyncStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      },
      updateProfile: async (patch) => {
        if (!token) return;
        setUser(await api.updateProfile(token, patch));
      },
    }),
    [ready, token, user, begin],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

/** For screens inside the signed-in area, where a token is guaranteed. */
export function useToken() {
  const { token } = useAuth();
  if (!token) throw new Error('No session');
  return token;
}