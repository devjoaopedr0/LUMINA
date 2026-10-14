import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { ApiError, apiResetPassword } from "@/lib/api";

/** Segunda etapa de "esqueci minha senha": chega via ?token= no link do
 * e-mail. Valida o token no backend ao salvar a nova senha; links inválidos
 * ou expirados são rejeitados com a mensagem vinda da API. */
export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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
      await apiResetPassword(token ?? "", password);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível redefinir sua senha agora. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout
        title="Link inválido"
        subtitle="O link de redefinição está incompleto. Peça um novo link e tente de novo."
      >
        <div className="flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Não foi possível identificar o link de redefinição.</span>
        </div>

        <Link
          to="/esqueci-senha"
          className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-4 w-full")}
        >
          Pedir novo link
          <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout
        title="Senha redefinida"
        subtitle="Sua senha foi atualizada com sucesso."
      >
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-success/20 bg-success/5 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <p className="text-sm leading-relaxed text-graphite-600">
            Pronto! Use sua nova senha para entrar na sua conta.
          </p>
        </div>

        <Link
          to="/login"
          className={cn(buttonVariants({ variant: "primary", size: "lg" }), "w-full")}
        >
          Entrar na minha conta
          <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Redefinir senha"
      subtitle="Escolha uma nova senha para sua conta."
    >
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
          {submitting ? "Salvando..." : "Salvar nova senha"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-graphite-500">
        Prefere voltar?{" "}
        <Link to="/login" className="font-semibold text-graphite hover:text-primary-600">
          Entrar na sua conta
        </Link>
      </p>
    </AuthLayout>
  );
}
