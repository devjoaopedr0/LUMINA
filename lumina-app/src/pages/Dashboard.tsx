import { LogOut, Sparkles, LayoutDashboard, Database, ScanLine, CalendarRange } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";

const COMING_SOON = [
  { icon: LayoutDashboard, label: "Dashboard de desempenho" },
  { icon: Database, label: "Banco de questões" },
  { icon: ScanLine, label: "Scanner inteligente" },
  { icon: CalendarRange, label: "Cronograma adaptativo" },
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

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
