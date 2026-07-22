import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as auth from "@/lib/auth";
import type { AppUser } from "@/lib/auth";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => AppUser | null;
  signup: (name: string, email: string, password: string) => { user?: AppUser; error?: string };
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(auth.getCurrentUser());
    setLoading(false);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login: (email, password) => {
      const result = auth.login(email, password);
      if (result) setUser(result);
      return result;
    },
    signup: (name, email, password) => {
      const result = auth.signup(name, email, password);
      if (result.user) setUser(result.user);
      return result;
    },
    logout: () => {
      auth.logout();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  return ctx;
}
