import { useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2, ChevronRight,
  Clock3, Database, Flame, LayoutDashboard, LogOut, Menu, Sparkles,
  Target, UserRound, X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthContext";
import { apiGetDailySession, apiGetProgress, type StudyProgressSummary, type StudySession } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const NAV_ITEMS = [
  { to: "/app", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/app/cronograma", label: "Cronograma", icon: CalendarDays },
  { to: "/app/questoes", label: "Banco de questões", icon: Database },
  { to: "/app/perfil", label: "Meu perfil", icon: UserRound },
];

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h${remainder ? ` ${remainder}min` : ""}`;
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}` || "LU";
  return (
    <>
      {open && <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-30 bg-graphite/45 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside className={`dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-white/10 bg-graphite text-white ${open ? "dashboard-sidebar-open" : ""}`}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <Logo dark />
          <button type="button" aria-label="Fechar menu" onClick={onClose} className="rounded-lg p-2 text-white/60 hover:bg-white/10 lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 px-4 py-7" aria-label="Navegação principal">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Estudos</p>
          <div className="mt-3 space-y-1.5">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition ${isActive ? "bg-primary text-graphite" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
                <Icon className="h-[18px] w-[18px]" /><span>{label}</span><ChevronRight className="ml-auto h-4 w-4 opacity-40 transition group-hover:translate-x-0.5" />
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-graphite">{initials.toUpperCase()}</span>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.firstName || "Estudante"}</p><p className="truncate text-xs text-white/40">{user?.email}</p></div>
          </div>
          <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-white/55 transition hover:bg-white/10 hover:text-white"><LogOut className="h-[18px] w-[18px]" />Sair da conta</button>
        </div>
      </aside>
    </>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<StudySession | null>(null);
  const [progress, setProgress] = useState<StudyProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    Promise.all([apiGetDailySession(token), apiGetProgress(token)])
      .then(([daily, progressData]) => { setSession(daily?.session ?? null); setProgress(progressData.summary); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const tasks = session?.tasks ?? [];
  const completedToday = tasks.filter((task) => task.status === "DONE").length;
  const pendingTasks = tasks.filter((task) => task.status !== "DONE");
  const completion = useMemo(() => !progress?.totalTasks ? 0 : Math.min(100, Math.round((progress.completedTasks / progress.totalTasks) * 100)), [progress]);
  const todayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());

  const metrics = [
    { label: "Tarefas hoje", value: loading ? "—" : String(tasks.length), detail: `${completedToday} concluídas`, icon: CheckCircle2, color: "bg-success/10 text-success" },
    { label: "Tempo planejado", value: loading ? "—" : formatMinutes(session?.scheduledMinutes ?? 0), detail: "para esta sessão", icon: Clock3, color: "bg-primary/15 text-primary-700" },
    { label: "Progresso geral", value: loading ? "—" : `${completion}%`, detail: `${progress?.completedTasks ?? 0} tarefas concluídas`, icon: Target, color: "bg-blue-50 text-blue-600" },
    { label: "Sequência", value: loading ? "—" : `${progress?.streakDays ?? 0} dias`, detail: "continue assim", icon: Flame, color: "bg-orange-50 text-orange-500" },
  ];

  return (
    <div className="min-h-screen bg-surface-card lg:pl-[280px]">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <header className="sticky top-0 z-20 border-b border-surface-line bg-white/90 backdrop-blur-xl">
        <div className="flex h-20 items-center justify-between px-5 sm:px-8 lg:px-10 xl:px-12">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Abrir menu" onClick={() => setMenuOpen(true)} className="rounded-xl border border-surface-line bg-white p-2.5 lg:hidden"><Menu className="h-5 w-5" /></button>
            <div><p className="text-xs font-medium capitalize text-graphite-400">{todayLabel}</p><p className="text-sm font-semibold text-graphite">Seu espaço de estudos</p></div>
          </div>
          <Link aria-label="Abrir perfil" to="/app/perfil" className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-line bg-white text-graphite-500 transition hover:border-primary hover:text-graphite"><UserRound className="h-[18px] w-[18px]" /></Link>
        </div>
      </header>

      <main className="px-5 py-8 sm:px-8 lg:px-10 xl:px-12 xl:py-10">
        <div className="mx-auto max-w-[1240px]">
          <section className="relative overflow-hidden rounded-[28px] bg-graphite px-6 py-8 text-white sm:px-9 sm:py-10">
            <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" />Foco de hoje</span>
                <h1 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">Olá, {user?.firstName || "estudante"}. Vamos avançar um pouco hoje?</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">{pendingTasks.length > 0 ? `Você tem ${pendingTasks.length} ${pendingTasks.length === 1 ? "atividade planejada" : "atividades planejadas"} para hoje.` : "Organize seu próximo bloco de estudos e mantenha sua evolução constante."}</p>
              </div>
              <Link to="/app/cronograma"><Button className="w-full sm:w-auto"><BookOpenCheck className="h-4 w-4" />{pendingTasks.length ? "Começar sessão" : "Planejar estudos"}<ArrowRight className="h-4 w-4" /></Button></Link>
            </div>
          </section>

          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5" aria-label="Resumo de desempenho">
            {metrics.map(({ label, value, detail, icon: Icon, color }) => (
              <Card key={label} className="bg-white p-4 sm:p-5"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}><Icon className="h-[18px] w-[18px]" /></div><p className="mt-4 text-xl font-bold text-graphite sm:text-2xl">{value}</p><p className="mt-0.5 text-xs font-medium text-graphite-500 sm:text-sm">{label}</p><p className="mt-1 hidden text-xs text-graphite-400 sm:block">{detail}</p></Card>
            ))}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
            <Card className="bg-white p-0">
              <div className="flex items-center justify-between border-b border-surface-line px-6 py-5"><div><h2 className="text-lg font-semibold text-graphite">Plano de hoje</h2><p className="mt-1 text-xs text-graphite-400">Sua prioridade para manter o ritmo</p></div><Link to="/app/cronograma" className="text-xs font-semibold text-primary-700 hover:text-graphite">Ver cronograma</Link></div>
              <div className="p-4 sm:p-6">
                {loading ? <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-graphite/5" />)}</div> : pendingTasks.length > 0 ? (
                  <div className="space-y-3">{pendingTasks.slice(0, 4).map((task, index) => <Link key={task.id} to="/app/cronograma" className="group flex items-center gap-4 rounded-xl border border-surface-line p-4 transition hover:border-primary/50 hover:bg-primary/5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-graphite text-xs font-bold text-white">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-graphite">{task.title}</p><p className="mt-1 text-xs text-graphite-400">{task.subjectName || "Estudo geral"} · {formatMinutes(task.scheduledMinutes)}</p></div><ArrowRight className="h-4 w-4 text-graphite-300 transition group-hover:translate-x-1 group-hover:text-primary-700" /></Link>)}</div>
                ) : <div className="flex flex-col items-center px-4 py-10 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15"><CalendarDays className="h-6 w-6 text-primary-700" /></span><h3 className="mt-4 font-semibold text-graphite">Seu dia ainda está livre</h3><p className="mt-2 max-w-sm text-sm text-graphite-400">Crie um cronograma para transformar seus objetivos em pequenas ações diárias.</p><Link to="/app/cronograma" className="mt-5"><Button size="sm">Criar cronograma</Button></Link></div>}
              </div>
            </Card>

            <Card className="bg-white p-6">
              <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-graphite">Meta em andamento</h2><p className="mt-1 text-xs text-graphite-400">Visão geral do seu plano</p></div><Target className="h-5 w-5 text-primary-700" /></div>
              <div className="mt-8 flex items-center gap-5"><div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--color-primary) ${completion}%, var(--color-surface-line) 0)` }}><div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white text-xl font-bold text-graphite">{completion}%</div></div><div><p className="text-sm font-semibold text-graphite">Consistência constrói resultado</p><p className="mt-1 text-xs leading-relaxed text-graphite-400">Cada sessão concluída aproxima você do seu objetivo principal.</p></div></div>
              <div className="mt-7 border-t border-surface-line pt-5"><Link to="/app/questoes" className="group flex items-center justify-between rounded-xl bg-surface-card p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><Database className="h-[18px] w-[18px]" /></span><div><p className="text-sm font-semibold text-graphite">Praticar questões</p><p className="text-xs text-graphite-400">Teste o que aprendeu</p></div></div><ArrowRight className="h-4 w-4 text-graphite-300 transition group-hover:translate-x-1" /></Link></div>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
