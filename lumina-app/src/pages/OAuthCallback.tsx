import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";

/** Rota de destino do redirect feito por GET /auth/google/callback no
 * backend, com os tokens na query string. Consome os tokens, carrega o
 * usuário, limpa a URL (pra não deixar os tokens no histórico do
 * navegador) e decide pra onde ir: /definir-senha (conta nova, sem senha
 * local) ou /app. */
export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithTokens } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const accessToken = searchParams.get("accessToken");
    const refreshToken = searchParams.get("refreshToken");

    window.history.replaceState({}, "", "/oauth/callback");

    if (!accessToken || !refreshToken) {
      setError("Não recebemos os dados de login do Google. Tente novamente.");
      return;
    }

    loginWithTokens(accessToken, refreshToken)
      .then((user) => {
        navigate(user.hasPassword ? "/app" : "/definir-senha", { replace: true });
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Não foi possível concluir o login com Google.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-6">
      <Logo />
      {error ? (
        <div className="flex max-w-sm items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-4 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{error}</p>
            <a href="/login" className="mt-2 inline-block font-semibold underline">
              Voltar para o login
            </a>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-graphite-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Concluindo login com Google...</span>
        </div>
      )}
    </div>
  );
}
