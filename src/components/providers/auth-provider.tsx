'use client';

/**
 * Binds the Nhost session to React, and wraps the auth calls the app makes.
 *
 * The v4 SDK has no React bindings, but it does expose
 * `nhost.sessionStorage.onChange`, which is exactly the shape
 * useSyncExternalStore wants. The snapshot is cached in a module-level variable
 * because getSnapshot must return a stable reference — reading (and re-parsing)
 * localStorage on every render would re-render forever.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { StoredSession } from '@nhost/nhost-js';
import { nhost } from '@/lib/nhost';

let cachedSession: StoredSession | null = null;
let hasRead = false;

function getSnapshot(): StoredSession | null {
  if (!hasRead) {
    cachedSession = nhost.getUserSession();
    hasRead = true;
  }
  return cachedSession;
}

function subscribe(onChange: () => void): () => void {
  return nhost.sessionStorage.onChange((session) => {
    cachedSession = session;
    hasRead = true;
    onChange();
  });
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  /** False until the browser has read the stored session, to avoid a flash. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ needsVerification: boolean }>;
  signOut: () => Promise<void>;
  /** Sends the "reset your password" email. */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Re-sends the sign-up verification email. */
  resendVerification: (email: string) => Promise<void>;
  /** Completes a reset once the emailed link has established a session. */
  changePassword: (newPassword: string) => Promise<void>;
  /** Exchanges the refresh token an email link redirects back with. */
  adoptRefreshToken: (refreshToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Nhost errors carry the useful text on `body.message`. */
function messageFor(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const body = (error as { body?: { message?: string } }).body;
    if (body?.message) return body.message;
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
}

/** Where Nhost should send the user back to after they click an email link. */
function redirectTo(path: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${path}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Refresh a token that is close to expiry so the first query of the session
    // is not the thing that discovers it is stale.
    nhost
      .refreshSession(120)
      .catch(() => null)
      .finally(() => setReady(true));
  }, []);

  const user = useMemo<AuthUser | null>(() => {
    const raw = session?.user;
    if (!raw) return null;
    return {
      id: raw.id,
      email: raw.email ?? '',
      displayName: raw.displayName || (raw.email ?? '').split('@')[0] || 'User',
      emailVerified: raw.emailVerified,
    };
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const response = await nhost.auth.signInEmailPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (!response.body.session) {
        throw new Error(
          'Sign-in did not return a session. If this account was just created, verify its email address first.',
        );
      }
    } catch (error) {
      throw new Error(messageFor(error, 'Could not sign in with those details.'));
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      const response = await nhost.auth.signUpEmailPassword({
        email: email.trim().toLowerCase(),
        password,
        options: {
          displayName: displayName.trim() || undefined,
          redirectTo: redirectTo('/verified'),
        },
      });
      // Nhost returns no session when email verification is required.
      return { needsVerification: !response.body.session };
    } catch (error) {
      throw new Error(messageFor(error, 'Could not create that account.'));
    }
  }, []);

  const signOut = useCallback(async () => {
    const current = nhost.getUserSession();
    try {
      if (current?.refreshToken) {
        await nhost.auth.signOut({ refreshToken: current.refreshToken });
      }
    } catch {
      // Even if the server call fails, drop the local session below.
    } finally {
      nhost.clearSession();
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      await nhost.auth.sendPasswordResetEmail({
        email: email.trim().toLowerCase(),
        options: { redirectTo: redirectTo('/reset-password') },
      });
    } catch (error) {
      throw new Error(messageFor(error, 'Could not send the reset email.'));
    }
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    try {
      await nhost.auth.sendVerificationEmail({
        email: email.trim().toLowerCase(),
        options: { redirectTo: redirectTo('/verified') },
      });
    } catch (error) {
      throw new Error(messageFor(error, 'Could not re-send the verification email.'));
    }
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    try {
      await nhost.auth.changeUserPassword({ newPassword });
    } catch (error) {
      throw new Error(messageFor(error, 'Could not change the password.'));
    }
  }, []);

  const adoptRefreshToken = useCallback(async (refreshToken: string) => {
    try {
      // Email links come back with a refresh token in the query string; trading
      // it for a session is what signs the user in for the reset.
      await nhost.auth.refreshToken({ refreshToken });
    } catch (error) {
      throw new Error(
        messageFor(error, 'That link has expired or has already been used. Request a new one.'),
      );
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken: session?.accessToken ?? null,
      ready,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      resendVerification,
      changePassword,
      adoptRefreshToken,
    }),
    [
      user,
      session?.accessToken,
      ready,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      resendVerification,
      changePassword,
      adoptRefreshToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
