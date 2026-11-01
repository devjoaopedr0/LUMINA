import { API_URL } from "@/lib/config";
import { clearTokens, getRefreshToken, setTokens } from "@/lib/auth";
import { ApiError, createApiClient } from "@/lib/api-client-core";

export { ApiError } from "@/lib/api-client-core";

export interface ApiUser {
  accountType: 'STUDENT_INDEPENDENT' | 'STUDENT_INSTITUTION' | 'TEACHER' | 'COORDINATOR' | 'DIRECTOR' | 'ADMIN';
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
  educationLevel: string | null;
  schoolYear: number | null;
  schoolName: string | null;
  desiredCourse: string | null;
  targetUniversity: string | null;
  /** Modalidade de concorrência no Sisu; null = ampla concorrência. */
  sisuModality?: SisuModality | null;
  preferredStudyPeriod: string | null;
  studySessionMinutes: number | null;
  weeklyStudyDays: number | null;
  teacherSubject: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

// O access token dura pouco de propósito (JWT_EXPIRES_IN, hoje 15min). Sem
// isto, toda sessão morria nesse prazo com um 401 cru e sem aviso — o
// usuário continuava "logado" na tela (o header nunca soube que expirou)
// enquanto cronograma/questões/perfil simplesmente paravam de funcionar.
const apiClient = createApiClient({
  baseUrl: API_URL,
  getRefreshToken,
  setTokens,
  clearTokens,
  fetch: (...args) => fetch(...args),
});

export const onSessionExpired = apiClient.onSessionExpired;
const request = apiClient.request;

export interface EssaySummary { id: string; title: string; theme: string; version: number; wordCount: number; createdAt: string; updatedAt: string }
export interface Essay extends EssaySummary { content: string }
export interface EssayRevisionSummary { id: string; version: number; title: string; theme: string; wordCount: number; createdAt: string }
export interface EssayRevision extends EssayRevisionSummary { content: string }
export interface EssayPage<T> { items: T[]; page: number; hasMore: boolean }
const essayHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
export const apiEssayCreate = (token: string): Promise<Essay> => request('/essays', { method: 'POST', headers: essayHeaders(token) });
export const apiEssays = (token: string, page = 1): Promise<EssayPage<EssaySummary>> => request(`/essays?page=${page}`, { headers: essayHeaders(token) });
export const apiEssay = (token: string, id: string): Promise<Essay> => request(`/essays/${id}`, { headers: essayHeaders(token) });
export interface EssayTheme { id: string; title: string; exam: string; year: number | null; sourceUrl: string | null; createdBy: string | null }
export const apiEssayThemes = (token: string, year?: number): Promise<EssayTheme[]> => request(`/essays/themes${year ? `?year=${year}` : ''}`, { headers: essayHeaders(token) });
export const apiEssayThemeCreate = (token: string, title: string): Promise<EssayTheme> => request('/essays/themes', { method: 'POST', headers: essayHeaders(token), body: JSON.stringify({ title }) });
export const apiEssaySave = (token: string, id: string, data: { title: string; theme: string; content: string; version: number }): Promise<Essay> => request(`/essays/${id}`, { method: 'PUT', headers: essayHeaders(token), body: JSON.stringify(data) });
export const apiEssayRevisions = (token: string, id: string, page = 1): Promise<EssayPage<EssayRevisionSummary>> => request(`/essays/${id}/revisions?page=${page}`, { headers: essayHeaders(token) });
export const apiEssayRevision = (token: string, id: string, version: number): Promise<EssayRevision> => request(`/essays/${id}/revisions/${version}`, { headers: essayHeaders(token) });

// ---- Scanner de redação e correção pelas competências do Enem ----
export type EssayScanStatus = 'PROCESSING' | 'READY' | 'CONFIRMED' | 'FAILED';
export interface EssayScanLine { number: number; text: string; paragraphStart: boolean; illegibleWords: number }
export interface EssayScan {
  id: string;
  status: EssayScanStatus;
  theme: string;
  title: string | null;
  text: string | null;
  lines: EssayScanLine[] | null;
  lineCount: number | null;
  illegibleWords: number | null;
  confidence: number | null;
  model: string | null;
  warnings: string[];
  errorMessage: string | null;
  essayId: string | null;
  pages: { index: number; mimeType: string; sizeBytes: number }[];
  createdAt: string;
  updatedAt: string;
}
export type EssayCorrectionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export interface EssayCompetencyResult {
  competency: 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
  score: number;
  level: string;
  justification: string | null;
  evidence: string[];
  citations: { id: string; title: string; citation: string }[];
}
export interface EssayCorrection {
  essayId: string;
  status: EssayCorrectionStatus | null;
  outdated?: boolean;
  totalScore?: number | null;
  confidence?: number | null;
  generalFeedback?: string | null;
  annulment?: { code: string; explanation: string; citation: string } | null;
  errorMessage?: string | null;
  method?: 'dois-avaliadores' | 'tres-avaliadores' | 'modelo-estatistico' | 'regra' | null;
  calibrated?: boolean;
  discrepancy?: { total: number; maxCompetency: number; thirdEvaluator: boolean } | null;
  evaluators?: { evaluator: string; model: string | null; total: number }[];
  analysis?: { lines: number; linesSource: 'ocr' | 'estimativa'; words: number; paragraphs: number; warnings: string[] } | null;
  competencies?: EssayCompetencyResult[];
  updatedAt?: string;
}
export const apiEssayScanCreate = (token: string, pages: string[], theme: string): Promise<{ id: string; status: EssayScanStatus }> =>
  request('/essay-scans', { method: 'POST', headers: essayHeaders(token), body: JSON.stringify({ pages, theme }) });
export const apiEssayScan = (token: string, id: string): Promise<EssayScan> => request(`/essay-scans/${id}`, { headers: essayHeaders(token) });
export const apiEssayScanRetry = (token: string, id: string): Promise<{ id: string; status: EssayScanStatus }> => request(`/essay-scans/${id}/retry`, { method: 'POST', headers: essayHeaders(token) });
export const apiEssayScanConfirm = (token: string, id: string, data: { text: string; theme: string; title?: string }): Promise<{ essayId: string; correction: EssayCorrection }> =>
  request(`/essay-scans/${id}/confirm`, { method: 'POST', headers: essayHeaders(token), body: JSON.stringify(data) });
export const apiEssayScanDeleteImages = (token: string, id: string): Promise<{ deletedPages: number }> => request(`/essay-scans/${id}/pages`, { method: 'DELETE', headers: essayHeaders(token) });
/** A página é binária (JPEG): busca fora do cliente JSON e devolve um object URL. */
export async function apiEssayScanPageUrl(token: string, id: string, index: number): Promise<string> {
  const response = await fetch(`${API_URL}/essay-scans/${id}/pages/${index}`, { headers: essayHeaders(token) });
  if (!response.ok) throw new ApiError(response.status, 'Não foi possível carregar a foto.');
  return URL.createObjectURL(await response.blob());
}
export const apiEssayCorrectionRequest = (token: string, essayId: string): Promise<EssayCorrection> => request(`/essays/${essayId}/correction`, { method: 'POST', headers: essayHeaders(token) });
export const apiEssayCorrection = (token: string, essayId: string): Promise<EssayCorrection> => request(`/essays/${essayId}/correction`, { headers: essayHeaders(token) });

export interface MathSummary { total: number; correct: number; accuracy: number; averageMs: number }
export interface MathAttempt { left: number; right: number; operation: string; answer: number; submitted: number | null; correct: boolean; elapsedMs: number; level: number }
export interface MathSession {
  id: string; mode: 'free' | 'daily'; completed: boolean; version: number;
  level: number; streak: number; bestStreak: number; totalQuestions: number; remainingMs: number;
  question: { left: number; right: number; operation: string } | null;
  attempts: MathAttempt[]; summary: MathSummary;
}
export interface MathHistory {
  summary: MathSummary;
  operations: (MathSummary & { operation: string })[];
  sessions: (MathSummary & { id: string; mode: string; createdAt: string })[];
}
export function apiMathStart(token: string, mode: 'free' | 'daily'): Promise<MathSession> {
  return request('/mental-math/sessions', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ mode }) });
}
export function apiMathSession(token: string, id: string): Promise<MathSession> {
  return request(`/mental-math/sessions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}
export function apiMathAnswer(token: string, id: string, version: number, answer: number | null): Promise<MathSession> {
  return request(`/mental-math/sessions/${id}/answers`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ version, answer }) });
}
export function apiMathHistory(token: string): Promise<MathHistory> {
  return request('/mental-math/history', { headers: { Authorization: `Bearer ${token}` } });
}

export function apiRegister(payload: {
  institution?: { name: string; email: string; phone?: string };
  accountType?: 'STUDENT_INDEPENDENT' | 'TEACHER';
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  teacherSubject?: string;
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
  educationLevel?: string | null;
  schoolYear?: number | null;
  schoolName?: string | null;
  desiredCourse?: string | null;
  targetUniversity?: string | null;
  sisuModality?: SisuModality | null;
  preferredStudyPeriod?: string | null;
  studySessionMinutes?: number | null;
  weeklyStudyDays?: number | null;
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
  /** Por que a alternativa está errada. Só vem na visão de autor e no
   * resultado da tentativa — na tela de responder viria junto o gabarito. */
  explanation?: string | null;
}

/** Estado do aluno na questão. Vem null quando ele ainda não interagiu. */
export interface QuestionUserProgress {
  attempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  lastAttemptAt: string | null;
  isFavorite: boolean;
  markedForReview: boolean;
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
  sourcePdf?: { url: string; page: number } | null;
  stem: string;
  explanation?: string | null;
  stats?: QuestionStats | null;
  progress?: QuestionUserProgress | null;
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

export type QuestionSort = 'newest' | 'oldest' | 'year_desc' | 'year_asc';

export interface QuestionFilters {
  search?: string;
  examNumber?: number;
  subject?: string;
  topic?: string;
  subjectId?: string;
  topicId?: string;
  difficulty?: QuestionDifficulty;
  exam?: string;
  examId?: string;
  year?: number;
  sort?: QuestionSort;
  page?: number;
  limit?: number;
}

export interface QuestionAlternativePayload {
  text: string;
  isCorrect: boolean;
  /** Por que esta alternativa está errada (opcional). */
  explanation?: string;
}

export interface QuestionPayload {
  subject: string;
  topic: string;
  subjectId?: string;
  topicId?: string;
  difficulty: QuestionDifficulty;
  exam?: string;
  examId?: string;
  year?: number | null;
  examNumber?: number | null;
  stem: string;
  explanation?: string;
  alternatives: QuestionAlternativePayload[];
}

/** Explicação de uma alternativa, entregue só depois da resposta. */
export interface AlternativeFeedback {
  position: number;
  text: string;
  isCorrect: boolean;
  selected: boolean;
  explanation: string;
}

export interface AttemptResult {
  isCorrect: boolean;
  selectedPosition: number;
  correctPosition: number;
  explanations?: AlternativeFeedback[];
  stats?: QuestionStats | null;
  /** Estado da questão no caderno de erros depois desta tentativa. Vem junto
   * para a interface não precisar de uma segunda chamada ao responder. */
  errorNotebook?: ErrorNotebookEntry | null;
}

/** Dica que destrava a questão sem revelar a resposta. */
export interface QuestionHint {
  level: number;
  hint: string;
  provider: string;
  maxLevel: number;
}

export interface QuestionStats {
  attempts: number;
  correct: number;
  accuracyPercent: number;
}

export interface SimilarQuestions {
  items: Question[];
  limit: number;
}

export interface PerformanceBreakdown {
  summary: { totalAttempts: number; correct: number; accuracy: number };
  bySubject: Array<{
    subjectId: string | null;
    subject: string;
    totalAttempts: number;
    correct: number;
    accuracy: number;
  }>;
  byTopic: Array<{
    topicId: string | null;
    topic: string;
    totalAttempts: number;
    correct: number;
    accuracy: number;
  }>;
}

export interface QuestionProgressItem {
  questionId: string;
  subject: string;
  topic: string;
  exam: string;
  year: number | null;
  stem: string;
  attempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  lastAttemptAt: string | null;
  isFavorite: boolean;
  markedForReview: boolean;
  accuracy: number;
}

export interface QuestionProgressPage {
  items: QuestionProgressItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export function apiChangePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<void> {
  return request('/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function apiLogoutAll(accessToken: string): Promise<void> {
  return request('/auth/logout-all', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
}

export interface AuthSession { id: string; createdAt: string; lastUsedAt: string; current: boolean }
export const apiListAuthSessions = (token: string): Promise<AuthSession[]> => request('/auth/sessions', { headers: authHeaders(token) });
export const apiRevokeAuthSession = (token: string, id: string): Promise<void> => request(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders(token) });

export interface WorkspaceAccess {
  workspace: { id: string; name: string; type: 'PERSONAL' | 'INSTITUTION' };
  role: { id: string; name: string };
  permissions: string[];
}
export interface WorkspaceRole { id: string; name: string; description: string | null; isSystem: boolean }
export const apiMyWorkspaceAccess = (token: string): Promise<WorkspaceAccess[]> => request('/workspaces/me/access', { headers: authHeaders(token) });
export const apiWorkspaceRoles = (token: string, workspaceId: string): Promise<WorkspaceRole[]> => request(`/workspaces/${encodeURIComponent(workspaceId)}/roles`, { headers: authHeaders(token) });
export interface WorkspacePermission { id: string; code: string; name: string; description: string | null }
export const apiWorkspacePermissions = (token: string, workspaceId: string): Promise<WorkspacePermission[]> => request(`/workspaces/${encodeURIComponent(workspaceId)}/permissions`, { headers: authHeaders(token) });
export const apiCreateWorkspaceRole = (token: string, workspaceId: string, data: { name: string; description: string; permissionCodes: string[] }): Promise<WorkspaceRole> => request(`/workspaces/${encodeURIComponent(workspaceId)}/roles`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) });
export const apiSetWorkspaceRolePermissions = (token: string, workspaceId: string, roleId: string, permissionCodes: string[]): Promise<{ id: string; permissionCodes: string[] }> => request(`/workspaces/${encodeURIComponent(workspaceId)}/roles/${encodeURIComponent(roleId)}/permissions`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ permissionCodes }) });

export interface SimulationClass { id: string; name: string; joinCode: string | null; isTeacher: boolean }
export type AssessmentType = 'ACTIVITY' | 'LIST' | 'TEST' | 'SIMULATION' | 'ADAPTIVE';
export interface SimulationSummary { id: string; title: string; createdAt: string; assessmentType: AssessmentType; dueAt: string | null; durationMinutes: number | null; isRealExam: boolean; enemDay?: number | null; className: string | null; questionCount: number; result: { correct: number; total: number; submittedAt: string } | null }
export interface SimulationItem { id: string; position: number; stem: string; subject: string; area: string | null; alternatives: { position: number; text: string }[]; correctPosition?: number }
export interface Simulation { id: string; title: string; createdAt: string; assessmentType: AssessmentType; dueAt: string | null; durationMinutes: number | null; isRealExam: boolean; enemDay?: number | null; className: string | null; sheetVersion: number; answerSheetTemplateId: string | null; items: SimulationItem[] }
/** Nota estilo TRI de um simulado, por área do ENEM. É uma aproximação: o
 *  modelo é o da prova, mas os parâmetros das questões vêm da dificuldade
 *  cadastrada, não de calibração oficial. */
export interface SimulationTri {
  /** 1 ou 2 quando é um simulado modelo ENEM; null nos demais. */
  enemDay: number | null;
  areas: { area: StudyArea; label: string; correct: number; total: number; score: number; low: number; high: number; lowConfidence: boolean }[];
  /** Média das áreas — só no simulado modelo ENEM. */
  average: number | null;
}
export interface SimulationResult { id: string; simulationId: string; correct: number; total: number; submittedAt: string; startedAt: string | null; timeSpentMinutes: number | null; tri?: SimulationTri | null; items: { position: number; subject: string; area: string | null; selectedPosition: number; correctPosition: number; isCorrect: boolean }[] }

// Adaptive Simulation (item 16)
export interface AdaptiveSessionSummary {
  id: string;
  examId: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  estimatedAbility: number;
  startedAt: string;
  finishedAt: string | null;
  stepsCount: number;
}
export interface AdaptiveNextQuestion {
  questionId: string;
  stem: string;
  subject: string;
  topic: string;
  difficulty: QuestionDifficulty;
  alternatives: { position: number; text: string }[];
  skill: string;
  subSkill?: string;
}
export interface AdaptiveAnswerResult {
  isCorrect: boolean;
  correctPosition: number;
  abilityBefore: number;
  abilityAfter: number;
  skill: string;
  estimatedAbility: number;
  finished: boolean;
  diagnosis?: Array<{ skill: string; correct: number; total: number; ability: number }>;
}
export interface AdaptiveSessionSummaryDetail {
  sessionId: string;
  status: string;
  estimatedAbility: number;
  steps: number;
  skills: Array<{ skill: string; correct: number; total: number; accuracy: number; ability: number }>;
  strongAreas: string[];
  weakAreas: string[];
  startedAt: string;
  finishedAt: string | null;
}

// Question Scanner (item 18)
export interface QuestionScanUploadUrlResponseDto {
  uploadUrl: string;
  uploadId: string;
  key: string;
  expiresIn: number;
}
export interface QuestionScanUploadResponseDto {
  id: string;
  userId: string;
  fileUrl: string;
  metaJson: { width: number; height: number; mimeType?: string; sizeBytes: number };
  status: string;
  createdAt: string;
  processing?: QuestionScanProcessingResponseDto | null;
}
export interface QuestionScanProcessingResponseDto {
  id: string;
  uploadId: string;
  stemText: string | null;
  alternativesJson: { position: number; text: string }[] | null;
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  explanationJson: Record<string, string> | null;
  confidence: number | null;
  warningsJson: string[] | null;
  status: string;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  result?: { id: string; questionId: string | null; errorNotebookEntryId: string | null; savedAt: string } | null;
}
export interface QuestionScanUploadResponseDtoList {
  id: string;
  userId: string;
  fileUrl: string;
  metaJson: { width: number; height: number; mimeType?: string; sizeBytes: number };
  status: string;
  createdAt: string;
  processing?: QuestionScanProcessingResponseDto | null;
}

export interface CoordinatorDashboard {
  workspaceId: string;
  summary: TeacherDashboard['summary'] & { teacherCount: number };
  classes: TeacherDashboard['classes'];
  teachers: Array<{ id: string; name: string; email: string; subject: string; classes: string[] }>;
  bySubject: Array<{ subject: string; attempts: number; accuracy: number }>;
}
export interface DirectorMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  accountType: string;
  subject: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | string;
  role: string;
  joinedAt: string;
}
export interface DirectorDashboard {
  workspaceId: string;
  institutionName: string;
  summary: CoordinatorDashboard['summary'] & { memberCount: number; activeMemberCount: number };
  classes: TeacherDashboard['classes'];
  bySubject: CoordinatorDashboard['bySubject'];
  evolution: Array<{ month: string; accuracy: number; submissions: number }>;
  members: DirectorMember[];
}
export interface TeacherDashboard {
  summary: { classCount: number; studentCount: number; submissionCount: number; averageAccuracy: number; studentsAtRisk: number };
  classes: Array<{
    id: string; name: string; joinCode: string; studentCount: number; simulationCount: number; submissionCount: number; accuracy: number;
    students: Array<{ id: string; name: string; email: string; joinedAt: string; submissions: number; accuracy: number; alert: boolean }>;
    weakSubjects: Array<{ subject: string; attempts: number; accuracy: number }>;
  }>;
}export const apiSimulationClasses = (token: string): Promise<SimulationClass[]> => request('/simulations/classes', { headers: authHeaders(token) });
export const apiTeacherDashboard = (token: string): Promise<TeacherDashboard> => request('/simulations/teacher/dashboard', { headers: authHeaders(token) });
export const apiCoordinatorDashboard = (token: string): Promise<CoordinatorDashboard> => request('/simulations/coordinator/dashboard', { headers: authHeaders(token) });
export const apiDirectorDashboard = (token: string): Promise<DirectorDashboard> => request('/simulations/director/dashboard', { headers: authHeaders(token) });
export const apiUpdateDirectorMember = (token: string, memberId: string, data: { status?: 'ACTIVE' | 'SUSPENDED'; accountType?: 'TEACHER' | 'COORDINATOR'; subject?: string }): Promise<{ updated: true }> => request('/simulations/director/members/' + encodeURIComponent(memberId), { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(data) });

export interface Institution { id: string; name: string; email: string; phone: string | null; status: string; workspace: { id: string; name: string } }
export interface PendingInvite { id: string; institutionName: string; roleName: string }
export interface InstitutionInvite { id: string; status: string; createdAt: string; user: { email: string; profile: { firstName: string; lastName: string | null } | null }; role: { name: string } }
export const apiCreateInstitution = (token: string, data: { name: string; email: string; phone?: string }): Promise<Institution> => request('/institutions', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) });
export const apiPendingInvite = (token: string): Promise<PendingInvite | null> => request('/institutions/invites/pending', { headers: authHeaders(token) });
export const apiAcceptInvite = (token: string): Promise<unknown> => request('/institutions/invites/accept', { method: 'POST', headers: authHeaders(token) });
export const apiCreateInstitutionInvite = (token: string, workspaceId: string, data: { email: string; accountType: 'STUDENT_INSTITUTION' | 'TEACHER' | 'COORDINATOR'; subject?: string }): Promise<InstitutionInvite> => request(`/workspaces/${workspaceId}/invites`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) });
export const apiListInstitutionInvites = (token: string, workspaceId: string): Promise<InstitutionInvite[]> => request(`/workspaces/${workspaceId}/invites`, { headers: authHeaders(token) });
export const apiRevokeInstitutionInvite = (token: string, workspaceId: string, memberId: string): Promise<{ revoked: true }> => request(`/workspaces/${workspaceId}/invites/${memberId}`, { method: 'DELETE', headers: authHeaders(token) });
export interface AcademicPeriod { id: string; workspaceId: string; name: string; startsAt: string; endsAt: string; active: boolean; createdAt: string; updatedAt: string }
export const apiCoordinatorPeriods = (token: string): Promise<AcademicPeriod[]> => request('/simulations/coordinator/periods', { headers: authHeaders(token) });
export const apiCreateCoordinatorPeriod = (token: string, data: { name: string; startsAt: string; endsAt: string }): Promise<AcademicPeriod> => request('/simulations/coordinator/periods', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) });
export const apiUpdateCoordinatorPeriod = (token: string, id: string, active: boolean): Promise<AcademicPeriod> => request(`/simulations/coordinator/periods/${id}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ active }) });
export const apiCreateSimulationClass = (token: string, name: string): Promise<SimulationClass> => request('/simulations/classes', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ name }) });
export const apiJoinSimulationClass = (token: string, joinCode: string): Promise<SimulationClass> => request('/simulations/classes/join', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ joinCode }) });

