/**
 * Mobile auth state — holds the signed-in farmer (token + user) and the
 * BDApps phone sign-in flow. Bootstraps from a stored token on launch (via
 * /auth/me) so a returning farmer stays signed in (Tier-1 identity). Consumed
 * by the Account screen and anything that needs the current farmer.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getMe, requestOtp, verifyOtp, type AuthUser } from '@/api/auth';
import { clearToken, getToken, setToken } from '@/api/tokenStore';

interface AuthState {
  user?: AuthUser;
  channelActive: boolean;
  loading: boolean; // true during the initial token bootstrap
  sending: boolean; // true during an OTP request/verify
  /** Step 1: send an OTP to the phone. Returns the referenceNo. */
  startSignIn: (mobile: string) => Promise<string>;
  /** Step 2: verify the code → signs the farmer in. */
  completeSignIn: (input: { referenceNo: string; otp: string; mobile: string; name?: string }) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>();
  const [channelActive, setChannelActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Bootstrap: if we hold a token, validate it against /auth/me.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const startSignIn = useCallback(async (mobile: string) => {
    setSending(true);
    try {
      return (await requestOtp(mobile)).referenceNo;
    } finally {
      setSending(false);
    }
  }, []);

  const completeSignIn = useCallback(
    async (input: { referenceNo: string; otp: string; mobile: string; name?: string }) => {
      setSending(true);
      try {
        const res = await verifyOtp(input);
        setToken(res.accessToken);
        setUser(res.user);
        setChannelActive(res.channelActive);
      } finally {
        setSending(false);
      }
    },
    [],
  );

  const signOut = useCallback(() => {
    clearToken();
    setUser(undefined);
    setChannelActive(false);
  }, []);

  const value = useMemo(
    () => ({ user, channelActive, loading, sending, startSignIn, completeSignIn, signOut }),
    [user, channelActive, loading, sending, startSignIn, completeSignIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
