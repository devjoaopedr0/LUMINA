import { API_URL } from "@/lib/config";
import { clearTokens, getRefreshToken, setTokens } from "@/lib/auth";

export interface ApiUser {
  id: string;
  email: string;
  emailVerified: boolean;
  status: string;
  lastLogin: string | null;
  createdAt: string;
  hasPassword: boolean;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  phone: string | null;
  birthDate: string | null;
  bio: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// O access token dura pouco de propósito (JWT_EXPIRES_IN, hoje 15min). Sem
// isto, toda sessão morria nesse prazo com um 401 cru e sem aviso — o
// usuário continuava "logado" na tela (o header nunca soube que expirou)
// enquanto cronograma/questões/perfil simplesmente paravam de funcionar.
type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/** AuthContext se inscreve nisto para reagir quando a sessão morre de vez
 * (refresh token também expirado/inválido) — api.ts é um módulo comum, sem
 * acesso ao React, então avisa por este pub-sub simples em vez de importar
 * o contexto. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function notifySessionExpired(): void {
  sessionExpiredListeners.forEach((listener) => listener());
}

// Nestes três, um 401 é resposta de negócio normal (senha errada, refresh
// token expirado/inválido) — nunca deve disparar o fluxo de refresh, ou toda
// tentativa de login errada viraria uma tentativa de refresh também.
const AUTH_ENDPOINTS_WITHOUT_RETRY = new Set(["/auth/login", "/auth/register", "/auth/refresh"]);

// Garante que N chamadas simultâneas tomando 401 ao mesmo tempo disparem só
// UM refresh, não uma corrida de N POSTs em /auth/refresh.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    const data = JSON.parse(text) as AuthResponse;
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Access token expirado/inválido numa chamada autenticada: tenta renovar
  // com o refresh token (uma única vez) antes de desistir. Só a chamada
  // original é reexecutada — o caller nem fica sabendo que houve um refresh
  // no meio do caminho.
  const authHeader = (options.headers as Record<string, string> | undefined)?.Authorization;
  if (res.status === 401 && !isRetry && authHeader && !AUTH_ENDPOINTS_WITHOUT_RETRY.has(path)) {
    refreshInFlight ??= refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
    const newAccessToken = await refreshInFlight;

    if (newAccessToken) {
      return request<T>(
        path,
        { ...options, headers: { ...options.headers, Authorization: `Bearer ${newAccessToken}` } },
        true,
      );
    }

    clearTokens();
    notifySessionExpired();
    throw new ApiError(401, "Sua sessão expirou. Faça login novamente.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(" ")
      : (body?.message ?? "Não foi possível completar a operação.");
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;

  // NestJS trata um controller que retorna `null` (ex: "busque o cronograma
  // ou null se não existir") do mesmo jeito que `undefined`: o Express manda
  // o corpo vazio (Content-Length: 0), sem o literal "null" — não é só no
  // 204. `res.json()` nesse corpo lança "Unexpected end of JSON input" e
  // quebra qualquer Promise.all que dependa dele. Lendo como texto primeiro
  // cobre os dois casos com segurança, para qualquer endpoint que devolva um
  // recurso-ou-null.
  const text = await res.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

export function apiRegister(payload: {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return request("/auth/register", { method: "POST", body: JSON.stringify(payload) });
}

export function apiLogin(payload: { email: string; password: string }): Promise<AuthResponse> {
  return request("/auth/login", { method: "POST", body: JSON.stringify(payload) });
}

export function apiMe(accessToken: string): Promise<ApiUser> {
  return request("/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function apiSetPassword(accessToken: string, password: string): Promise<ApiUser> {
  return request("/auth/set-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
}

export function apiForgotPassword(email: string): Promise<void> {
  return request("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function apiResetPassword(token: string, password: string): Promise<void> {
  return request("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export function apiVerifyEmail(accessToken: string, code: string): Promise<ApiUser> {
  return request("/auth/verify-email", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ code }),
  });
}

export function apiResendVerification(accessToken: string): Promise<void> {
  return request("/auth/resend-verification", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  bio?: string | null;
}

export function apiUpdateProfile(
  accessToken: string,
  payload: UpdateProfilePayload
): Promise<ApiUser> {
  return request('/users/me/profile', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
}

export type QuestionDifficulty = "FACIL" | "MEDIA" | "DIFICIL";

export interface QuestionAlternative {
  id: string;
  text: string;
  position: number;
  isCorrect?: boolean;
}

export interface Question {
  id: string;
  subject: string;
  topic: string;
  subjectId?: string | null;
  topicId?: string | null;
  examId?: string | null;
  difficulty: QuestionDifficulty;
  exam: string;
  year: number | null;
  examNumber: number | null;
  stem: string;
  alternatives: QuestionAlternative[];
  canManage?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectWithTopics extends Subject {
  topics: Topic[];
}

export interface Exam {
  id: string;
  name: string;
  year: number | null;
  institution: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedExams {
  items: Exam[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface PaginatedQuestions {
  items: Question[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  canManageBank?: boolean;
}

export interface QuestionImportReport {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  errors: number;
  details: Array<{
    index: number;
    sourceId: string | null;
    type: "invalid" | "duplicate" | "error";
    message: string;
  }>;
}

export interface QuestionFilters {
  subject?: string;
  topic?: string;
  subjectId?: string;
  topicId?: string;
  difficulty?: QuestionDifficulty;
  exam?: string;
  examId?: string;
  year?: number;
  page?: number;
  limit?: number;
}

export interface QuestionAlternativePayload {
  text: string;
  isCorrect: boolean;
}

export interface QuestionPayload {
  subject: string;
  topic: string;
  subjectId?: string;
  topicId?: string;
  difficulty: QuestionDifficulty;
  exam: string;
  examId?: string;
  year?: number | null;
  examNumber?: number | null;
  stem: string;
  alternatives: QuestionAlternativePayload[];
}

export interface AttemptResult {
  isCorrect: boolean;
  selectedPosition: number;
  correctPosition: number;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export function apiListQuestions(
  accessToken: string,
  filters: QuestionFilters = {}
): Promise<PaginatedQuestions> {
  const params = new URLSearchParams();
  if (filters.subjectId) params.set("subjectId", filters.subjectId);
  else if (filters.subject) params.set("subject", filters.subject);
  if (filters.topicId) params.set("topicId", filters.topicId);
  else if (filters.topic) params.set("topic", filters.topic);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.examId) params.set("examId", filters.examId);
  else if (filters.exam) params.set("exam", filters.exam);
  if (filters.year) params.set("year", String(filters.year));
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return request(`/questions${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(accessToken),
  });
}

export function apiGetQuestion(
  accessToken: string,
  id: string,
  includeAnswer = false
): Promise<Question> {
  const qs = includeAnswer ? "?includeAnswer=true" : "";
  return request(`/questions/${id}${qs}`, { headers: authHeaders(accessToken) });
}

export function apiCreateQuestion(
  accessToken: string,
  payload: QuestionPayload
): Promise<Question> {
  return request("/questions", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiUpdateQuestion(
  accessToken: string,
  id: string,
  payload: Partial<QuestionPayload>
): Promise<Question> {
  return request(`/questions/${id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiDeleteQuestion(accessToken: string, id: string): Promise<void> {
  return request(`/questions/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export function apiImportQuestionFile(
  accessToken: string,
  fileName: string,
  content: string,
  target: "PERSONAL" | "BANK" = "BANK"
): Promise<QuestionImportReport> {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  let body: Record<string, unknown>;
  if (isCsv) {
    body = { content, target };
  } else {
    const parsed: unknown = JSON.parse(content);
    const questions = Array.isArray(parsed)
      ? parsed
      : (parsed as { questions?: unknown })?.questions;
    if (!Array.isArray(questions)) {
      throw new Error('O JSON deve conter uma lista ou um objeto com a chave "questions".');
    }
    body = { questions, target };
  }
  return request(`/questions/import/${isCsv ? "csv" : "json"}`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function apiListSubjects(accessToken: string): Promise<Subject[]> {
  return request("/subjects", { headers: authHeaders(accessToken) });
}

export function apiGetSubjectTopics(
  accessToken: string,
  subjectId: string
): Promise<SubjectWithTopics> {
  return request(`/subjects/${subjectId}/topics`, { headers: authHeaders(accessToken) });
}

export function apiListExams(
  accessToken: string,
  page = 1,
  limit = 1000
): Promise<PaginatedExams> {
  return request(`/exams?page=${page}&limit=${limit}`, { headers: authHeaders(accessToken) });
}

export function apiAnswerQuestion(
  accessToken: string,
  id: string,
  selectedPosition: number
): Promise<AttemptResult> {
  return request(`/questions/${id}/attempt`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ selectedPosition }),
  });
}

// =============================================================================
// Cronograma de Estudos
// =============================================================================

export type StudyTaskStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export type StudyScheduleStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface StudySubject {
  id: string;
  name: string;
  code: string;
  displayOrder: number;
}

export interface StudyScheduleSubjectTarget {
  subjectId: string;
  targetHours: number;
}

export interface StudySchedule {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  studyDays: number[];
  dailyMinutes: number;
  objective: string | null;
  status: StudyScheduleStatus;
  createdAt: string;
  updatedAt: string;
  scheduleSubjects: {
    subjectId: string;
    targetHours: number;
    subject: StudySubject;
  }[];
}

export interface StudyTask {
  id: string;
  scheduleId: string;
  sessionId: string;
  subjectId: string | null;
  title: string;
  description: string | null;
  status: StudyTaskStatus;
  scheduledMinutes: number;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  subjectName?: string;
  loggedMinutes?: number;
}

export interface StudySession {
  id: string;
  scheduleId: string;
  date: string;
  scheduledMinutes: number;
  tasks: StudyTask[];
  subjects: StudySubject[];
}

export interface StudyProgressSummary {
  id: string;
  scheduleId: string;
  completedMinutes: number;
  totalScheduledMinutes: number;
  streakDays: number;
  lastStudyDate: string | null;
  completedTasks: number;
  totalTasks: number;
  updatedAt: string;
}

export interface ProgressEvolutionPoint {
  date: string;
  studyMinutes: number;
  completedTasks: number;
}

export interface PaginatedTasks {
  items: StudyTask[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserVestibular {
  id: string;
  userId: string;
  examId: string | null;
  customName: string | null;
  targetDate: string | null;
  exam?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateStudySchedulePayload {
  startDate: string;
  endDate: string;
  studyDays: number[];
  dailyMinutes: number;
  objective?: string;
  subjects: StudyScheduleSubjectTarget[];
}

export interface CreateStudyTaskPayload {
  sessionId: string;
  subjectId?: string;
  title: string;
  description?: string;
  scheduledMinutes: number;
}

export interface UpdateStudyTaskPayload {
  subjectId?: string;
  title?: string;
  description?: string;
  status?: string;
  scheduledMinutes?: number;
  notes?: string | null;
}

export function apiListStudySubjects(accessToken: string): Promise<StudySubject[]> {
  return request("/study/subjects", { headers: authHeaders(accessToken) });
}

export function apiGetStudySchedule(accessToken: string): Promise<StudySchedule | null> {
  return request("/study/schedule", { headers: authHeaders(accessToken) });
}

export function apiCreateStudySchedule(
  accessToken: string,
  payload: CreateStudySchedulePayload
): Promise<{ ok: boolean }> {
  return request("/study/schedule", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiUpdateStudySchedule(
  accessToken: string,
  id: string,
  payload: Partial<CreateStudySchedulePayload>
): Promise<StudySchedule | null> {
  return request(`/study/schedule/${id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiDeleteStudySchedule(accessToken: string, id: string): Promise<{ ok: boolean }> {
  return request(`/study/schedule/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export function apiGetDailySession(
  accessToken: string,
  date?: string
): Promise<{ schedule: StudySchedule; session: StudySession | null } | null> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return request(`/study/daily${qs}`, { headers: authHeaders(accessToken) });
}

export function apiListTasks(
  accessToken: string,
  params: { status?: string; subjectId?: string; page?: number; limit?: number }
): Promise<PaginatedTasks | null> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.subjectId) query.set("subjectId", params.subjectId);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return request(`/study/tasks${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(accessToken),
  });
}

export function apiCreateTask(
  accessToken: string,
  payload: CreateStudyTaskPayload
): Promise<StudyTask> {
  return request("/study/tasks", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiUpdateTask(
  accessToken: string,
  id: string,
  payload: UpdateStudyTaskPayload
): Promise<StudyTask | null> {
  return request(`/study/tasks/${id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiDeleteTask(accessToken: string, id: string): Promise<{ ok: boolean }> {
  return request(`/study/tasks/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export function apiCompleteTask(accessToken: string, id: string): Promise<StudyTask | null> {
  return request(`/study/tasks/${id}/complete`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
  });
}

export function apiRescheduleTask(
  accessToken: string,
  id: string,
  sessionId: string
): Promise<StudyTask | null> {
  return request(`/study/tasks/${id}/reschedule`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ sessionId }),
  });
}

export function apiLogTime(
  accessToken: string,
  id: string,
  durationMinutes: number
): Promise<any> {
  return request(`/study/tasks/${id}/timer`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ durationMinutes }),
  });
}

export function apiGetProgress(
  accessToken: string
): Promise<{ summary: StudyProgressSummary | null; evolution: ProgressEvolutionPoint[] | null }> {
  return request("/study/progress", { headers: authHeaders(accessToken) });
}

export function apiRescheduleMissed(
  accessToken: string,
  date: string
): Promise<{ rescheduled: number } | null> {
  return request("/study/reschedule-missed", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ date }),
  });
}

export function apiGetUserVestibular(accessToken: string): Promise<UserVestibular | null> {
  return request("/user/vestibular", { headers: authHeaders(accessToken) });
}

export function apiSetVestibular(
  accessToken: string,
  payload: {
    examId?: string;
    customName?: string;
    targetDate?: string;
  }
): Promise<UserVestibular> {
  return request("/user/vestibular", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}