export interface ClassDetail {
  id: string; name: string; description: string | null; archived: boolean; canManage: boolean;
  joinCode: string | null; maxStudents: number | null; gradeYear: number | null;
  subject: { id: string; name: string } | null;
  academicPeriod: { id: string; name: string } | null;
  availableSubjects: Array<{ id: string; name: string }>;
  availablePeriods: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; name: string; email: string; subject: string | null }>;
  members: Array<{ id: string; name: string; email: string; joinedAt: string }>;
  timeline: Array<{ id: string; title: string; assessmentType: string; createdAt: string; questionCount: number; submissionCount: number }>;
}
export const apiManagedClasses = (token: string): Promise<Array<SimulationClass & { archived: boolean }>> => request('/simulations/classes?includeArchived=true', { headers: authHeaders(token) });
export const apiClassDetail = (token: string, id: string): Promise<ClassDetail> => request(`/simulations/classes/${id}`, { headers: authHeaders(token) });
export const apiUpdateClass = (token: string, id: string, data: { name: string; description: string; maxStudents?: number | null; gradeYear?: number | null; subjectId?: string | null; academicPeriodId?: string | null }) => request(`/simulations/classes/${id}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(data) });
export const apiArchiveClass = (token: string, id: string, archived: boolean) => request(`/simulations/classes/${id}/archive`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ archived }) });
export const apiLinkClassUser = (token: string, id: string, kind: 'teachers' | 'members', email: string) => request(`/simulations/classes/${id}/${kind}`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ email }) });
export const apiUnlinkClassUser = (token: string, id: string, kind: 'teachers' | 'members', userId: string) => request(`/simulations/classes/${id}/${kind}/${userId}`, { method: 'DELETE', headers: authHeaders(token) });
export const apiSimulations = (token: string): Promise<SimulationSummary[]> => request('/simulations', { headers: authHeaders(token) });
export const apiCreateSimulation = (token: string, title: string, questionIds: string[], classId?: string, assessmentType: AssessmentType = 'SIMULATION', dueAt?: string, durationMinutes?: number, isRealExam?: boolean, generateAnswerSheet?: boolean): Promise<Simulation> => request('/simulations', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ title, questionIds, classId, assessmentType, dueAt, durationMinutes, isRealExam, generateAnswerSheet }) });
/** Simulado modelo ENEM de um dia de prova: 90 questões (45 por área), com o tempo oficial. */
export const apiCreateEnemSimulation = (token: string, day: 1 | 2): Promise<{ simulationId: string }> => request('/simulations/enem', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ day }) });
export const apiSimulation = (token: string, id: string, answers = false): Promise<Simulation> => request(`/simulations/${id}${answers ? '?answers=true' : ''}`, { headers: authHeaders(token) });
export const apiSimulationResult = (token: string, id: string): Promise<SimulationResult> => request(`/simulations/${id}/submission`, { headers: authHeaders(token) });
export const apiSubmitSimulation = (token: string, id: string, answers: { position: number; selectedPosition: number }[]): Promise<SimulationResult> => request(`/simulations/${id}/submission`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ answers }) });

// Adaptive Simulation (item 16)
export const apiAdaptiveStart = (token: string, examId?: string): Promise<{ sessionId: string }> => request('/simulations/adaptive/start', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ examId }) });
export const apiAdaptiveNext = (token: string, id: string): Promise<AdaptiveNextQuestion | null> => request(`/simulations/adaptive/${id}/next`, { headers: authHeaders(token) });
export const apiAdaptiveAnswer = (token: string, id: string, answer: { questionId: string; selectedPosition: number; timeSpentSeconds?: number }): Promise<AdaptiveAnswerResult> => request(`/simulations/adaptive/${id}/answer`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(answer) });
export const apiAdaptiveFinish = (token: string, id: string): Promise<void> => request(`/simulations/adaptive/${id}/finish`, { method: 'POST', headers: authHeaders(token) });
export const apiAdaptiveAbandon = (token: string, id: string): Promise<void> => request(`/simulations/adaptive/${id}/abandon`, { method: 'POST', headers: authHeaders(token) });
export const apiAdaptiveSummary = (token: string, id: string): Promise<AdaptiveSessionSummaryDetail> => request(`/simulations/adaptive/${id}/summary`, { headers: authHeaders(token) });
export const apiAdaptiveList = (token: string): Promise<AdaptiveSessionSummary[]> => request('/simulations/adaptive', { headers: authHeaders(token) });

// Question Scanner (item 18)
export const apiQuestionScanPresignedUpload = (token: string, dto: { contentType: string }): Promise<QuestionScanUploadUrlResponseDto> => request('/simulations/question-scans/upload-url', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(dto) });
export const apiQuestionScanCompleteUpload = (token: string, id: string, dto: { fileUrl: string; width: number; height: number; sizeBytes: number }): Promise<QuestionScanUploadResponseDto> => request(`/simulations/question-scans/upload/${id}/complete`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(dto) });
export const apiListQuestionScanUploads = (token: string): Promise<QuestionScanUploadResponseDto[]> => request('/simulations/question-scans/uploads', { headers: authHeaders(token) });
export const apiGetQuestionScanProcessing = (token: string, id: string): Promise<QuestionScanProcessingResponseDto> => request(`/simulations/question-scans/processing/${id}`, { headers: authHeaders(token) });
export const apiSaveQuestionScanAsQuestion = (token: string, processingId: string, dto: any): Promise<any> => request(`/simulations/question-scans/processing/${processingId}/save-question`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(dto) });
export const apiSaveQuestionScanToErrorNotebook = (token: string, processingId: string, dto: any): Promise<any> => request(`/simulations/question-scans/processing/${processingId}/save-error-notebook`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(dto) });
export const apiQuestionScanStats = (token: string): Promise<any> => request('/simulations/question-scans/stats', { headers: authHeaders(token) });

export function apiListQuestions(
  accessToken: string,
  filters: QuestionFilters = {}
): Promise<PaginatedQuestions> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.examNumber) params.set('examNumber', String(filters.examNumber));
  if (filters.subjectId) params.set("subjectId", filters.subjectId);
  else if (filters.subject) params.set("subject", filters.subject);
  if (filters.topicId) params.set("topicId", filters.topicId);
  else if (filters.topic) params.set("topic", filters.topic);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.examId) params.set("examId", filters.examId);
  else if (filters.exam) params.set("exam", filters.exam);
  if (filters.year) params.set("year", String(filters.year));
  if (filters.sort) params.set("sort", filters.sort);
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

export function apiGetSimilarQuestions(
  accessToken: string,
  id: string,
  limit = 5
): Promise<SimilarQuestions> {
  return request(`/questions/${id}/similar?limit=${limit}`, {
    headers: authHeaders(accessToken),
  });
}

export function apiGetQuestionPerformance(accessToken: string): Promise<PerformanceBreakdown> {
  return request('/users/me/questions/performance', { headers: authHeaders(accessToken) });
}

export function apiGetQuestionProgress(accessToken: string, limit = 5): Promise<QuestionProgressPage> {
  return request(`/users/me/questions/progress?page=1&limit=${limit}`, { headers: authHeaders(accessToken) });
}

/** Fila de retomada: o que o aluno marcou para revisar. */
export function apiGetReviewQuestions(accessToken: string, limit = 5): Promise<QuestionProgressPage> {
  return request(`/users/me/questions/review?page=1&limit=${limit}`, { headers: authHeaders(accessToken) });
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

/* ------------------------------------------------------------------ *
 * Item 10 — Busca de questões públicas na web.
 *
 * O backend devolve APENAS metadados públicos do resultado (título, link,
 * trecho) + atribuição da fonte + classificação automática. O conteúdo
 * integral NUNCA vem da web: o usuário transcreve a questão e só então a
 * salva, sempre marcada como IMPORTED com o link original preservado.
 * ------------------------------------------------------------------ */

export interface WebQuestionClassification {
  subject?: string | null;
  subjectId?: string | null;
  topic?: string | null;
  topicId?: string | null;
  exam?: string | null;
  examId?: string | null;
  year?: number | null;
  difficulty?: QuestionDifficulty | null;
}

export interface WebSearchHit {
  title: string;
  link: string;
  snippet?: string;
  sourceName?: string;
  sourceId?: string;
  classification?: WebQuestionClassification | null;
}

export interface WebSearchQuery {
  q: string;
  exam?: string;
  subject?: string;
  topic?: string;
  difficulty?: QuestionDifficulty;
  limit?: number;
}

export interface WebSearchResults {
  /** Provedor ativo: "google-cse" (busca real) ou "demo" (demonstração). */
  provider: string;
  /** true quando a busca NÃO saiu do provedor real (sem chaves do Google CSE). */
  demoMode: boolean;
  query: WebSearchQuery;
  items: WebSearchHit[];
  total: number;
}

/** Questão transcrita pelo usuário a partir de um resultado da web. */
export interface WebQuestionPayload {
  sourceType: "OFFICIAL" | "PARTNER" | "GENERATED" | "IMPORTED";
  sourceName: string;
  sourceId?: string;
  exam?: string;
  year?: number;
  examNumber?: number;
  subject: string;
  topic?: string;
  difficulty: QuestionDifficulty;
  stem: string;
  options: Array<{ text: string; correct?: boolean }>;
  correctOptionIndex?: number;
  correctLetter?: string;
  explanation?: string;
}

export interface SaveWebQuestionPayload {
  /** URL original da fonte — preservada como `sourceId` da questão. */
  sourceUrl: string;
  sourceName: string;
  question: WebQuestionPayload;
}

export function apiSearchWebQuestions(
  accessToken: string,
  filters: WebSearchQuery
): Promise<WebSearchResults> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.exam) params.set("exam", filters.exam);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.topic) params.set("topic", filters.topic);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.limit) params.set("limit", String(filters.limit));
  return request(`/search/web?${params.toString()}`, {
    headers: authHeaders(accessToken),
  });
}

/** Salva a questão transcrita no banco via pipeline de importação
 * (validação, deduplicação e atribuição preservada). Retorna o relatório. */
export function apiSaveWebQuestion(
  accessToken: string,
  payload: SaveWebQuestionPayload
): Promise<QuestionImportReport> {
  return request("/search/save", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
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

/** Dica que destrava a questão sem revelar a resposta. Níveis 1 a 3: quanto
 * maior, mais detalhada — e ainda sem dar o gabarito. */
export function apiGetQuestionHint(
  accessToken: string,
  id: string,
  level = 1
): Promise<QuestionHint> {
  return request(`/questions/${id}/hint?level=${level}`, {
    headers: authHeaders(accessToken),
  });
}

/** Marca a questão para revisar (ou desmarca) e devolve o novo estado. */
export function apiSetQuestionReview(
  accessToken: string,
  id: string,
  markedForReview: boolean
): Promise<{ markedForReview: boolean }> {
  return request(`/questions/${id}/review`, {
    method: markedForReview ? "POST" : "DELETE",
    headers: authHeaders(accessToken),
  });
}

// =============================================================================
// Caderno de erros
// =============================================================================

/** Motivos do erro (item 13 do inventário). O valor vai para o servidor; o
 *  rótulo é o que o aluno lê. `OUTRO` cobre o que não cabe na lista. */
export type ErrorReason =
  | "FALTA_CONTEUDO"
  | "ERRO_INTERPRETACAO"
  | "ERRO_CALCULO"
  | "FALTA_ATENCAO"
  | "CHUTE"
  | "TEMPO_INSUFICIENTE"
  | "CONFUSAO_CONCEITOS"
  | "OUTRO";

/** ABERTA: errou e ainda não acertou o bastante. DOMINADA: dois acertos
 *  seguidos depois do erro — continua no histórico, sai da fila. */
export type ErrorNotebookStatus = "ABERTA" | "DOMINADA";

export interface ErrorNotebookEntry {
  questionId: string;
  subject: string;
  topic: string;
  difficulty: QuestionDifficulty;
  exam: string;
  year: number | null;
  examNumber: number | null;
  /** Enunciado truncado: o cartão do caderno não precisa da questão inteira. */
  stem: string;
  reason: ErrorReason | null;
  notes: string | null;
  status: ErrorNotebookStatus;
  wrongAttempts: number;
  correctStreak: number;
  /** "E" = erro, "A" = acerto. A linha do tempo do aprendizado. */
  evolution: string;
  reviewScheduledAt: string | null;
  due: boolean;
  firstWrongAt: string;
  lastWrongAt: string;
  resolvedAt: string | null;
}

export interface ErrorNotebookPage {
  items: ErrorNotebookEntry[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface ErrorNotebookFacet {
  label: string;
  value: string;
  open: number;
  mastered: number;
}

export interface ErrorNotebookSummary {
  total: number;
  open: number;
  mastered: number;
  dueToday: number;
  withoutReason: number;
  bySubject: ErrorNotebookFacet[];
  byTopic: ErrorNotebookFacet[];
  byReason: ErrorNotebookFacet[];
}

export interface ErrorNotebookFilters {
  page?: number;
  limit?: number;
  status?: "ABERTA" | "DOMINADA" | "TODAS" | "";
  subject?: string;
  topic?: string;
  reason?: string;
  difficulty?: string;
  due?: boolean;
}

export function apiGetErrorNotebook(
  accessToken: string,
  filters: ErrorNotebookFilters = {}
): Promise<ErrorNotebookPage> {
  const query = new URLSearchParams();
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  if (filters.limit) query.set("limit", String(filters.limit));
  if (filters.status && filters.status !== "TODAS") query.set("status", filters.status);
  if (filters.subject) query.set("subject", filters.subject);
  if (filters.topic) query.set("topic", filters.topic);
  if (filters.reason) query.set("reason", filters.reason);
  if (filters.difficulty) query.set("difficulty", filters.difficulty);
  if (filters.due) query.set("due", "true");
  const suffix = query.toString();
  return request(`/users/me/error-notebook${suffix ? `?${suffix}` : ""}`, {
    headers: authHeaders(accessToken),
  });
}

export function apiGetErrorNotebookSummary(
  accessToken: string
): Promise<ErrorNotebookSummary> {
  return request("/users/me/error-notebook/summary", {
    headers: authHeaders(accessToken),
  });
}

/** Inclui a questão no caderno manualmente (a entrada automática é o erro). */
export function apiAddErrorNotebookEntry(
  accessToken: string,
  questionId: string
): Promise<ErrorNotebookEntry> {
  return request(`/users/me/error-notebook/${encodeURIComponent(questionId)}`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}

/** Motivo do erro, observação pessoal e revisão combinada (data AAAA-MM-DD). */
export function apiUpdateErrorNotebookEntry(
  accessToken: string,
  questionId: string,
  changes: { reason?: ErrorReason | null; notes?: string | null; reviewScheduledOn?: string | null }
): Promise<ErrorNotebookEntry> {
  return request(`/users/me/error-notebook/${encodeURIComponent(questionId)}`, {
    method: "PATCH",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export function apiRemoveErrorNotebookEntry(
  accessToken: string,
  questionId: string
): Promise<void> {
  return request(`/users/me/error-notebook/${encodeURIComponent(questionId)}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

// =============================================================================
// Nota de corte do Sisu (meta de nota do aluno)
// =============================================================================

export type SisuModality =
  | "AC" | "LB_PPI" | "LB_Q" | "LB_PCD" | "LB_EP" | "LI_PPI" | "LI_Q" | "LI_PCD" | "LI_EP";

/** LB = renda familiar até o limite da Lei de Cotas; LI = qualquer renda. */
export const SISU_MODALITY_OPTIONS: { value: SisuModality; label: string }[] = [
  { value: "AC", label: "Ampla concorrência" },
  { value: "LB_EP", label: "Escola pública, baixa renda" },
  { value: "LB_PPI", label: "Escola pública, baixa renda — pretos, pardos e indígenas" },
  { value: "LB_Q", label: "Escola pública, baixa renda — quilombolas" },
  { value: "LB_PCD", label: "Escola pública, baixa renda — pessoas com deficiência" },
  { value: "LI_EP", label: "Escola pública, qualquer renda" },
  { value: "LI_PPI", label: "Escola pública, qualquer renda — pretos, pardos e indígenas" },
  { value: "LI_Q", label: "Escola pública, qualquer renda — quilombolas" },
  { value: "LI_PCD", label: "Escola pública, qualquer renda — pessoas com deficiência" },
];

export interface CutoffOffer {
  courseCode: number;
  courseName: string;
  institutionAcronym: string;
  institutionName: string;
  campus: string;
  city: string;
  state: string;
  degree: string;
  shift: string;
  scores: { year: number; score: number }[];
  average: number;
  /** Pontos que a nota vem subindo (+) ou caindo (−) por edição. */
  trendPerYear: number;
  /** Nota esperada na próxima edição. */
  projected: number;
}

export interface CutoffTarget {
  status: "OK" | "MISSING_PROFILE" | "COURSE_NOT_FOUND" | "INSTITUTION_NOT_FOUND" | "NO_SCORE_FOR_MODALITY";
  course: string | null;
  university: string | null;
  modality: SisuModality;
  modalityLabel: string;
  /** Projeção da nota de corte para a próxima edição; a maior entre os campi. */
  targetScore: number | null;
  averageScore: number | null;
  trendPerYear: number | null;
  projectedYear: number | null;
  years: number[];
  offers: CutoffOffer[];
  suggestions: string[];
  message: string;
}

/** Meta de nota do aluno, pelo curso, universidade e modalidade do perfil. */
export function apiGetCutoffTarget(accessToken: string): Promise<CutoffTarget> {
  return request("/cutoffs/target", { headers: authHeaders(accessToken) });
}

// =============================================================================
// Cronograma de Estudos
// =============================================================================

/** SKIPPED: o aluno decidiu não fazer (replanejamento). */
export type StudyTaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "SKIPPED";

export type StudyArea = "LINGUAGENS" | "MATEMATICA" | "NATUREZA" | "HUMANAS";
export type StudyEssayFrequency = "WEEKLY" | "BIWEEKLY";

/** Tempo de estudo de um dia da semana (0 = domingo ... 6 = sábado). */
export interface StudyDayMinutes {
  weekday: number;
  minutes: number;
}

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
  targetCourse?: string | null;
  /** Até três áreas prioritárias. */
  priorityAreas?: StudyArea[];
  essayFrequency?: StudyEssayFrequency | null;
  /** Vazio = `dailyMinutes` vale para todo dia de estudo. */
  dayMinutes?: StudyDayMinutes[];
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
  /** Tópico do banco de questões, quando a tarefa veio do gerador adaptativo. */
  topicId?: string | null;
  activityType?: "TEORIA" | "QUESTOES" | "REVISAO" | "SIMULADO" | "REDACAO";
  /** O tópico da tarefa; `subjectId` é a matéria dele no banco de questões. */
  topic?: { id: string; name: string; subjectId: string } | null;
  title: string;
  description: string | null;
  status: StudyTaskStatus;
  scheduledMinutes: number;
  completedAt: string | null;
  /** Resultado do bloco de questões, quando a tarefa foi concluída pela prática. */
  practiceAnswered?: number | null;
  practiceCorrect?: number | null;
  /** Simulado montado para a tarefa de simulado (enviá-lo conclui a tarefa). */
  simulationId?: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  subjectName?: string;
  loggedMinutes?: number;
}

