import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, AlertCircle, ShieldCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";

/** Mostrada depois que uma conta é criada via Google — que nasce sem senha
 * local. Pedimos pra pessoa definir uma, com as mesmas regras de segurança
 * do cadastro comum (8 a 72 caracteres), mas sem travar o acesso: dá pra
 * pular e fazer isso depois. */
export function SetPassword() {
  const { user, setPassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPasswordValue] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Sua senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    try {
      await setPassword(password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível salvar sua senha agora. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={`Só mais um passo${user?.firstName ? `, ${user.firstName}` : ""}`}
      subtitle="Crie uma senha para sua conta — assim você também pode entrar sem o Google."
    >
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-surface-line bg-surface-card p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-graphite/5 text-graphite">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <p className="text-xs leading-relaxed text-graphite-500">
          Sua conta foi criada com o Google. Definir uma senha é opcional, mas garante acesso à
          sua conta mesmo sem o Google.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-graphite">
            Nova senha
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
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

        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-graphite">
            Confirmar senha
          </label>
          <Input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={submitting}>
          {submitting ? "Salvando..." : "Salvar senha"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <button
        type="button"
        onClick={() => navigate("/app", { replace: true })}
        className="mt-6 w-full text-center text-sm font-medium text-graphite-500 hover:text-graphite"
      >
        Pular por agora
      </button>
    </AuthLayout>
  );
}
