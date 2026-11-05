import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  // Guarda de onde veio (ex.: link de convite da turma) para voltar depois do login.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return <>{children}</>;
}