/** Bloco de questões do tópico da tarefa (vazio se o tópico não tem questões). */
export interface StudyTaskPractice {
  taskId: string;
  title: string;
  subject: string | null;
  topic: string | null;
  questions: Question[];
}

/** Estimativa (aproximada, em faixa) da nota do ENEM pelo desempenho nas questões. */
export interface ScoreEstimate {
  areas: {
    area: StudyArea;
    label: string;
    answered: number;
    correct: number;
    accuracy: number | null;
    /** null enquanto faltam questões na área (`missing` diz quantas). */
    estimate: number | null;
    low: number | null;
    high: number | null;
    missing: number;
  }[];
  essay: { score: number | null; corrections: number };
  average: { estimate: number; low: number; high: number; parts: number; complete: boolean } | null;
  target: { score: number; course: string | null; university: string | null; year: number | null } | null;
  /** Meta menos a média estimada: positivo = falta. */
  gap: number | null;
  message: string;
}

/** A média estimada ao fim de uma semana (null = ainda sem dados suficientes). */
export interface ScoreHistoryPoint {
  weekStart: string;
  weekEnd: string;
  estimate: number | null;
  low: number | null;
  high: number | null;
  parts: number;
}

/** As últimas 8 semanas, da mais antiga para a atual. */
export function apiGetScoreEstimateHistory(accessToken: string): Promise<ScoreHistoryPoint[]> {
  return request("/study/score-estimate/history", { headers: authHeaders(accessToken) });
}

