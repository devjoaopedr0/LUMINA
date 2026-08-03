import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, googleAuthUrl } from "@/lib/api";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = (location.state as { from?: string })?.from ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleRedirecting, setGoogleRedirecting] = useState(false);

  useEffect(() => {
    const oauthError = searchParams.get("oauthError");
    if (!oauthError) return;

    setError(oauthError);
    window.history.replaceState({}, "", location.pathname);
  }, [location.pathname, searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível entrar agora. Verifique sua conexão e tente de novo."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoogleClick() {
    setError(null);
    setGoogleRedirecting(true);
    window.location.href = googleAuthUrl();
  }

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Entre na sua conta para continuar sua evolução.">
      <GoogleButton onClick={handleGoogleClick} loading={googleRedirecting} />

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-surface-line" />
        <span className="text-xs text-graphite-400">ou continue com e-mail</span>
        <div className="h-px flex-1 bg-surface-line" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-graphite">
            E-mail
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="seunome@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-graphite">
              Senha
            </label>
            <a href="#" className="text-xs font-medium text-primary-600 hover:underline">
              Esqueceu a senha?
            </a>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-graphite-400 hover:text-graphite"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-graphite-500">
        Ainda não tem conta?{" "}
        <Link to="/signup" className="font-semibold text-graphite hover:text-primary-600">
          Criar conta grátis
        </Link>
      </p>
    </AuthLayout>
  );
}
