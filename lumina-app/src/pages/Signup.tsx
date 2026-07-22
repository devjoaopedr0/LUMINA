import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  GraduationCap,
  Building2,
} from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import type { AccountType } from "@/lib/auth";

const ACCOUNT_TYPES: {
  value: AccountType;
  icon: typeof GraduationCap;
  title: string;
  description: string;
}[] = [
  {
    value: "aluno",
    icon: GraduationCap,
    title: "Sou aluno",
    description: "Quero estudar e me preparar para o vestibular com a LuminIA.",
  },
  {
    value: "instituicao",
    icon: Building2,
    title: "Sou instituição",
    description: "Quero licenciar a Lumina para minha instituição.",
  },
];

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [accountType, setAccountType] = useState<AccountType | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accountType) return;

    if (password.length < 5) {
      setError("Sua senha precisa ter pelo menos 5 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    const result = signup(name, email, password, accountType);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate("/app", { replace: true });
  }

  function handleGoogleClick() {
    setError("O cadastro com Google será habilitado assim que o backend estiver conectado.");
  }

  if (!accountType) {
    return (
      <AuthLayout
        title="Como você vai usar a Lumina?"
        subtitle="Isso nos ajuda a personalizar sua experiência desde o início."
      >
        <div className="flex flex-col gap-4">
          {ACCOUNT_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAccountType(option.value)}
              className="group flex items-start gap-4 rounded-2xl border border-surface-line bg-white p-5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-600 hover:shadow-[0_20px_40px_-20px_rgba(31,41,55,0.15)]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-graphite/5 text-graphite transition-colors group-hover:bg-primary group-hover:text-graphite">
                <option.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-base font-semibold text-graphite">{option.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-graphite-500">
                  {option.description}
                </span>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-graphite-500">
          Já tem uma conta?{" "}
          <Link to="/login" className="font-semibold text-graphite hover:text-primary-600">
            Entrar
          </Link>
        </p>
      </AuthLayout>
    );
  }

  const selected = ACCOUNT_TYPES.find((o) => o.value === accountType)!;

  return (
    <AuthLayout
      title={accountType === "instituicao" ? "Crie a conta da sua instituição" : "Crie sua conta grátis"}
      subtitle={
        accountType === "instituicao"
          ? "Preencha os dados abaixo para começar."
          : "Comece agora, sem cartão de crédito."
      }
    >
      <button
        type="button"
        onClick={() => setAccountType(null)}
        className="mb-6 flex items-center gap-2 rounded-full border border-surface-line bg-white py-2 pl-2 pr-4 text-xs font-semibold text-graphite-500 transition-colors hover:text-graphite"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-graphite/5">
          <ArrowLeft className="h-3.5 w-3.5" />
        </span>
        <selected.icon className="h-3.5 w-3.5 text-primary-600" />
        {selected.title}
        <span className="text-graphite-400">· trocar</span>
      </button>

      <GoogleButton onClick={handleGoogleClick} />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-surface-line" />
        <span className="text-xs text-graphite-400">ou cadastre-se com e-mail</span>
        <div className="h-px flex-1 bg-surface-line" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-graphite">
            {accountType === "instituicao" ? "Nome da instituição" : "Nome completo"}
          </label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder={accountType === "instituicao" ? "Nome do cursinho ou escola" : "Seu nome"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

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
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-graphite">
            Senha
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

        {accountType === "aluno" && (
          <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3 text-xs text-graphite-500">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <span>Grátis para começar. Sem cartão de crédito. Cancele quando quiser.</span>
          </div>
        )}

        <Button type="submit" size="lg" className="mt-2 w-full">
          Criar minha conta
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-graphite-500">
        Já tem uma conta?{" "}
        <Link to="/login" className="font-semibold text-graphite hover:text-primary-600">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