export function apiGetScoreEstimate(accessToken: string): Promise<ScoreEstimate> {
  return request("/study/score-estimate", { headers: authHeaders(accessToken) });
}

/** Resumo da semana do cronograma — só dados registrados, nada estimado. */
export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  /** A semana ainda não acabou: o planejado inclui dias que não chegaram. */
  inProgress: boolean;
  tasks: { planned: number; done: number; skipped: number; completionRate: number };
  minutes: { planned: number; studied: number };
  questions: { answered: number; correct: number; accuracy: number | null };
  simulations: { count: number; correct: number; total: number };
  subjects: { subjectId: string; name: string; plannedTasks: number; doneTasks: number; plannedMinutes: number }[];
  topics: {
    studied: number;
    mastered: number;
    /** Passaram a "dominado" nesta semana. */
    newlyMastered: number;
    /** Vistos pela primeira vez nesta semana. */
    started: number;
    needAttention: number;
    items: {
      id: string;
      name: string;
      subject: string | null;
      status: TopicMasteryStatus;
      masteryScore: number;
      attempts: number;
      /** Pontos de domínio ganhos (ou perdidos) na semana; null em tópico novo. */
      delta: number | null;
    }[];
  };
  previous: { tasksDone: number; questionsAnswered: number; studiedMinutes: number };
  target: { score: number; course: string | null; university: string | null; year: number | null } | null;
  highlights: string[];
}

