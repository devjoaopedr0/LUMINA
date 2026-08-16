import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AlertCircle, Mail } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ApiError, apiForgotPassword } from "@/lib/api";

/** Primeiro passo de "esqueci minha senha": pede o e-mail e dispara o link
 * de redefinição. A resposta é idêntica mesmo quando o e-mail não está
 * cadastrado — não queremos revelar quais e-mails existem na plataforma. */
export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await apiForgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível enviar o link agora. Verifique sua conexão e tente de novo."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Verifique seu e-mail"
        subtitle="Se o e-mail informado estiver cadastrado, você receberá um link para redefinir sua senha."
      >
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-success/20 bg-success/5 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <Mail className="h-4 w-4" />
          </span>
          <p className="text-sm leading-relaxed text-graphite-600">
            Enviamos um link de redefinição para <strong>{email}</strong>. Ele expira em 30
            minutos — se não encontrar, confira a caixa de spam.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Link
            to="/login"
            className="text-sm font-medium text-graphite-500 hover:text-graphite"
          >
            Voltar para o login
          </Link>
          <Button size="lg" onClick={() => { setSent(false); setError(null); }}>
            Reenviar link
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Esqueceu sua senha?"
      subtitle="Sem problema. Informe seu e-mail e enviaremos um link para você criar uma nova senha."
    >
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

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

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={submitting}>
          {submitting ? "Enviando..." : "Enviar link de redefinição"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-graphite-500">
        Lembrou sua senha?{" "}
        <Link to="/login" className="font-semibold text-graphite hover:text-primary-600">
          Entrar na sua conta
        </Link>
      </p>
    </AuthLayout>
  );
}
