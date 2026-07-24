import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { clearToken, getToken, setToken } from "../api/client.js";
import * as authApi from "../api/auth.js";
import type { AuthUser } from "../api/auth.js";

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the initial token check finishes — routes must wait on this. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // Bootstrap: adopt an OAuth callback token from the URL, then validate whatever
  // token we hold against /auth/me.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get("token");
    if (callbackToken) {
      setToken(callbackToken);
      params.delete("token");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }

    if (!getToken()) {
      setLoading(false);
      return;
    }

    authApi
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  // Any 401 from anywhere in the app drops us back to signed-out state.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setToken(res.accessToken);
    setUser(res.user);
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await authApi.signup(name, email, password);
      setToken(res.accessToken);
      setUser(res.user);
    },
    [],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
