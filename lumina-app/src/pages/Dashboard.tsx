import { useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ArrowRight, BookOpenCheck, Bookmark, CalendarDays, CheckCircle2, ChevronRight, Award, Clock3, Database, FileText, Flame, Globe, History, LayoutDashboard, Lightbulb, LogOut, Menu, NotebookPen, Sparkles, TrendingUp, Target, UserRound, Users, School, AlertTriangle, X, ScanLine } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthContext";
import { apiEssays, apiGetDailySession, apiGetErrorNotebookSummary, apiGetProgress, apiGetQuestionPerformance, apiGetQuestionProgress, apiGetReviewQuestions, apiSimulations, apiTeacherDashboard, apiCoordinatorDashboard, apiDirectorDashboard, apiUpdateDirectorMember, apiCoordinatorPeriods, apiCreateCoordinatorPeriod, apiUpdateCoordinatorPeriod, apiPendingInvite, apiAcceptInvite, apiCreateInstitutionInvite, apiListInstitutionInvites, apiRevokeInstitutionInvite, type AcademicPeriod, type ApiUser, type ErrorNotebookSummary, type EssaySummary, type InstitutionInvite, type PendingInvite, type PerformanceBreakdown, type ProgressEvolutionPoint, type QuestionProgressItem, type SimulationSummary, type StudyProgressSummary, type StudySchedule, type StudySession, type TeacherDashboard, type CoordinatorDashboard, type DirectorDashboard } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatCalendarDate, localDateKey } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/app", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/app/cronograma", label: "Cronograma", icon: CalendarDays },
  { to: "/app/questoes", label: "Banco de questões", icon: Database },
  { to: "/app/caderno-de-erros", label: "Caderno de erros", icon: NotebookPen },
  { to: "/app/busca-web", label: "Buscar questões na web", icon: Globe },
  { to: "/app/simulados", label: "Simulados", icon: BookOpenCheck },
  { to: "/app/turmas", label: "Turmas", icon: School },
  { to: "/app/calculo-mental", label: "Cálculo mental", icon: Target },
  { to: "/app/redacoes", label: "Redações", icon: BookOpenCheck },
  { to: "/app/redacoes/scanner", label: "Corrigir redação por foto", icon: ScanLine },
  { to: "/app/redacoes/modelos", label: "Modelos nota mil", icon: Award },
  { to: "/app/question-scanner", label: "Scanner de questões", icon: Sparkles },
  { to: "/app/gabarito-scanner", label: "Scanner de gabarito", icon: FileText },
  { to: "/app/provas-antigas", label: "Provas anteriores", icon: History },
  { to: "/app/caderno-formulas", label: "Caderno de fórmulas", icon: Lightbulb },
  { to: "/app/caderno-repertorio", label: "Caderno de repertórios", icon: BookOpenCheck },
  { to: "/app/perfil", label: "Meu perfil", icon: UserRound },
];

const MANAGEMENT_PANELS: Partial<Record<ApiUser['accountType'], { title: string; headline: string; action: string }>> = {
  TEACHER: { title: 'Painel do professor', headline: 'Acompanhe suas turmas e prepare as próximas atividades.', action: 'Gerenciar turmas' },
  COORDINATOR: { title: 'Painel da coordenação', headline: 'Acompanhe professores, turmas e indicadores pedagógicos.', action: 'Ver turmas' },
  DIRECTOR: { title: 'Painel da direção', headline: 'Consulte os indicadores acadêmicos da instituição.', action: 'Ver indicadores' },
  ADMIN: { title: 'Administração da plataforma', headline: 'Gerencie acessos, conteúdos e operações da Lumina.', action: 'Ver operações' },
};

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

interface InviteManagementCardProps {
  workspaceId: string;
  invites: InstitutionInvite[];
  inviteForm: { email: string; accountType: 'STUDENT_INSTITUTION' | 'TEACHER' | 'COORDINATOR'; subject: string };
  setInviteForm: (updater: (current: { email: string; accountType: 'STUDENT_INSTITUTION' | 'TEACHER' | 'COORDINATOR'; subject: string }) => { email: string; accountType: 'STUDENT_INSTITUTION' | 'TEACHER' | 'COORDINATOR'; subject: string }) => void;
  inviteBusy: boolean;
  inviteError: string;
  onCreate: (workspaceId: string) => void;
  onRevoke: (workspaceId: string, memberId: string) => void;
}

