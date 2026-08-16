import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, RefreshCw } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";

/** Mostrada logo após o cadastro (e também na volta ao app enquanto o e-mail
 * não foi confirmado): pede o código de 6 dígitos enviado por e-mail. Só o
 * cadastro exige esta etapa — o login não. */
export function ConfirmEmail() {
  const { user, verifyEmail, resendVerification } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (user?.emailVerified) {
      navigate("/app", { replace: true });
    }
  }, [user?.emailVerified, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(code)) {
      setError("Digite o código de 6 dígitos recebido por e-mail.");
      return;
    }

    setSubmitting(true);
    try {
      await verifyEmail(code);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível confirmar seu e-mail agora. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    setResending(true);
    try {
      await resendVerification();
      setResent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível reenviar o código agora. Tente novamente."
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout
      title="Confirme seu e-mail"
      subtitle={`Enviamos um código de 6 dígitos para ${user?.email ?? "seu e-mail"}.`}
    >
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-surface-line bg-surface-card p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-graphite/5 text-graphite">
          <KeyRound className="h-4 w-4" />
        </span>
        <p className="text-xs leading-relaxed text-graphite-500">
          O código expira em 15 minutos. Se não encontrar, confira a caixa de spam.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-graphite">
            Código de verificação
          </label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            className="text-center text-lg font-semibold tracking-[0.5em]"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resent && (
          <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3 text-sm text-graphite-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>Novo código enviado para seu e-mail.</span>
          </div>
        )}

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={submitting}>
          {submitting ? "Confirmando..." : "Confirmar e-mail"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <button
        type="button"
        onClick={handleResend}
        disabled={resending}
        className="mt-6 flex w-full items-center justify-center gap-2 text-sm font-medium text-graphite-500 transition-colors hover:text-graphite disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />
        {resending ? "Reenviando..." : "Não recebi o código — reenviar"}
      </button>
    </AuthLayout>
  );
}
