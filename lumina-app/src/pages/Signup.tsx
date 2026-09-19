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
  BookOpen,
  Clock,
} from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { EMAIL_PATTERN } from "@/lib/utils";

type AccountType = "aluno" | "professor" | "instituicao";
const TEACHER_SUBJECTS = ['Língua Portuguesa', 'Literatura', 'Redação', 'Matemática', 'Física', 'Química', 'Biologia', 'História', 'Geografia', 'Filosofia', 'Sociologia', 'Inglês', 'Espanhol'];

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
    value: "professor",
    icon: BookOpen,
    title: "Sou professor",
    description: "Quero criar questões da minha matéria e temas de redação.",
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

  const [firstName, setFirstName] = useState("");
  const [teacherSubject, setTeacherSubject] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!EMAIL_PATTERN.test(email)) {
      setError("Digite um e-mail válido, por exemplo: nome@gmail.com.");
      return;
    }
    if (confirmEmail !== email) {
      setError("Os e-mails não conferem.");
      return;
    }
    if (password.length < 8) {
      setError("Sua senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }
    if (accountType === 'professor' && !TEACHER_SUBJECTS.includes(teacherSubject)) {
      setError('Escolha sua matéria antes de criar a conta.'); return;
    }

    setSubmitting(true);
    try {
      const newUser = await signup({ firstName, lastName, username, email, password, accountType: accountType === 'professor' ? 'TEACHER' : 'STUDENT_INDEPENDENT', ...(accountType === 'professor' ? { teacherSubject } : {}) });
      // Conta recém-criada nasce com e-mail não verificado: segue para a tela
      // de confirmação (código de 6 dígitos). Quem já tem e-mail verificado
      // (ex: futuro login social) vai direto ao app.
      navigate(newUser.emailVerified ? "/app" : "/confirmar-email", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível criar sua conta agora. Verifique sua conexão e tente de novo."
      );
    } finally {
      setSubmitting(false);
    }
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

  if (accountType === "instituicao") {
    return (
      <AuthLayout
        title="Cadastro institucional chegando em breve"
        subtitle="Ainda estamos preparando o fluxo de licenciamento para instituições."
      >
        <button
          type="button"
          onClick={() => setAccountType(null)}
          className="mb-6 flex items-center gap-2 rounded-full border border-surface-line bg-white py-2 pl-2 pr-4 text-xs font-semibold text-graphite-500 transition-colors hover:text-graphite"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-graphite/5">
            <ArrowLeft className="h-3.5 w-3.5" />
          </span>
          Voltar
        </button>

        <div className="flex items-start gap-3 rounded-2xl border border-surface-line bg-surface-card p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-graphite/5 text-graphite">
            <Clock className="h-5 w-5" />
          </span>
          <p className="text-sm leading-relaxed text-graphite-500">
            O cadastro para escolas e cursinhos está em construção. Enquanto isso, você pode criar
            uma conta de aluno para conhecer a plataforma.
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          className="mt-6 w-full"
          onClick={() => setAccountType("aluno")}
        >
          Criar conta de aluno
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={accountType === 'professor' ? 'Crie sua conta de professor' : 'Crie sua conta grátis'} subtitle="Comece agora, sem cartão de crédito.">
      <button
        type="button"
        onClick={() => setAccountType(null)}
        className="mb-6 flex items-center gap-2 rounded-full border border-surface-line bg-white py-2 pl-2 pr-4 text-xs font-semibold text-graphite-500 transition-colors hover:text-graphite"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-graphite/5">
          <ArrowLeft className="h-3.5 w-3.5" />
        </span>
        <GraduationCap className="h-3.5 w-3.5 text-primary-600" />
        {accountType === 'professor' ? 'Sou professor' : 'Sou aluno'}
        <span className="text-graphite-400">· trocar</span>
      </button>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {accountType === 'professor' ? <div><label htmlFor="teacher-subject" className="mb-1.5 block text-sm font-medium text-graphite">Matéria que você leciona</label><select id="teacher-subject" required value={teacherSubject} onChange={event => setTeacherSubject(event.target.value)} className="w-full rounded-xl border border-surface-line bg-white p-3"><option value="">Escolha sua matéria</option>{TEACHER_SUBJECTS.map(subject => <option key={subject} value={subject}>{subject}</option>)}</select><p className="mt-2 text-xs text-graphite-500">Suas questões ficarão no seu espaço pessoal até serem revisadas para publicação.</p></div> : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-graphite">
              Nome
            </label>
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              placeholder="Seu nome"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-graphite">
              Sobrenome
            </label>
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              placeholder="Seu sobrenome"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-graphite">
            Nome de usuário
          </label>
          <Input
            id="username"
            type="text"
            autoComplete="username"
            placeholder="seu.usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
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
          <label htmlFor="confirm-email" className="mb-1.5 block text-sm font-medium text-graphite">
            Confirmar e-mail
          </label>
          <Input
            id="confirm-email"
            type="email"
            autoComplete="email"
            placeholder="digite o e-mail novamente"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
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

        <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3 text-xs text-graphite-500">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          <span>Grátis para começar. Sem cartão de crédito. Cancele quando quiser.</span>
        </div>

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={submitting}>
          {submitting ? "Criando conta..." : "Criar minha conta"}
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