/** `date` (AAAA-MM-DD): qualquer dia da semana desejada. */
export function apiGetWeeklySummary(accessToken: string, date: string): Promise<WeeklySummary | null> {
  return request(`/study/weekly-summary?date=${date}`, { headers: authHeaders(accessToken) });
}

/** Comentário da LuminIA sobre a semana (ou um texto fixo, sem IA disponível). */
export function apiGetWeeklyComment(
  accessToken: string,
  date: string
): Promise<{ comment: string; source: "AI" | "FALLBACK" }> {
  return request(`/ai/weekly-comment?date=${date}`, { headers: authHeaders(accessToken) });
}

/** Resumo de teoria do tópico da tarefa (seções "## ", listas "- ", **negrito**). */
export interface StudyTaskLesson {
  taskId: string;
  subject: string | null;
  topic: string;
  topicId: string;
  level: TopicLevel | null;
  content: string;
  /** "AI" = gerado; "MANUAL" = escrito ou revisado por alguém. */
  source: string;
  updatedAt: string;
}

/** Na primeira abertura de um tópico o resumo é gerado na hora (pode levar ~15 s). */
export function apiGetTaskLesson(accessToken: string, taskId: string): Promise<StudyTaskLesson> {
  return request(`/ai/lessons/task/${taskId}`, { headers: authHeaders(accessToken) });
}

