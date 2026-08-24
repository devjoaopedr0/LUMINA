import { Link } from "react-router-dom";
import { LogOut, Sparkles, LayoutDashboard, Database, ScanLine, Calendar, ArrowRight, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";

const COMING_SOON = [
  { icon: LayoutDashboard, label: "Dashboard de desempenho" },
  { icon: ScanLine, label: "Scanner inteligente" },
];

export function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-surface-card">
      <header className="border-b border-surface-line bg-white">
        <div className="container-lumina flex h-[72px] items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-graphite-500 sm:inline">
              Olá,{" "}
              <span className="font-semibold text-graphite">
                {user?.firstName || user?.email}
              </span>
            </span>
            <Link to="/app/perfil" className="hidden sm:block">
              <Button variant="outline" size="sm">
                <UserRound className="h-4 w-4" />
                Perfil
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container-lumina py-16">
        <div className="rounded-[24px] border border-surface-line bg-graphite px-8 py-12 text-white md:px-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Sua jornada começa agora
          </span>
          <h1 className="mt-5 max-w-xl text-3xl font-semibold leading-[1.2] tracking-tight md:text-4xl">
            Bem-vindo(a) à Lumina, {user?.firstName || "estudante"}.
          </h1>
          <p className="mt-4 max-w-lg text-white/60">
            Sua conta foi criada com sucesso. Esta é a área logada da plataforma —
            as funcionalidades abaixo chegam em breve.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <Link
            to="/app/perfil"
            className="group transition-transform duration-300 hover:-translate-y-1"
          >
            <Card className="h-full border-primary/30 bg-white text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-graphite">
                <UserRound className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-semibold text-graphite">Meu perfil</p>
              <p className="mt-1 text-xs text-graphite-400">Dados pessoais</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 transition-colors group-hover:text-graphite">
                Editar
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Card>
          </Link>
          <Link
            to="/app/questoes"
            className="group transition-transform duration-300 hover:-translate-y-1"
          >
            <Card className="h-full border-primary/30 bg-white text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-graphite">
                <Database className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-semibold text-graphite">Banco de questões</p>
              <p className="mt-1 text-xs text-graphite-400">Acessar agora</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 transition-colors group-hover:text-graphite">
                Começar
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Card>
          </Link>
          <Link
            to="/app/cronograma"
            className="group transition-transform duration-300 hover:-translate-y-1"
          >
            <Card className="h-full border-primary/30 bg-white text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-graphite">
                <Calendar className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-semibold text-graphite">Cronograma de estudos</p>
              <p className="mt-1 text-xs text-graphite-400">Planeje seu ENEM</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 transition-colors group-hover:text-graphite">
                Começar
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Card>
          </Link>
          {COMING_SOON.map((item) => (
            <Card key={item.label} className="border-dashed border-surface-line bg-white text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-graphite/5 text-graphite">
                <item.icon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-semibold text-graphite">{item.label}</p>
              <p className="mt-1 text-xs text-graphite-400">Em breve</p>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