function InviteManagementCard({ workspaceId, invites, inviteForm, setInviteForm, inviteBusy, inviteError, onCreate, onRevoke }: InviteManagementCardProps) {
  return (
    <Card className="bg-white">
      <h2 className="text-lg font-semibold text-graphite">Convites institucionais</h2>
      <p className="mt-1 text-xs text-graphite-400">Convide alguém que já tem conta na Lumina — ela precisa aceitar para entrar.</p>
      {inviteError && <p role="alert" className="mt-3 text-sm text-red-700">{inviteError}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <input aria-label="E-mail para convidar" type="email" placeholder="pessoa@exemplo.com" value={inviteForm.email} onChange={event => setInviteForm(current => ({ ...current, email: event.target.value }))} className="rounded-xl border border-surface-line px-3 py-2 text-sm md:col-span-2" />
        <select aria-label="Perfil do convite" value={inviteForm.accountType} onChange={event => setInviteForm(current => ({ ...current, accountType: event.target.value as InviteManagementCardProps['inviteForm']['accountType'] }))} className="rounded-xl border border-surface-line px-3 py-2 text-sm">
          <option value="STUDENT_INSTITUTION">Aluno</option>
          <option value="TEACHER">Professor</option>
          <option value="COORDINATOR">Coordenador</option>
        </select>
        {inviteForm.accountType === 'TEACHER' ? <input aria-label="Disciplina do professor" placeholder="Disciplina" value={inviteForm.subject} onChange={event => setInviteForm(current => ({ ...current, subject: event.target.value }))} className="rounded-xl border border-surface-line px-3 py-2 text-sm" /> : <div />}
      </div>
      <Button size="sm" className="mt-3" disabled={inviteBusy || !inviteForm.email.trim() || (inviteForm.accountType === 'TEACHER' && !inviteForm.subject.trim())} onClick={() => onCreate(workspaceId)}>Enviar convite</Button>
      <div className="mt-5 space-y-2">
        {invites.map(invite => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-line p-3">
          <div><p className="text-sm font-medium text-graphite">{[invite.user.profile?.firstName, invite.user.profile?.lastName].filter(Boolean).join(' ') || invite.user.email}</p><p className="text-xs text-graphite-400">{invite.user.email} · convidado(a) como {invite.role.name}</p></div>
          <Button size="sm" variant="outline" disabled={inviteBusy} onClick={() => onRevoke(workspaceId, invite.id)}>Revogar</Button>
        </div>)}
        {!invites.length && <p className="text-sm text-graphite-400">Nenhum convite pendente.</p>}
      </div>
    </Card>
  );
}

/** A partir de quantos % de acerto uma matéria é ponto forte, e abaixo de
 *  quantos ela pede atenção. Entre os dois, não é nem uma coisa nem outra. */
const STRONG_ACCURACY = 70;
const ATTENTION_ACCURACY = 60;

export function Dashboard() {
  const { user } = useAuth();
  const isStudent = user?.accountType === 'STUDENT_INDEPENDENT' || user?.accountType === 'STUDENT_INSTITUTION';
  const panel = MANAGEMENT_PANELS[user?.accountType ?? 'STUDENT_INDEPENDENT'];
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<StudySession | null>(null);
  const [schedule, setSchedule] = useState<StudySchedule | null>(null);
  const [progress, setProgress] = useState<StudyProgressSummary | null>(null);
  const [evolution, setEvolution] = useState<ProgressEvolutionPoint[]>([]);
  const [performance, setPerformance] = useState<PerformanceBreakdown | null>(null);
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);
  const [essays, setEssays] = useState<EssaySummary[]>([]);
  const [questionHistory, setQuestionHistory] = useState<QuestionProgressItem[]>([]);
  const [reviewQueue, setReviewQueue] = useState<QuestionProgressItem[]>([]);
  const [reviewQueueError, setReviewQueueError] = useState(false);
  const [notebook, setNotebook] = useState<ErrorNotebookSummary | null>(null);
  const [notebookError, setNotebookError] = useState(false);
  const [teacherDashboard, setTeacherDashboard] = useState<TeacherDashboard | null>(null);
  const [coordinatorDashboard, setCoordinatorDashboard] = useState<CoordinatorDashboard | null>(null);
  const [directorDashboard, setDirectorDashboard] = useState<DirectorDashboard | null>(null);
  const [directorBusyId, setDirectorBusyId] = useState('');
  const [directorError, setDirectorError] = useState('');
  const [memberSubjects, setMemberSubjects] = useState<Record<string, string>>({});
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [periodForm, setPeriodForm] = useState({ name: '', startsAt: '', endsAt: '' });
  const [periodBusy, setPeriodBusy] = useState(false);
  const [periodError, setPeriodError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [inviteAccepting, setInviteAccepting] = useState(false);
  const [inviteAcceptError, setInviteAcceptError] = useState('');
  const [invites, setInvites] = useState<InstitutionInvite[]>([]);
  const [inviteForm, setInviteForm] = useState<{ email: string; accountType: 'STUDENT_INSTITUTION' | 'TEACHER' | 'COORDINATOR'; subject: string }>({ email: '', accountType: 'STUDENT_INSTITUTION', subject: '' });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    // Independe do cargo — qualquer conta pode ter sido convidada para uma
    // instituição (a mudança de accountType só acontece ao ACEITAR, não ao
    // ser convidado).
    const token = getAccessToken();
    if (!token) return;
    apiPendingInvite(token).then(setPendingInvite).catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    if (user?.accountType === 'DIRECTOR') {
      const token = getAccessToken();
      if (!token) return;
      apiDirectorDashboard(token).then((dashboard) => {
        setDirectorDashboard(dashboard);
        void apiListInstitutionInvites(token, dashboard.workspaceId).then(setInvites).catch(() => undefined);
      }).catch(() => undefined).finally(() => setLoading(false));
      return;
    }
    if (user?.accountType === 'COORDINATOR') {
      const token = getAccessToken();
      if (!token) return;
      Promise.all([apiCoordinatorDashboard(token), apiCoordinatorPeriods(token)]).then(([dashboard, periods]) => {
        setCoordinatorDashboard(dashboard);
        setAcademicPeriods(periods);
        void apiListInstitutionInvites(token, dashboard.workspaceId).then(setInvites).catch(() => undefined);
      }).catch(() => undefined).finally(() => setLoading(false));
      return;
    }
    if (user?.accountType === 'TEACHER') {
      const token = getAccessToken();
      if (!token) return;
      let active = true;
      const load = () => apiTeacherDashboard(token).then(data => { if (active) setTeacherDashboard(data); }).catch(() => undefined).finally(() => { if (active) setLoading(false); });
      void load();
      const interval = window.setInterval(() => void load(), 30000);
      return () => { active = false; window.clearInterval(interval); };
    }
    if (!isStudent) { setLoading(false); return; }
    const token = getAccessToken();
    if (!token) return;
    Promise.allSettled([apiGetDailySession(token, localDateKey()),apiGetProgress(token), apiGetQuestionPerformance(token), apiSimulations(token), apiEssays(token), apiGetQuestionProgress(token), apiGetReviewQuestions(token), apiGetErrorNotebookSummary(token)])
      .then(([daily, progressData, performanceData, simulationData, essayData, questionsData, reviewData, notebookData]) => {
        if (daily.status === 'fulfilled') { setSession(daily.value?.session ?? null); setSchedule(daily.value?.schedule ?? null); }
        if (progressData.status === 'fulfilled') { setProgress(progressData.value.summary); setEvolution(progressData.value.evolution ?? []); }
        if (performanceData.status === 'fulfilled') setPerformance(performanceData.value);
        if (simulationData.status === 'fulfilled') setSimulations(simulationData.value);
        if (essayData.status === 'fulfilled') setEssays(essayData.value.items);
        if (questionsData.status === 'fulfilled') setQuestionHistory(questionsData.value.items);
        if (reviewData.status === 'fulfilled') { setReviewQueue(reviewData.value.items); setReviewQueueError(false); }
        // Falhou? A interface diz que não carregou — senão afirmaria "nada
        // marcado para revisar" quando é a fila que não veio.
        else setReviewQueueError(true);
        if (notebookData.status === 'fulfilled') { setNotebook(notebookData.value); setNotebookError(false); }
        else setNotebookError(true);
      })
      .finally(() => setLoading(false));
  }, [isStudent, user?.accountType]);

  const tasks = session?.tasks ?? [];
  const completedToday = tasks.filter((task) => task.status === "DONE").length;
  const pendingTasks = tasks.filter((task) => task.status !== "DONE");
  const completion = useMemo(() => !progress?.totalTasks ? 0 : Math.min(100, Math.round((progress.completedTasks / progress.totalTasks) * 100)), [progress]);
  const todayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  const subjectPerformance = performance?.bySubject.slice(0, 5) ?? [];
  // Só entra matéria com respostas suficientes para dizer alguma coisa. E
  // cada rótulo tem a sua faixa: sem isso, com uma matéria só (ou todas bem),
  // a mesma matéria com 100% aparecia como ponto forte E ponto de atenção.
  const ratedSubjects = subjectPerformance.filter((item) => item.totalAttempts >= 3);
  const strongestSubject = ratedSubjects
    .filter((item) => item.accuracy >= STRONG_ACCURACY)
    .sort((a, b) => b.accuracy - a.accuracy)[0];
  const attentionSubject = ratedSubjects
    .filter((item) => item.accuracy < ATTENTION_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy)[0];
  const recentResults = simulations.filter((item) => item.result).slice(0, 3);
  const nextSimulations = simulations.filter((item) => !item.result).slice(0, 3);
  const topicPerformance = performance?.byTopic.slice(0, 5) ?? [];
  const recommendation = attentionSubject
    ? { title: `Reforce ${attentionSubject.subject}`, detail: `Sua taxa atual é ${attentionSubject.accuracy}%. Uma rodada curta de questões pode ajudar.`, to: '/app/questoes' }
    : pendingTasks[0]
      ? { title: pendingTasks[0].title, detail: 'Concluir a próxima atividade mantém seu cronograma em dia.', to: '/app/cronograma' }
      : { title: 'Faça um diagnóstico', detail: 'Responda algumas questões para receber recomendações baseadas no seu desempenho.', to: '/app/questoes' };
  const maxStudyMinutes = Math.max(1, ...evolution.map((item) => item.studyMinutes));
  const directorWeakestSubject = directorDashboard?.bySubject[0];
  const directorWeakestClass = directorDashboard?.classes.filter(item => item.submissionCount > 0).sort((a, b) => a.accuracy - b.accuracy)[0];
  const directorMaxAccuracy = Math.max(1, ...(directorDashboard?.evolution.map(item => item.accuracy) ?? []));

  function exportTeacherReport() {
    if (!teacherDashboard) return;
    const rows = [['Turma', 'Aluno', 'E-mail', 'Entregas', 'Desempenho', 'Alerta']];
    for (const classRoom of teacherDashboard.classes) for (const student of classRoom.students) rows.push([classRoom.name, student.name, student.email, String(student.submissions), String(student.accuracy) + '%', student.alert ? 'Atenção' : 'Regular']);
    const csv = rows.map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'relatorio-turmas.csv'; link.click(); URL.revokeObjectURL(url);
  }

  function exportCoordinatorReport() {
    if (!coordinatorDashboard) return;
    const rows = [['Turma', 'Alunos', 'Entregas', 'Desempenho'], ...coordinatorDashboard.classes.map(item => [item.name, String(item.studentCount), String(item.submissionCount), String(item.accuracy) + '%']), [], ['Disciplina', 'Respostas', 'Desempenho'], ...coordinatorDashboard.bySubject.map(item => [item.subject, String(item.attempts), String(item.accuracy) + '%'])];
    const csv = rows.map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'relatorio-coordenacao.csv'; link.click(); URL.revokeObjectURL(url);
  }

  function exportDirectorReport() {
    if (!directorDashboard) return;
    const rows = [
      ['Instituição', directorDashboard.institutionName],
      ['Turmas', String(directorDashboard.summary.classCount)],
      ['Alunos', String(directorDashboard.summary.studentCount)],
      ['Membros ativos', String(directorDashboard.summary.activeMemberCount)],
      ['Média institucional', String(directorDashboard.summary.averageAccuracy) + '%'],
      [],
      ['Turma', 'Alunos', 'Entregas', 'Desempenho'],
      ...directorDashboard.classes.map(item => [item.name, String(item.studentCount), String(item.submissionCount), String(item.accuracy) + '%']),
      [],
      ['Mês', 'Entregas', 'Desempenho'],
      ...directorDashboard.evolution.map(item => [item.month, String(item.submissions), String(item.accuracy) + '%']),
      [],
      ['Usuário', 'E-mail', 'Perfil', 'Cargo', 'Status'],
      ...directorDashboard.members.map(item => [item.name, item.email, item.accountType, item.role, item.status]),
    ];
    const csv = rows.map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'relatorio-direcao.csv'; link.click(); URL.revokeObjectURL(url);
  }

  async function updateDirectorMember(memberId: string, data: { status?: 'ACTIVE' | 'SUSPENDED'; accountType?: 'TEACHER' | 'COORDINATOR'; subject?: string }) {
    const token = getAccessToken();
    if (!token) return;
    setDirectorBusyId(memberId); setDirectorError('');
    try {
      await apiUpdateDirectorMember(token, memberId, data);
      setDirectorDashboard(await apiDirectorDashboard(token));
    } catch (error) {
      setDirectorError(error instanceof Error ? error.message : 'Não foi possível atualizar o usuário.');
    } finally {
      setDirectorBusyId('');
    }
  }

  async function createAcademicPeriod() {
    const token = getAccessToken();
    if (!token || !periodForm.name.trim() || !periodForm.startsAt || !periodForm.endsAt) return;
    setPeriodBusy(true); setPeriodError('');
    try { await apiCreateCoordinatorPeriod(token, periodForm); setAcademicPeriods(await apiCoordinatorPeriods(token)); setPeriodForm({ name: '', startsAt: '', endsAt: '' }); }
    catch (error) { setPeriodError(error instanceof Error ? error.message : 'Não foi possível criar o período.'); }
    finally { setPeriodBusy(false); }
  }

  async function setAcademicPeriodActive(id: string, active: boolean) {
    const token = getAccessToken(); if (!token) return;
    setPeriodBusy(true); setPeriodError('');
    try { await apiUpdateCoordinatorPeriod(token, id, active); setAcademicPeriods(await apiCoordinatorPeriods(token)); }
    catch (error) { setPeriodError(error instanceof Error ? error.message : 'Não foi possível atualizar o período.'); }
    finally { setPeriodBusy(false); }
  }

  async function acceptPendingInvite() {
    const token = getAccessToken(); if (!token) return;
    setInviteAccepting(true); setInviteAcceptError('');
    try {
      await apiAcceptInvite(token);
      // O accountType mudou no backend — recarrega pra AuthContext/rotas
      // de painel refletirem o cargo novo desde o primeiro render.
      window.location.reload();
    } catch (error) {
      setInviteAcceptError(error instanceof Error ? error.message : 'Não foi possível aceitar o convite.');
      setInviteAccepting(false);
    }
  }

  async function createInvite(workspaceId: string) {
    const token = getAccessToken();
    if (!token || !inviteForm.email.trim()) return;
    setInviteBusy(true); setInviteError('');
    try {
      await apiCreateInstitutionInvite(token, workspaceId, { email: inviteForm.email.trim(), accountType: inviteForm.accountType, subject: inviteForm.accountType === 'TEACHER' ? inviteForm.subject.trim() : undefined });
      setInvites(await apiListInstitutionInvites(token, workspaceId));
      setInviteForm({ email: '', accountType: 'STUDENT_INSTITUTION', subject: '' });
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Não foi possível enviar o convite.');
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvite(workspaceId: string, memberId: string) {
    const token = getAccessToken(); if (!token) return;
    setInviteBusy(true); setInviteError('');
    try { await apiRevokeInstitutionInvite(token, workspaceId, memberId); setInvites(await apiListInstitutionInvites(token, workspaceId)); }
    catch (error) { setInviteError(error instanceof Error ? error.message : 'Não foi possível revogar o convite.'); }
    finally { setInviteBusy(false); }
  }

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
            <div><p className="text-xs font-medium capitalize text-graphite-400">{todayLabel}</p><p className="text-sm font-semibold text-graphite">{panel?.title ?? 'Seu espaço de estudos'}</p></div>
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
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" />{panel?.title ?? 'Foco de hoje'}</span>
                <h1 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">Olá, {user?.firstName || "estudante"}. {panel?.headline ?? 'Vamos avançar um pouco hoje?'}</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">{panel ? 'Seu acesso respeita o cargo e as permissões atribuídas em cada instituição e turma.' : pendingTasks.length > 0 ? `Você tem ${pendingTasks.length} ${pendingTasks.length === 1 ? "atividade planejada" : "atividades planejadas"} para hoje.` : "Organize seu próximo bloco de estudos e mantenha sua evolução constante."}</p>
              </div>
              <Link to={panel ? '/app/simulados' : '/app/cronograma'}><Button className="w-full sm:w-auto"><BookOpenCheck className="h-4 w-4" />{panel?.action ?? (pendingTasks.length ? "Começar sessão" : "Planejar estudos")}<ArrowRight className="h-4 w-4" /></Button></Link>
            </div>
          </section>

          {pendingInvite && <section className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-5" aria-label="Convite institucional pendente">
            <p className="text-sm font-semibold text-graphite">Você foi convidado para <strong>{pendingInvite.institutionName}</strong> como <strong>{pendingInvite.roleName}</strong>.</p>
            {inviteAcceptError && <p role="alert" className="mt-2 text-sm text-red-700">{inviteAcceptError}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={inviteAccepting} onClick={() => void acceptPendingInvite()}>{inviteAccepting ? 'Aceitando…' : 'Aceitar convite'}</Button>
              <Button size="sm" variant="outline" onClick={() => setPendingInvite(null)}>Ignorar por agora</Button>
            </div>
          </section>}

          {panel && <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Ações de gestão">
            <Card className="bg-white"><h2 className="font-semibold text-graphite">Acesso por instituição</h2><p className="mt-2 text-sm text-graphite-400">Somente workspaces em que seu vínculo está ativo.</p></Card>
            <Card className="bg-white"><h2 className="font-semibold text-graphite">Acesso por turma</h2><p className="mt-2 text-sm text-graphite-400">Turmas coordenadas, lecionadas ou concedidas pelo cargo.</p></Card>
            <Card className="bg-white"><h2 className="font-semibold text-graphite">Dados de alunos</h2><p className="mt-2 text-sm text-graphite-400">Visíveis apenas quando há vínculo com a turma ou permissão institucional.</p></Card>
          </section>}

          {user?.accountType === 'DIRECTOR' && <section className="mt-6 space-y-6" aria-label="Painel da direção">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold text-graphite">{directorDashboard?.institutionName ?? 'Instituição'}</p><p className="text-xs text-graphite-400">Visão acadêmica, operacional e estratégica consolidada</p></div><Button size="sm" variant="outline" onClick={exportDirectorReport} disabled={!directorDashboard}>Exportar relatório CSV</Button></div>
            {directorError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{directorError}</p>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{[
              { label: 'Turmas', value: directorDashboard?.summary.classCount ?? 0, icon: School },
              { label: 'Alunos', value: directorDashboard?.summary.studentCount ?? 0, icon: Users },
              { label: 'Professores', value: directorDashboard?.summary.teacherCount ?? 0, icon: UserRound },
              { label: 'Entregas', value: directorDashboard?.summary.submissionCount ?? 0, icon: BookOpenCheck },
              { label: 'Média institucional', value: String(directorDashboard?.summary.averageAccuracy ?? 0) + '%', icon: TrendingUp },
              { label: 'Membros ativos', value: directorDashboard?.summary.activeMemberCount ?? 0, icon: CheckCircle2 },
            ].map(({ label, value, icon: Icon }) => <Card key={label} className="bg-white p-4"><Icon className="h-5 w-5 text-primary-700" /><p className="mt-3 text-2xl font-bold text-graphite">{value}</p><p className="text-xs text-graphite-400">{label}</p></Card>)}</div>
            <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
              <Card className="bg-white"><h2 className="text-lg font-semibold text-graphite">Evolução das turmas</h2><p className="mt-1 text-xs text-graphite-400">Desempenho mensal consolidado das entregas</p>{directorDashboard?.evolution.length ? <div className="mt-6 flex h-44 items-end gap-3">{directorDashboard.evolution.map(item => <div key={item.month} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-semibold text-graphite-500">{item.accuracy}%</span><div className="w-full rounded-t bg-primary/75" style={{ height: String(Math.max(8, item.accuracy / directorMaxAccuracy * 100)) + '%' }} title={item.submissions + ' entregas'} /><span className="text-[10px] text-graphite-400">{item.month.slice(5)}/{item.month.slice(2, 4)}</span></div>)}</div> : <p className="mt-5 rounded-xl bg-surface-card p-5 text-sm text-graphite-400">A evolução aparecerá após as primeiras entregas.</p>}</Card>
              <Card className="bg-graphite text-white"><Lightbulb className="h-6 w-6 text-primary" /><p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Visão estratégica</p><h2 className="mt-2 text-xl font-semibold">{directorWeakestClass ? 'Priorize ' + directorWeakestClass.name : 'Acompanhe a evolução institucional'}</h2><p className="mt-2 text-sm leading-relaxed text-white/60">{directorWeakestClass ? 'A turma está com ' + directorWeakestClass.accuracy + '% de desempenho consolidado.' : 'Os direcionamentos aparecerão quando houver resultados das turmas.'}</p>{directorWeakestSubject && <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm">Disciplina com maior oportunidade: <strong>{directorWeakestSubject.subject}</strong> ({directorWeakestSubject.accuracy}%).</p>}</Card>
            </div>
            <Card className="bg-white"><h2 className="text-lg font-semibold text-graphite">Desempenho acadêmico por turma</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{directorDashboard?.classes.map(classRoom => <div key={classRoom.id} className="rounded-xl border border-surface-line p-4"><div className="flex justify-between gap-4"><div><p className="font-semibold text-graphite">{classRoom.name}</p><p className="text-xs text-graphite-400">{classRoom.studentCount} alunos · {classRoom.submissionCount} entregas</p></div><span className="text-lg font-bold">{classRoom.accuracy}%</span></div><div className="mt-3 h-2 rounded-full bg-surface-card"><div className="h-2 rounded-full bg-primary" style={{ width: String(classRoom.accuracy) + '%' }} /></div></div>)}{!directorDashboard?.classes.length && <p className="text-sm text-graphite-400">Nenhuma turma institucional disponível.</p>}</div></Card>
            <Card className="bg-white p-0"><div className="border-b border-surface-line px-6 py-5"><h2 className="text-lg font-semibold text-graphite">Gestão de professores e coordenadores</h2><p className="mt-1 text-xs text-graphite-400">Ative, suspenda e altere o perfil dos membros da instituição.</p></div><div className="overflow-x-auto p-6"><table className="w-full min-w-[840px] text-left text-sm"><thead className="text-xs text-graphite-400"><tr><th className="pb-3 font-medium">Usuário</th><th className="pb-3 font-medium">Perfil</th><th className="pb-3 font-medium">Cargo</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Ações</th></tr></thead><tbody className="divide-y divide-surface-line">{directorDashboard?.members.map(member => { const isSelf = member.userId === user?.id; return <tr key={member.id}><td className="py-3"><p className="font-medium text-graphite">{member.name}</p><p className="text-xs text-graphite-400">{member.email}</p></td><td className="py-3">{member.accountType === 'TEACHER' ? 'Professor' : member.accountType === 'COORDINATOR' ? 'Coordenador' : member.accountType === 'DIRECTOR' ? 'Diretor' : member.accountType}</td><td className="py-3">{member.role}</td><td className="py-3"><span className={member.status === 'ACTIVE' ? 'rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success' : 'rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700'}>{member.status === 'ACTIVE' ? 'Ativo' : 'Suspenso'}</span></td><td className="py-3"><div className="flex items-center gap-2">{member.accountType === 'TEACHER' ? <Button size="sm" variant="outline" disabled={isSelf || directorBusyId === member.id} onClick={() => void updateDirectorMember(member.id, { accountType: 'COORDINATOR' })}>Tornar coordenador</Button> : member.accountType === 'COORDINATOR' ? <><input aria-label={'Disciplina de ' + member.name} placeholder="Disciplina" value={memberSubjects[member.id] ?? ''} onChange={event => setMemberSubjects(current => ({ ...current, [member.id]: event.target.value }))} className="w-32 rounded-lg border border-surface-line px-2 py-1.5 text-xs" /><Button size="sm" variant="outline" disabled={isSelf || directorBusyId === member.id || !(memberSubjects[member.id] ?? '').trim()} onClick={() => void updateDirectorMember(member.id, { accountType: 'TEACHER', subject: memberSubjects[member.id].trim() })}>Tornar professor</Button></> : null}<Button size="sm" variant="outline" disabled={isSelf || directorBusyId === member.id} onClick={() => void updateDirectorMember(member.id, { status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{member.status === 'ACTIVE' ? 'Suspender' : 'Ativar'}</Button></div></td></tr>; })}</tbody></table>{!directorDashboard?.members.length && <p className="py-5 text-sm text-graphite-400">Nenhum membro institucional disponível.</p>}</div></Card>
            {directorDashboard && <InviteManagementCard workspaceId={directorDashboard.workspaceId} invites={invites} inviteForm={inviteForm} setInviteForm={setInviteForm} inviteBusy={inviteBusy} inviteError={inviteError} onCreate={createInvite} onRevoke={revokeInvite} />}
          </section>}

          {user?.accountType === 'COORDINATOR' && <section className="mt-6 space-y-6" aria-label="Painel da coordenação">
            <div className="flex items-center justify-between gap-4"><p className="text-xs text-graphite-400">Indicadores pedagógicos consolidados da instituição</p><Button size="sm" variant="outline" onClick={exportCoordinatorReport} disabled={!coordinatorDashboard?.classes.length}>Exportar relatório CSV</Button></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[
              { label: 'Turmas', value: coordinatorDashboard?.summary.classCount ?? 0, icon: School },
              { label: 'Alunos', value: coordinatorDashboard?.summary.studentCount ?? 0, icon: Users },
              { label: 'Professores', value: coordinatorDashboard?.summary.teacherCount ?? 0, icon: UserRound },
              { label: 'Média institucional', value: String(coordinatorDashboard?.summary.averageAccuracy ?? 0) + '%', icon: TrendingUp },
              { label: 'Alunos em atenção', value: coordinatorDashboard?.summary.studentsAtRisk ?? 0, icon: AlertTriangle },
            ].map(({ label, value, icon: Icon }) => <Card key={label} className="bg-white p-4"><Icon className="h-5 w-5 text-primary-700" /><p className="mt-3 text-2xl font-bold text-graphite">{value}</p><p className="text-xs text-graphite-400">{label}</p></Card>)}</div>
            <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]"><Card className="bg-white"><h2 className="text-lg font-semibold text-graphite">Comparação entre turmas</h2><div className="mt-4 space-y-3">{coordinatorDashboard?.classes.map(classRoom => <div key={classRoom.id} className="rounded-xl border border-surface-line p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold text-graphite">{classRoom.name}</p><p className="text-xs text-graphite-400">{classRoom.studentCount} alunos · {classRoom.submissionCount} entregas</p></div><span className="text-xl font-bold">{classRoom.accuracy}%</span></div><div className="mt-3 h-2 rounded-full bg-surface-card"><div className="h-2 rounded-full bg-primary" style={{ width: String(classRoom.accuracy) + '%' }} /></div></div>)}{!coordinatorDashboard?.classes.length && <p className="text-sm text-graphite-400">Nenhuma turma institucional disponível.</p>}</div></Card>
              <Card className="bg-white"><h2 className="text-lg font-semibold text-graphite">Desempenho por disciplina</h2><div className="mt-4 space-y-3">{coordinatorDashboard?.bySubject.slice(0, 6).map(item => <div key={item.subject} className="flex items-center justify-between rounded-xl bg-surface-card p-4"><div><p className="text-sm font-semibold">{item.subject}</p><p className="text-xs text-graphite-400">{item.attempts} respostas</p></div><span className="font-bold">{item.accuracy}%</span></div>)}{!coordinatorDashboard?.bySubject.length && <p className="text-sm text-graphite-400">Aguardando resultados das turmas.</p>}</div></Card></div>
            <Card className="bg-white"><h2 className="text-lg font-semibold text-graphite">Acompanhamento dos professores</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{coordinatorDashboard?.teachers.map(teacher => <div key={teacher.id} className="rounded-xl border border-surface-line p-4"><p className="font-semibold text-graphite">{teacher.name}</p><p className="text-xs text-graphite-400">{teacher.subject}</p><p className="mt-3 text-sm">{teacher.classes.join(', ') || 'Sem turma ativa'}</p></div>)}{!coordinatorDashboard?.teachers.length && <p className="text-sm text-graphite-400">Nenhum professor vinculado.</p>}</div></Card>
            <Card className="bg-white"><h2 className="text-lg font-semibold text-graphite">Períodos letivos</h2><p className="mt-1 text-xs text-graphite-400">Cadastre o período vigente e preserve o histórico institucional.</p>{periodError && <p role="alert" className="mt-3 text-sm text-red-700">{periodError}</p>}<div className="mt-4 grid gap-3 md:grid-cols-4"><input aria-label="Nome do período" placeholder="Ex.: 2026.2" value={periodForm.name} onChange={event => setPeriodForm(current => ({ ...current, name: event.target.value }))} className="rounded-xl border border-surface-line px-3 py-2 text-sm" /><input aria-label="Início do período" type="date" value={periodForm.startsAt} onChange={event => setPeriodForm(current => ({ ...current, startsAt: event.target.value }))} className="rounded-xl border border-surface-line px-3 py-2 text-sm" /><input aria-label="Fim do período" type="date" value={periodForm.endsAt} onChange={event => setPeriodForm(current => ({ ...current, endsAt: event.target.value }))} className="rounded-xl border border-surface-line px-3 py-2 text-sm" /><Button disabled={periodBusy || !periodForm.name.trim() || !periodForm.startsAt || !periodForm.endsAt} onClick={() => void createAcademicPeriod()}>Criar período</Button></div><div className="mt-5 space-y-2">{academicPeriods.map(period => <div key={period.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-line p-4"><div><p className="font-semibold text-graphite">{period.name}</p><p className="text-xs text-graphite-400">{formatCalendarDate(period.startsAt)} a {formatCalendarDate(period.endsAt)}</p></div><button type="button" disabled={periodBusy} onClick={() => void setAcademicPeriodActive(period.id, !period.active)} className={`rounded-full px-3 py-1 text-xs font-semibold ${period.active ? 'bg-success/10 text-success' : 'bg-surface-card text-graphite-400'}`}>{period.active ? 'Vigente' : 'Ativar'}</button></div>)}{!academicPeriods.length && <p className="text-sm text-graphite-400">Nenhum período letivo cadastrado.</p>}</div></Card>
            {coordinatorDashboard && <InviteManagementCard workspaceId={coordinatorDashboard.workspaceId} invites={invites} inviteForm={inviteForm} setInviteForm={setInviteForm} inviteBusy={inviteBusy} inviteError={inviteError} onCreate={createInvite} onRevoke={revokeInvite} />}
          </section>}
          {user?.accountType === 'TEACHER' && <section className="mt-6 space-y-6" aria-label="Painel do professor">
            <div className="flex items-center justify-between gap-4"><p className="text-xs text-graphite-400">Atualização automática a cada 30 segundos</p><Button size="sm" variant="outline" onClick={exportTeacherReport} disabled={!teacherDashboard?.classes.length}>Exportar relatório CSV</Button></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[
              { label: 'Turmas', value: teacherDashboard?.summary.classCount ?? 0, icon: School },
              { label: 'Alunos', value: teacherDashboard?.summary.studentCount ?? 0, icon: Users },
              { label: 'Correções', value: teacherDashboard?.summary.submissionCount ?? 0, icon: BookOpenCheck },
              { label: 'Média geral', value: String(teacherDashboard?.summary.averageAccuracy ?? 0) + '%', icon: TrendingUp },
              { label: 'Precisam de atenção', value: teacherDashboard?.summary.studentsAtRisk ?? 0, icon: AlertTriangle },
            ].map(({ label, value, icon: Icon }) => <Card key={label} className="bg-white p-4"><Icon className="h-5 w-5 text-primary-700" /><p className="mt-3 text-2xl font-bold text-graphite">{value}</p><p className="text-xs text-graphite-400">{label}</p></Card>)}</div>
            {loading ? <Card className="h-40 animate-pulse bg-white" /> : teacherDashboard?.classes.length ? teacherDashboard.classes.map(classRoom => <Card key={classRoom.id} className="bg-white p-0">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-line px-6 py-5"><div><h2 className="text-lg font-semibold text-graphite">{classRoom.name}</h2><p className="mt-1 text-xs text-graphite-400">{classRoom.studentCount} alunos · {classRoom.simulationCount} atividades/provas · código {classRoom.joinCode}</p></div><div className="text-right"><p className="text-2xl font-bold text-graphite">{classRoom.accuracy}%</p><p className="text-xs text-graphite-400">média da turma</p></div></div>
              <div className="grid gap-6 p-6 lg:grid-cols-[1.5fr_1fr]"><div><h3 className="text-sm font-semibold text-graphite">Desempenho dos alunos</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-graphite-400"><tr><th className="pb-3 font-medium">Aluno</th><th className="pb-3 font-medium">Entregas</th><th className="pb-3 font-medium">Desempenho</th><th className="pb-3 font-medium">Situação</th></tr></thead><tbody className="divide-y divide-surface-line">{classRoom.students.map(student => <tr key={student.id}><td className="py-3"><p className="font-medium text-graphite">{student.name}</p><p className="text-xs text-graphite-400">{student.email}</p></td><td className="py-3">{student.submissions}</td><td className="py-3 font-semibold">{student.accuracy}%</td><td className="py-3">{student.alert ? <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700">Atenção</span> : student.submissions ? <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">Em dia</span> : <span className="text-xs text-graphite-400">Sem entregas</span>}</td></tr>)}</tbody></table>{!classRoom.students.length && <p className="rounded-xl bg-surface-card p-4 text-sm text-graphite-400">Compartilhe o código da turma para adicionar alunos.</p>}</div></div>
                <div><h3 className="text-sm font-semibold text-graphite">Conteúdos com baixo desempenho</h3><div className="mt-3 space-y-3">{classRoom.weakSubjects.slice(0, 5).map(subject => <div key={subject.subject} className="rounded-xl bg-surface-card p-4"><div className="flex justify-between gap-3"><p className="text-sm font-medium text-graphite">{subject.subject}</p><span className="text-sm font-bold">{subject.accuracy}%</span></div><p className="mt-1 text-xs text-graphite-400">{subject.attempts} respostas analisadas</p></div>)}{!classRoom.weakSubjects.length && <p className="rounded-xl bg-surface-card p-4 text-sm text-graphite-400">Os alertas aparecem após as primeiras correções.</p>}</div></div></div>
            </Card>) : <Card className="bg-white text-center"><School className="mx-auto h-8 w-8 text-primary-700" /><h2 className="mt-3 font-semibold text-graphite">Crie sua primeira turma</h2><p className="mt-2 text-sm text-graphite-400">Use a área de simulados para criar uma turma, compartilhar o código e publicar atividades.</p><Link to="/app/simulados" className="mt-5 inline-flex"><Button>Criar turma ou atividade</Button></Link></Card>}
          </section>}
          {isStudent && <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5" aria-label="Resumo de desempenho">
            {metrics.map(({ label, value, detail, icon: Icon, color }) => (
              <Card key={label} className="bg-white p-4 sm:p-5"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}><Icon className="h-[18px] w-[18px]" /></div><p className="mt-4 text-xl font-bold text-graphite sm:text-2xl">{value}</p><p className="mt-0.5 text-xs font-medium text-graphite-500 sm:text-sm">{label}</p><p className="mt-1 hidden text-xs text-graphite-400 sm:block">{detail}</p></Card>
            ))}
          </section>}

          {isStudent && <section className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
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
          </section>}

          {isStudent && <section className="mt-6" aria-labelledby="subject-performance-title">
            <Card className="bg-white p-0">
              <div className="flex flex-col gap-3 border-b border-surface-line px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 id="subject-performance-title" className="text-lg font-semibold text-graphite">Progresso por matéria</h2><p className="mt-1 text-xs text-graphite-400">Desempenho calculado a partir das questões respondidas</p></div>
                {performance && performance.summary.totalAttempts > 0 && <span className="w-fit rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary-700">{performance.summary.accuracy}% de acertos gerais</span>}
              </div>
              <div className="p-6">
                {loading ? <div className="space-y-4">{[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-graphite/5" />)}</div> : subjectPerformance.length > 0 ? <>
                  <div className="space-y-5">{subjectPerformance.map((item) => <div key={item.subject}>
                    <div className="mb-2 flex items-center justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-graphite">{item.subject}</p><p className="text-xs text-graphite-400">{item.correct} de {item.totalAttempts} respostas corretas</p></div><span className="text-sm font-bold text-graphite">{item.accuracy}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-card"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.accuracy}%` }} /></div>
                  </div>)}</div>
                  {(strongestSubject || attentionSubject) && <div className="mt-7 grid gap-3 border-t border-surface-line pt-5 sm:grid-cols-2">
                    {strongestSubject && <div className="rounded-xl bg-success/10 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-success">Ponto forte</p><p className="mt-1 text-sm font-semibold text-graphite">{strongestSubject.subject}</p><p className="mt-1 text-xs text-graphite-400">{strongestSubject.accuracy}% de acertos em {strongestSubject.totalAttempts} questões</p></div>}
                    {attentionSubject && <div className="rounded-xl bg-orange-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Ponto de atenção</p><p className="mt-1 text-sm font-semibold text-graphite">{attentionSubject.subject}</p><p className="mt-1 text-xs text-graphite-400">Pratique mais para elevar os atuais {attentionSubject.accuracy}%</p></div>}
                  </div>}
                </> : <div className="flex flex-col items-center px-4 py-9 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15"><TrendingUp className="h-6 w-6 text-primary-700" /></span><h3 className="mt-4 font-semibold text-graphite">Seu desempenho aparecerá aqui</h3><p className="mt-2 max-w-md text-sm text-graphite-400">Responda questões para acompanhar a evolução por matéria e identificar onde concentrar seus estudos.</p><Link to="/app/questoes" className="mt-5"><Button size="sm">Responder questões</Button></Link></div>}
              </div>
            </Card>
          </section>}

          {isStudent && <section className="mt-6 grid gap-6 xl:grid-cols-3" aria-label="Resultados, simulados e caderno de erros">
            <Card className="bg-white"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-graphite">Notas recentes</h2><p className="mt-1 text-xs text-graphite-400">Seus últimos simulados corrigidos</p></div><Award className="h-5 w-5 text-primary-700" /></div>
              <div className="mt-5 space-y-3">{recentResults.length ? recentResults.map((item) => <Link key={item.id} to={`/app/simulados?id=${item.id}`} className="flex items-center justify-between rounded-xl border border-surface-line p-4 hover:border-primary/50"><div><p className="text-sm font-semibold text-graphite">{item.title}</p><p className="mt-1 text-xs text-graphite-400">{new Date(item.result!.submittedAt).toLocaleDateString('pt-BR')} · {item.result!.correct} de {item.result!.total} acertos</p></div><span className="text-xl font-bold text-graphite">{Math.round((item.result!.correct / item.result!.total) * 100)}%</span></Link>) : <p className="rounded-xl bg-surface-card p-5 text-sm text-graphite-400">Conclua um simulado para registrar sua primeira nota.</p>}</div>
            </Card>
            <Card className="bg-white"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-graphite">Próximos simulados</h2><p className="mt-1 text-xs text-graphite-400">Avaliações disponíveis para responder</p></div><BookOpenCheck className="h-5 w-5 text-primary-700" /></div>
              <div className="mt-5 space-y-3">{nextSimulations.length ? nextSimulations.map((item) => <Link key={item.id} to={`/app/simulados?id=${item.id}`} className="group flex items-center justify-between rounded-xl border border-surface-line p-4 hover:border-primary/50"><div><p className="text-sm font-semibold text-graphite">{item.title}</p><p className="mt-1 text-xs text-graphite-400">{item.questionCount} questões{item.className ? ` · ${item.className}` : ''}</p></div><ArrowRight className="h-4 w-4 text-graphite-300 group-hover:text-primary-700" /></Link>) : <p className="rounded-xl bg-surface-card p-5 text-sm text-graphite-400">Nenhum simulado pendente no momento.</p>}</div>
            </Card>
            <Card className="bg-white" data-notebook-summary><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-graphite">Caderno de erros</h2><p className="mt-1 text-xs text-graphite-400">O que você errou e ainda precisa refazer</p></div><NotebookPen className="h-5 w-5 text-primary-700" /></div>
              {notebook ? <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-surface-line p-4"><p className="text-sm text-graphite-500">Abertas</p><span className="text-xl font-bold text-graphite">{notebook.open}</span></div>
                <div className="flex items-center justify-between rounded-xl border border-surface-line p-4"><p className="text-sm text-graphite-500">Para revisar hoje</p><span className={`text-xl font-bold ${notebook.dueToday ? 'text-orange-600' : 'text-graphite'}`}>{notebook.dueToday}</span></div>
                <div className="flex items-center justify-between rounded-xl border border-surface-line p-4"><p className="text-sm text-graphite-500">Sem motivo classificado</p><span className="text-xl font-bold text-graphite">{notebook.withoutReason}</span></div>
                <p className="text-xs text-graphite-400">{notebook.mastered} {notebook.mastered === 1 ? 'questão já dominada' : 'questões já dominadas'}.</p>
              </div> : <p className="mt-5 rounded-xl bg-surface-card p-5 text-sm text-graphite-400">{notebookError ? 'Não foi possível carregar o caderno de erros.' : 'Carregando seu caderno de erros...'}</p>}
              <Link to="/app/caderno-de-erros" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-primary-700">Abrir caderno de erros <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Card>
          </section>}

          {isStudent && <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]" aria-label="Assuntos e recomendação">
            <Card className="bg-white"><h2 className="text-lg font-semibold text-graphite">Progresso por assunto e habilidade</h2><p className="mt-1 text-xs text-graphite-400">Competências praticadas nas questões</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">{topicPerformance.length ? topicPerformance.map((item) => <div key={item.topic} className="rounded-xl border border-surface-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-graphite">{item.topic}</p><p className="mt-1 text-xs text-graphite-400">{item.totalAttempts} tentativas</p></div><span className="text-sm font-bold text-primary-700">{item.accuracy}%</span></div></div>) : <p className="col-span-full rounded-xl bg-surface-card p-5 text-sm text-graphite-400">Os assuntos praticados aparecerão após suas primeiras respostas.</p>}</div>
            </Card>
            <Card className="bg-graphite text-white"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15"><Lightbulb className="h-5 w-5 text-primary" /></div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Recomendação personalizada</p><h2 className="mt-2 text-xl font-semibold">{recommendation.title}</h2><p className="mt-2 text-sm leading-relaxed text-white/55">{recommendation.detail}</p><Link to={recommendation.to} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">Começar agora <ArrowRight className="h-4 w-4" /></Link></Card>
          </section>}

          {isStudent && <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]" aria-label="Histórico de estudos e meta acadêmica">
            <Card className="bg-white"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-graphite">Histórico de estudos</h2><p className="mt-1 text-xs text-graphite-400">Minutos registrados nos últimos dias</p></div><History className="h-5 w-5 text-primary-700" /></div>
              {evolution.length ? <div className="mt-6 flex h-36 items-end gap-2" aria-label="Gráfico de tempo estudado">{evolution.slice(-14).map((item) => <div key={item.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="hidden text-[10px] font-semibold text-graphite-400 group-hover:block">{item.studyMinutes}m</span><div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(6, (item.studyMinutes / maxStudyMinutes) * 100)}%` }} title={`${item.studyMinutes} minutos em ${new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}`} /><span className="text-[9px] text-graphite-300">{new Date(`${item.date}T12:00:00`).getDate()}</span></div>)}</div> : <p className="mt-5 rounded-xl bg-surface-card p-5 text-sm text-graphite-400">Registre tempo nas tarefas para visualizar sua evolução diária.</p>}
            </Card>
            <Card className="bg-white"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-graphite">Meta acadêmica</h2><p className="mt-1 text-xs text-graphite-400">Seu objetivo principal</p></div><Target className="h-5 w-5 text-primary-700" /></div><div className="mt-5 space-y-3"><div className="rounded-xl bg-surface-card p-4"><p className="text-xs text-graphite-400">Curso desejado</p><p className="mt-1 text-sm font-semibold text-graphite">{user?.desiredCourse || 'Defina no seu perfil'}</p></div><div className="rounded-xl bg-surface-card p-4"><p className="text-xs text-graphite-400">Universidade ou vestibular</p><p className="mt-1 text-sm font-semibold text-graphite">{user?.targetUniversity || schedule?.objective || 'Defina no seu perfil ou cronograma'}</p></div></div></Card>
          </section>}

          {isStudent && <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Históricos recentes">
            <Card className="bg-white"><div className="flex items-center gap-3"><Database className="h-5 w-5 text-primary-700" /><h2 className="font-semibold text-graphite">Histórico de questões</h2></div><div className="mt-4 space-y-3">{questionHistory.slice(0, 3).map((item) => <div key={item.questionId}><p className="truncate text-sm font-medium text-graphite">{item.subject} · {item.topic || 'Geral'}</p><p className="text-xs text-graphite-400">{item.accuracy}% de acertos · {item.attempts} tentativas</p></div>)}{!questionHistory.length && <p className="text-sm text-graphite-400">Sem questões respondidas.</p>}</div><Link to="/app/questoes" className="mt-5 inline-flex text-xs font-semibold text-primary-700">Abrir banco de questões</Link></Card>
            <Card className="bg-white"><div className="flex items-center gap-3"><BookOpenCheck className="h-5 w-5 text-primary-700" /><h2 className="font-semibold text-graphite">Histórico de simulados</h2></div><div className="mt-4 space-y-3">{recentResults.map((item) => <div key={item.id}><p className="truncate text-sm font-medium text-graphite">{item.title}</p><p className="text-xs text-graphite-400">{item.result!.correct}/{item.result!.total} acertos · {new Date(item.result!.submittedAt).toLocaleDateString('pt-BR')}</p></div>)}{!recentResults.length && <p className="text-sm text-graphite-400">Sem simulados concluídos.</p>}</div><Link to="/app/simulados" className="mt-5 inline-flex text-xs font-semibold text-primary-700">Ver simulados</Link></Card>
            <Card className="bg-white"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-primary-700" /><h2 className="font-semibold text-graphite">Histórico de redações</h2></div><div className="mt-4 space-y-3">{essays.slice(0, 3).map((item) => <div key={item.id}><p className="truncate text-sm font-medium text-graphite">{item.title || 'Redação sem título'}</p><p className="text-xs text-graphite-400">{item.wordCount} palavras · versão {item.version}</p></div>)}{!essays.length && <p className="text-sm text-graphite-400">Sem redações salvas.</p>}</div><Link to="/app/redacoes" className="mt-5 inline-flex text-xs font-semibold text-primary-700">Ver redações</Link></Card>
            <Card className="bg-white" data-review-queue><div className="flex items-center gap-3"><Bookmark className="h-5 w-5 text-primary-700" /><h2 className="font-semibold text-graphite">Para revisar</h2></div><div className="mt-4 space-y-3">{reviewQueue.slice(0, 3).map((item) => <div key={item.questionId}><p className="truncate text-sm font-medium text-graphite">{item.subject} · {item.topic || 'Geral'}</p><p className="text-xs text-graphite-400">{item.attempts ? `${item.accuracy}% de acertos · ${item.attempts} tentativa${item.attempts === 1 ? '' : 's'}` : 'Ainda não respondida'}</p></div>)}{!reviewQueue.length && <p className="text-sm text-graphite-400">{reviewQueueError ? "Não foi possível carregar a fila de revisão." : 'Nada marcado para revisar. Use o botão "Revisar depois" no banco de questões.'}</p>}</div><Link to="/app/questoes" className="mt-5 inline-flex text-xs font-semibold text-primary-700">Abrir banco de questões</Link></Card>
          </section>}
        </div>
      </main>
    </div>
  );
}