/** Simulado da tarefa de "Simulado": cria na primeira vez, depois devolve o mesmo. */
export function apiStartTaskSimulation(
  accessToken: string,
  taskId: string
): Promise<{ simulationId: string; created: boolean }> {
  return request(`/simulations/from-task/${taskId}`, { method: "POST", headers: authHeaders(accessToken) });
}

export function apiGetTaskPractice(accessToken: string, taskId: string): Promise<StudyTaskPractice> {
  return request(`/study/tasks/${taskId}/practice`, { headers: authHeaders(accessToken) });
}

/** Conclui a tarefa com o resultado das questões do bloco que o aluno respondeu. */
export function apiCompleteTaskPractice(
  accessToken: string,
  taskId: string,
  questionIds: string[]
): Promise<StudyTask> {
  return request(`/study/tasks/${taskId}/practice/complete`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ questionIds }),
  });
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
  dayMinutes?: StudyDayMinutes[];
  targetCourse?: string;
  priorityAreas?: StudyArea[];
  essayFrequency?: StudyEssayFrequency;
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

export type SchedulePhase = "BASE" | "CONSOLIDACAO" | "PREPARACAO";

export interface DailySession {
  schedule: StudySchedule;
  /** Fase da reta até a prova no dia consultado. */
  phase?: SchedulePhase;
  session: StudySession | null;
  tasks: StudyTask[];
  /** Minutos registrados hoje por matéria (o cronômetro trabalha por matéria). */
  loggedMinutesBySubject: Record<string, number>;
}

export function apiGetDailySession(
  accessToken: string,
  date?: string
): Promise<DailySession | null> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return request(`/study/daily${qs}`, { headers: authHeaders(accessToken) });
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

/**
 * Registra tempo de estudo por MATÉRIA. É o que o cronômetro usa: o aluno
 * escolhe a disciplina, nunca o subtópico, e o tempo entra no progresso do
 * cronograma mesmo em dia sem sessão programada.
 */
