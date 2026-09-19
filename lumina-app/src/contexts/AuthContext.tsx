import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  apiLogin,
  apiLogoutAll,
  apiMe,
  apiRegister,
  apiResendVerification,
  apiSetPassword,
  apiVerifyEmail,
  apiUpdateProfile,
  onSessionExpired,
  type UpdateProfilePayload,
  type ApiUser,
} from "@/lib/api";
import { ACCESS_TOKEN_KEY, clearTokens, getAccessToken, setTokens } from "@/lib/auth";

export interface SignupData {
  accountType?: 'STUDENT_INDEPENDENT' | 'TEACHER';
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  teacherSubject?: string;
}

interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<ApiUser>;
  signup: (data: SignupData) => Promise<ApiUser>;
  setPassword: (password: string) => Promise<ApiUser>;
  verifyEmail: (code: string) => Promise<ApiUser>;
  resendVerification: () => Promise<void>;
  updateProfile: (data: UpdateProfilePayload) => Promise<ApiUser>;
  logout: () => void;
  logoutAll: () => Promise<void>;
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

  useEffect(() => {
    function syncSession(event: StorageEvent) {
      if (event.storageArea !== localStorage || event.key !== ACCESS_TOKEN_KEY) return;
      if (!event.newValue) {
        setUser(null);
        return;
      }
      setLoading(true);
      apiMe(event.newValue)
        .then(setUser)
        .catch(() => {
          clearTokens();
          setUser(null);
        })
        .finally(() => setLoading(false));
    }
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);

  useEffect(() => {
    // Dispara quando um refresh de token falha de vez (refresh token também
    // expirado/inválido) — sem isso, `user` continuava preenchido mesmo com
    // a sessão morta, e o app seguia parecendo "logado" enquanto toda
    // chamada autenticada voltava um 401. Zerar `user` aqui já basta: o
    // ProtectedRoute redireciona pra /login sozinho.
    return onSessionExpired(() => setUser(null));
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

  async function setPassword(password: string) {
    const token = getAccessToken();
    const updated = await apiSetPassword(token ?? "", password);
    setUser(updated);
    return updated;
  }

  async function verifyEmail(code: string) {
    const token = getAccessToken();
    const updated = await apiVerifyEmail(token ?? "", code);
    setUser(updated);
    return updated;
  }

  async function resendVerification() {
    const token = getAccessToken();
    await apiResendVerification(token ?? "");
  }

  async function updateProfile(data: UpdateProfilePayload) {
    const token = getAccessToken();
    const updated = await apiUpdateProfile(token ?? '', data);
    setUser(updated);
    return updated;
  }

  function logout() {
    clearTokens();
    setUser(null);
  }

  async function logoutAll() {
    const token = getAccessToken();
    await apiLogoutAll(token ?? '');
    logout();
  }

  const value: AuthContextValue = {
    user,
    loading,
    login,
    signup,
    setPassword,
    verifyEmail,
    resendVerification,
    updateProfile,
    logout,
    logoutAll,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  return ctx;
}
