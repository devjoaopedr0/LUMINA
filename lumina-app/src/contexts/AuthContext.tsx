import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiLogin, apiMe, apiRegister, apiSetPassword, type ApiUser } from "@/lib/api";
import { clearTokens, getAccessToken, setTokens } from "@/lib/auth";

export interface SignupData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<ApiUser>;
  signup: (data: SignupData) => Promise<ApiUser>;
  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<ApiUser>;
  setPassword: (password: string) => Promise<ApiUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiMe(token)
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await apiLogin({ email, password });
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }

  async function signup(data: SignupData) {
    const res = await apiRegister(data);
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }

  /** Usado pela tela de callback do login com Google, que já recebe os
   * tokens prontos na URL (ver OAuthCallback). */
  async function loginWithTokens(accessToken: string, refreshToken: string) {
    setTokens(accessToken, refreshToken);
    const me = await apiMe(accessToken);
    setUser(me);
    return me;
  }

  async function setPassword(password: string) {
    const token = getAccessToken();
    const updated = await apiSetPassword(token ?? "", password);
    setUser(updated);
    return updated;
  }

  function logout() {
    clearTokens();
    setUser(null);
  }

  const value: AuthContextValue = {
    user,
    loading,
    login,
    signup,
    loginWithTokens,
    setPassword,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  return ctx;
}