export function apiLogSubjectTime(
  accessToken: string,
  subjectId: string,
  durationMinutes: number
): Promise<StudyProgressSummary> {
  return request(`/study/timer`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ subjectId, durationMinutes }),
  });
}

/** Conteúdos por status de domínio, só das matérias do cronograma. */
export interface StudyMasterySummary {
  totalTopics: number;
  naoEstudados: number;
  aprendendo: number;
  praticando: number;
  dominados: number;
  precisaReforco: number;
  /** Tópicos com revisão espaçada vencida hoje. */
  paraRevisar: number;
}

export interface StudyProgressResponse {
  summary: StudyProgressSummary | null;
  evolution: ProgressEvolutionPoint[] | null;
  mastery?: StudyMasterySummary | null;
}

export function apiGetProgress(accessToken: string): Promise<StudyProgressResponse> {
  return request("/study/progress", { headers: authHeaders(accessToken) });
}

/** Resumo de um dia na visão semanal. `totalTasks: 0` com tempo planejado =
 * dia de estudo ainda não aberto (as tarefas nascem quando o dia é aberto). */
export interface StudyWeekDay {
  date: string;
  scheduledMinutes: number;
  totalTasks: number;
  doneTasks: number;
}

export function apiGetWeek(accessToken: string, start: string): Promise<StudyWeekDay[] | null> {
  return request(`/study/week?start=${encodeURIComponent(start)}`, { headers: authHeaders(accessToken) });
}

/** Refaz o plano do dia com o domínio de agora (depois do diagnóstico). */
export function apiRefreshDay(accessToken: string, date: string): Promise<DailySession | null> {
  return request("/study/daily/refresh", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ date }),
  });
}

export type TopicMasteryStatus = "NAO_ESTUDADO" | "APRENDENDO" | "PRATICANDO" | "DOMINADO" | "PRECISA_REFORCO";

export type TopicLevel = "BASE" | "INTERMEDIARIO" | "AVANCADO";

/** Tópicos de uma matéria do cronograma, com a situação do aluno em cada um. */
export interface StudySubjectTopics {
  /** Matéria do cronograma (StudySubject). */
  subjectId: string;
  subjectName: string;
  /** A mesma matéria no banco de questões — filtro de lá. */
  questionBankSubjectId: string | null;
  topics: {
    id: string;
    name: string;
    /** Nível na trilha da matéria (a lista já vem na ordem de estudo);
     *  null = ainda não colocado na trilha. */
    level: TopicLevel | null;
    status: TopicMasteryStatus;
    masteryScore: number;
    attempts: number;
    correctAttempts: number;
    /** Revisão espaçada vencida. */
    due: boolean;
    questionCount: number;
    /** false = o aluno tirou este tópico do cronograma. */
    included: boolean;
  }[];
}

export function apiGetStudyTopics(accessToken: string): Promise<StudySubjectTopics[] | null> {
  return request("/study/topics", { headers: authHeaders(accessToken) });
}

/** Inclui (true) ou tira (false) um tópico do cronograma. */
export function apiSetTopicIncluded(
  accessToken: string,
  topicId: string,
  included: boolean
): Promise<{ topicId: string; included: boolean }> {
  return request(`/study/topics/${topicId}`, {
    method: "PUT",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ included }),
  });
}

export type ReplanStrategy = "TOMORROW" | "SATURDAY" | "AUTO" | "SKIP";

export interface ReplanPreview {
  date: string;
  subjects: { subjectName: string; beforeMinutes: number; afterMinutes: number }[];
  warnings: string[];
}

export interface ReplanResult {
  strategy: ReplanStrategy;
  /** false = só a prévia do AUTO; nada foi gravado. */
  applied: boolean;
  movedTo: string | null;
  preview?: ReplanPreview;
}

