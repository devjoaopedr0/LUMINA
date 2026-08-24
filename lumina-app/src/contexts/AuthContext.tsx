import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  apiLogin,
  apiMe,
  apiRegister,
  apiResendVerification,
  apiSetPassword,
  apiVerifyEmail,
  apiUpdateProfile,
  type UpdateProfilePayload,
  type ApiUser,
} from "@/lib/api";
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
  setPassword: (password: string) => Promise<ApiUser>;
  verifyEmail: (code: string) => Promise<ApiUser>;
  resendVerification: () => Promise<void>;
  updateProfile: (data: UpdateProfilePayload) => Promise<ApiUser>;
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  return ctx;
}