/** Replaneja uma tarefa não feita. `date` é hoje no fuso do aluno. */
export function apiReplanTask(
  accessToken: string,
  id: string,
  payload: { strategy: ReplanStrategy; date: string; confirm?: boolean }
): Promise<ReplanResult> {
  return request(`/study/tasks/${id}/replan`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export interface StudyDiagnosticArea {
  area: StudyArea;
  label: string;
  questions: Question[];
}

/** Diagnóstico inicial: até 5 questões por área, das matérias do cronograma.
 * `recommended` só vem true para quem ainda não tem domínio registrado. */
export function apiGetDiagnostic(
  accessToken: string
): Promise<{ recommended: boolean; areas: StudyDiagnosticArea[] } | null> {
  return request("/study/diagnostic", { headers: authHeaders(accessToken) });
}

export function apiSetVestibular(
  accessToken: string,
  payload: {
    examId?: string;
    customName?: string | null;
    targetDate?: string;
  }
): Promise<UserVestibular> {
  return request("/user/vestibular", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiGetUserVestibular(accessToken: string): Promise<UserVestibular | null> {
  return request("/user/vestibular", { headers: authHeaders(accessToken) });
}

// =============================================================================
// Caderno de Fórmulas (item 21)
// =============================================================================

export interface Formula {
  id: string;
  name: string;
  discipline: 'MATEMATICA' | 'FISICA' | 'QUIMICA' | 'BIOLOGIA' | 'OUTRA';
  topic: string | null;
  latex: string;
  description: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFormulaPayload {
  name: string;
  discipline: 'MATEMATICA' | 'FISICA' | 'QUIMICA' | 'BIOLOGIA' | 'OUTRA';
  topic?: string | null;
  latex: string;
  description?: string | null;
  isFavorite?: boolean;
}

export interface UpdateFormulaPayload {
  name?: string;
  discipline?: 'MATEMATICA' | 'FISICA' | 'QUIMICA' | 'BIOLOGIA' | 'OUTRA';
  topic?: string | null;
  latex?: string;
  description?: string | null;
  isFavorite?: boolean;
}

export function apiListFormulas(accessToken: string): Promise<Formula[]> {
  return request("/formulas", { headers: authHeaders(accessToken) });
}

export function apiCreateFormula(accessToken: string, payload: CreateFormulaPayload): Promise<Formula> {
  return request("/formulas", { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify(payload) });
}

export function apiUpdateFormula(accessToken: string, id: string, payload: UpdateFormulaPayload): Promise<Formula> {
  return request(`/formulas/${id}`, { method: "PATCH", headers: authHeaders(accessToken), body: JSON.stringify(payload) });
}

export function apiDeleteFormula(accessToken: string, id: string): Promise<{ ok: boolean }> {
  return request(`/formulas/${id}`, { method: "DELETE", headers: authHeaders(accessToken) });
}

// =============================================================================
// Caderno de Repertórios (item 22)
// =============================================================================

export interface Repertoire {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  source: string | null;
  year: number | null;
  theme: string;
  isStudied: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRepertoirePayload {
  title: string;
  summary: string;
  keywords: string[];
  source?: string | null;
  year?: number | null;
  theme: string;
  isStudied?: boolean;
}

export interface UpdateRepertoirePayload {
  title?: string;
  summary?: string;
  keywords?: string[];
  source?: string | null;
  year?: number | null;
  theme?: string;
  isStudied?: boolean;
}

export function apiListRepertoires(accessToken: string): Promise<Repertoire[]> {
  return request("/repertoires", { headers: authHeaders(accessToken) });
}

export function apiCreateRepertoire(accessToken: string, payload: CreateRepertoirePayload): Promise<Repertoire> {
  return request("/repertoires", { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify(payload) });
}

export function apiUpdateRepertoire(accessToken: string, id: string, payload: UpdateRepertoirePayload): Promise<Repertoire> {
  return request(`/repertoires/${id}`, { method: "PATCH", headers: authHeaders(accessToken), body: JSON.stringify(payload) });
}

export function apiDeleteRepertoire(accessToken: string, id: string): Promise<{ ok: boolean }> {
  return request(`/repertoires/${id}`, { method: "DELETE", headers: authHeaders(accessToken) });
}

// =============================================================================
// Modelos de Redação Nota Mil (item 23)
// =============================================================================

export interface EssayModel {
  id: string;
  year: number;
  exam: string;
  theme: string;
  text: string;
  competencies: { C1: number; C2: number; C3: number; C4: number; C5: number };
  totalScore: number;
  pdfUrl: string | null;
  highlights: { C1: string; C2: string; C3: string; C4: string; C5: string } | null;
  createdAt: string;
}

export interface EssayModelFilters {
  year?: number;
  exam?: string;
  theme?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedEssayModels {
  items: EssayModel[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function apiListEssayModels(accessToken: string, filters: EssayModelFilters = {}): Promise<PaginatedEssayModels> {
  const params = new URLSearchParams();
  if (filters.year) params.set("year", String(filters.year));
  if (filters.exam) params.set("exam", filters.exam);
  if (filters.theme) params.set("theme", filters.theme);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return request(`/essays/models/list${qs ? `?${qs}` : ""}`, { headers: authHeaders(accessToken) });
}

export function apiGetEssayModel(accessToken: string, id: string): Promise<EssayModel> {
  return request(`/essays/models/${id}`, { headers: authHeaders(accessToken) });
}

// =============================================================================
// Provas antigas (item 19)
// =============================================================================

export interface ExamPaper {
  id: string;
  examId: string;
  exam?: { id: string; name: string };
  year: number;
  pdfUrl: string | null;
  pageImagesJson: string[] | null;
  metadataJson: { totalPages?: number; hasGabarito?: boolean; hasCaderno?: boolean; sourceUrl?: string } | null;
  gabaritoJson: Record<string, number> | null;
  cadernoJson: Record<string, number> | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExamPaperPage {
  id: string;
  paperId: string;
  pageNumber: number;
  imageUrl: string;
  dimensionsJson: { width: number; height: number } | null;
  textContent: string | null;
  createdAt: string;
}

export interface ExamPaperQuestion {
  id: string;
  number: number;
  pageNumber: number;
  boundsJson: { x: number; y: number; width: number; height: number } | null;
  area: string | null;
  subject: string;
}

// O QuestionCatalogController é `@Controller()` sem prefixo, então estas rotas
// vivem na raiz (`/exam-papers`), ao lado de `/subjects` e `/exams`.
export const apiExamPapers = (token: string): Promise<ExamPaper[]> =>
  request('/exam-papers', { headers: authHeaders(token) });

export const apiExamPaper = (token: string, id: string): Promise<ExamPaper> =>
  request(`/exam-papers/${id}`, { headers: authHeaders(token) });

export const apiExamPaperPages = (token: string, paperId: string): Promise<ExamPaperPage[]> =>
  request(`/exam-papers/${paperId}/pages`, { headers: authHeaders(token) });

export const apiExamPaperQuestions = (token: string, paperId: string): Promise<ExamPaperQuestion[]> =>
  request(`/exam-papers/${paperId}/questions`, { headers: authHeaders(token) });

export interface ExamPaperComparison {
  base: { id: string; year: number };
  compare: { id: string; year: number };
  repeatedCount: number;
  newCount: number;
  similarityScore: number;
}

export const apiCompareExamPapers = (token: string, baseId: string, compareId: string): Promise<ExamPaperComparison> =>
  request(`/exam-papers/compare?baseId=${baseId}&compareId=${compareId}`, { headers: authHeaders(token) });

// =============================================================================
// Scanner de cartão-resposta (item 17) — leitura óptica real (OMR)
// =============================================================================

export interface SheetLayout {
  version: 2;
  page: { width: number; height: number };
  fiducials: { x: number; y: number }[];
  fiducialSize: number;
  codeCells: { x: number; y: number; size: number }[];
  questions: { number: number; label: { x: number; y: number }; bubbles: { position: number; x: number; y: number; r: number }[] }[];
  header: { x: number; y: number; width: number; height: number };
}
export interface PrintableSheets {
  simulation: { id: string; title: string; className: string | null; questionCount: number };
  layout: SheetLayout;
  sheets: { code: number; bits: boolean[]; studentId: string | null; studentName: string | null }[];
}
export type AnswerSheetQuestionStatus = 'OK' | 'BLANK' | 'MULTIPLE' | 'AMBIGUOUS';
export interface AnswerSheetQuestion {
  number: number;
  selected: number | null;
  status: AnswerSheetQuestionStatus;
  confidence: number;
  fills: number[];
  box: { x: number; y: number; width: number; height: number };
  /** Centro e raio (px) de cada bolha na imagem da folha. */
  bubbles: { x: number; y: number; r: number }[];
}
export interface AnswerSheetScan {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_REVIEW';
  simulation: { id: string; title: string } | null;
  studentId: string;
  studentName: string | null;
  scannedByMe: boolean;
  sheetCode: number | null;
  batchId: string | null;
  page: number | null;
  hasImage: boolean;
  image: { width: number | null; height: number | null };
  questions: AnswerSheetQuestion[];
  answers: Record<string, number>;
  /** Questões que o corretor mudou em relação à leitura. */
  adjusted: number[];
  warnings: string[];
  message: string | null;
  reviewCount: number;
  /** `finalizedAt`: lançamento final — domínio por tópico aplicado e folha travada. */
  result: { correct: number; total: number; reviewed: boolean; finalizedAt: string | null } | null;
  createdAt: string;
}
export interface AnswerSheetScanSummary {
  id: string;
  status: AnswerSheetScan['status'];
  createdAt: string;
  simulation: { id: string; title: string } | null;
  studentName: string;
  batchId: string | null;
  page: number | null;
  reviewCount: number;
  result: { correct: number; total: number; finalizedAt: string | null } | null;
}
export const apiAnswerSheetPrepare = (token: string, simulationId: string, studentIds?: string[]): Promise<PrintableSheets> =>
  request(`/answer-sheets/simulations/${simulationId}/sheets`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(studentIds?.length ? { studentIds } : {}) });
export interface AnswerSheetBatchResult {
  batchId: string;
  pages: number;
  results: { page: number; scan: AnswerSheetScan | null; error: string | null }[];
}
/** Envia o PDF das folhas (data URL application/pdf). */
export const apiAnswerSheetScan = (token: string, body: { pdf: string; simulationId?: string }): Promise<AnswerSheetBatchResult> =>
  request('/answer-sheets/scan', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) });
export const apiAnswerSheetFinalize = (token: string, id: string): Promise<AnswerSheetScan> =>
  request(`/answer-sheets/scans/${id}/finalize`, { method: 'POST', headers: authHeaders(token) });
export const apiAnswerSheetFinalizeBatch = (token: string, batchId: string): Promise<{ finalized: number; notPosted: number }> =>
  request(`/answer-sheets/batches/${batchId}/finalize`, { method: 'POST', headers: authHeaders(token) });
export const apiAnswerSheetConfirmBatch = (token: string, batchId: string): Promise<{ confirmed: number; pending: number }> =>
  request(`/answer-sheets/batches/${batchId}/confirm`, { method: 'POST', headers: authHeaders(token) });
export async function apiAnswerSheetBatchPdfUrl(token: string, batchId: string): Promise<string> {
  const response = await fetch(`${API_URL}/answer-sheets/batches/${batchId}/pdf`, { headers: authHeaders(token) });
  if (!response.ok) throw new ApiError(response.status, 'Não foi possível baixar o PDF.');
  return URL.createObjectURL(await response.blob());
}
export const apiAnswerSheetScans = (token: string, simulationId?: string): Promise<AnswerSheetScanSummary[]> =>
  request(`/answer-sheets/scans${simulationId ? `?simulationId=${simulationId}` : ''}`, { headers: authHeaders(token) });
export const apiAnswerSheetScanGet = (token: string, id: string): Promise<AnswerSheetScan> => request(`/answer-sheets/scans/${id}`, { headers: authHeaders(token) });
export const apiAnswerSheetReview = (token: string, id: string, answers: { number: number; selected: number }[]): Promise<AnswerSheetScan> =>
  request(`/answer-sheets/scans/${id}/review`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ answers }) });
export async function apiAnswerSheetImageUrl(token: string, id: string): Promise<string> {
  const response = await fetch(`${API_URL}/answer-sheets/scans/${id}/image`, { headers: authHeaders(token) });
  if (!response.ok) throw new ApiError(response.status, 'Não foi possível carregar a imagem da folha.');
  return URL.createObjectURL(await response.blob());
}
