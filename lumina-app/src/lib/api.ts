import { API_URL } from "@/lib/config";
import { clearTokens, getRefreshToken, setTokens } from "@/lib/auth";
import { ApiError, createApiClient } from "@/lib/api-client-core";
import {
  buildSimilarQuestionPayload,
  SIMILAR_QUESTION_ENDPOINT,
} from "@/lib/similar-question-payload";
import type { BillingCycle, BillingMe, CheckoutBillingType, SubscriptionView } from "@/lib/plans";
import { toQueryString, type Formula, type FormulaAiAction, type FormulaPayload, type FormulaQuery, type FormulaSummary, type NotebookCollection, type Repertoire, type RepertoireAiAction, type RepertoireAiResult, type RepertoirePayload, type RepertoireQuery, type RepertoireSummary } from "@/lib/notebooks";

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
  /** Versão dos Termos aceita; null = nunca aceitou (ex.: cadastro pelo Google). */
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  /** false = precisa aceitar a versão vigente antes de usar o app. */
  termsCurrent: boolean;
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
  /** Pontos fortes observados no texto. */
  strengths?: string[];
  /** Problemas observados no texto. */
  problems?: string[];
  /** Por que o nível escolhido descreve o texto. */
  levelExplanation?: string | null;
  /** O que faria a nota subir nesta competência. */
  tip?: string | null;
  evidence: string[];
  citations: { id: string; title: string; citation: string }[];
}
export interface EssayKnowledgeInfo {
  activeDocument: { id: string; title: string; version: string; publishedAt: string; sourceUrl: string };
  documents: { id: string; title: string; version: string; publishedAt: string; status: 'current' | 'archived' | 'reference' | 'internal' }[];
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
  discrepancy?: { total: number; maxCompetency: number; thirdEvaluator: boolean; competencies?: string[] } | null;
  knowledge?: EssayKnowledgeInfo | null;
  evaluators?: { evaluator: string; model: string | null; total: number }[];
  analysis?: { lines: number; linesSource: 'ocr' | 'estimativa'; words: number; paragraphs: number; warnings: string[] } | null;
  competencies?: EssayCompetencyResult[];
  updatedAt?: string;
  /** Vem no pedido de correção: a cota já com este pedido descontado. */
  quota?: EssayCorrectionQuota;
}
export const apiEssayScanCreate = (token: string, pages: string[], theme: string): Promise<{ id: string; status: EssayScanStatus }> =>
  request('/essay-scans', { method: 'POST', headers: essayHeaders(token), body: JSON.stringify({ pages, theme }) });
export const apiEssayScan = (token: string, id: string): Promise<EssayScan> => request(`/essay-scans/${id}`, { headers: essayHeaders(token) });
export const apiEssayScanRetry = (token: string, id: string): Promise<{ id: string; status: EssayScanStatus }> => request(`/essay-scans/${id}/retry`, { method: 'POST', headers: essayHeaders(token) });
/** Cota mensal de correções por IA (renova no dia 1º, horário de Brasília). */
export interface EssayCorrectionQuota {
  limit: number;
  used: number;
  remaining: number;
  period: string;
  resetsAt: string;
}
export const apiEssayCorrectionQuota = (token: string): Promise<EssayCorrectionQuota> => request('/essay-corrections/quota', { headers: essayHeaders(token) });
export const apiEssayScanConfirm = (
  token: string,
  id: string,
  data: { text: string; theme: string; title?: string },
): Promise<{ essayId: string; correction: EssayCorrection; quota?: EssayCorrectionQuota; quotaMessage?: string }> =>
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

// ---- Item 21: revisão humana, chat contextual e aprendizagem validada ----
export type EssayReviewStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'DISPUTED' | 'SUPERSEDED';
export type EssayReviewDecision = 'AGREE' | 'DISAGREE' | 'ADJUST';
export type EssayLearningLevel = 'RECEIVED' | 'STRUCTURED' | 'VALIDATED' | 'CONSOLIDATED';
export type EssayCompetencyId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
export const ESSAY_COMPETENCY_LABELS: Record<EssayCompetencyId, string> = {
  C1: 'Domínio da escrita formal',
  C2: 'Compreensão do tema e repertório',
  C3: 'Seleção e organização dos argumentos',
  C4: 'Coesão e mecanismos linguísticos',
  C5: 'Proposta de intervenção',
};
export const ESSAY_SCORE_LEVELS = [0, 40, 80, 120, 160, 200] as const;

export interface EssayReviewEvidence {
  evidence?: string[];
  anchorText?: string | null;
  level?: string;
  strengths?: string[];
  problems?: string[];
  levelExplanation?: string;
  citations?: { id: string; title: string; citation: string }[];
}
export interface EssayReviewCorrectionDetail {
  competency: EssayCompetencyId;
  score: number;
  justification: string | null;
  evidenceJson: EssayReviewEvidence | null;
}
export interface EssayReviewCorrection {
  id: string;
  status: EssayCorrectionStatus;
  totalScore: number;
  generalFeedback: string | null;
  essayVersion: number | null;
  updatedAt: string;
  confidence: number | null;
  annulmentJson: { code: string; explanation: string; citation: string } | null;
  auditJson: {
    method?: string;
    discrepancy?: { total: number; maxCompetency: number; thirdEvaluator: boolean; competencies?: string[] } | null;
    calibrated?: boolean;
    runs?: { evaluator: string; method: string; model: string | null; total: number; scores?: Record<string, number> }[];
    analysis?: { lines?: number; linesSource?: string; words?: number; paragraphs?: number; warnings?: string[] } | null;
    knowledge?: { activeDocument?: { id: string; title: string; version: string; publishedAt: string; sourceUrl: string } | null };
  } | null;
  competenciesJson: Record<string, number>;
  details: EssayReviewCorrectionDetail[];
}
export interface EssayReviewScan {
  id: string;
  status: 'PROCESSING' | 'READY' | 'CONFIRMED' | 'FAILED';
  transcribedText: string | null;
  lineCount: number | null;
  illegibleWords: number | null;
  ocrConfidence: number | null;
  warnings: string[];
  createdAt: string;
}
export interface EssayReviewEssay {
  id: string;
  title: string;
  theme: string;
  content: string;
  version: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  scans: EssayReviewScan[];
  owner: { id: string; name: string; accountType: ApiUser['accountType'] };
}
export interface EssayReviewDetail {
  id: string;
  competency: EssayCompetencyId;
  aiScore: number;
  humanScore: number;
  decision: EssayReviewDecision;
  criterion: string | null;
  justification: string | null;
  evidenceJson: EssayReviewEvidence | null;
  createdAt: string;
}
export interface EssayReview {
  id: string;
  essayId: string;
  correctionId: string;
  essayVersion: number;
  status: EssayReviewStatus;
  decision: EssayReviewDecision | null;
  aiTotalScore: number;
  totalScore: number;
  aiCompetenciesJson: Record<string, number>;
  competenciesJson: Record<string, number>;
  divergenceJson: { total: number; maxCompetency: number; diffs: Record<string, number>; discrepant: boolean } | null;
  generalFeedback: string | null;
  validationLevel: EssayLearningLevel;
  validatedAt: string | null;
  validationNotes: string | null;
  submittedAt: string | null;
  evaluator: { id: string; accountType: ApiUser['accountType']; name: string };
  validatedBy: { id: string; name: string } | null;
  details: EssayReviewDetail[];
}
export interface EssayReviewCitation { id: string; title: string; citation: string; page: number | null }
export interface EssayReviewMessage {
  id: string;
  essayId: string;
  correctionId: string | null;
  reviewId: string | null;
  authorId: string | null;
  role: 'EVALUATOR' | 'AI' | 'SYSTEM';
  content: string;
  citationsJson: EssayReviewCitation[] | null;
  anchorJson: { text: string } | null;
  model: string | null;
  createdAt: string;
  author?: { id: string; profile: { firstName: string; lastName: string | null } | null } | null;
}
export interface EssayLearningRecord {
  id: string;
  essayId: string;
  correctionId: string | null;
  reviewId: string | null;
  reviewDetailId: string | null;
  competency: EssayCompetencyId;
  criterion: string | null;
  aiScore: number | null;
  humanScore: number | null;
  evidence: string | null;
  aiJustification: string | null;
  humanJustification: string | null;
  divergenceReason: string | null;
  decision: EssayReviewDecision | null;
  learning: string;
  confidence: number | null;
  applicability: string | null;
  level: EssayLearningLevel;
  origin: string;
  anonymized: boolean;
  consentAt: string | null;
  version: number;
  validatedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUser?: { id: string; profile: { firstName: string; lastName: string | null } | null } | null;
  validatedByUser?: { id: string; profile: { firstName: string; lastName: string | null } | null } | null;
}
export interface EssayReviewWorkspace {
  essay: EssayReviewEssay;
  correction: EssayReviewCorrection | null;
  reviews: EssayReview[];
  messages: EssayReviewMessage[];
  learning: EssayLearningRecord[];
  canReview: boolean;
  canValidate: boolean;
  latestReview: EssayReview | null;
  knowledge: { activeDocument: { id: string; title: string; version: string; publishedAt: string; sourceUrl: string } | null; promptVersion: string };
}
export interface EssayReviewQueueItem {
  id: string;
  status: EssayReviewStatus;
  validationLevel: EssayLearningLevel;
  totalScore: number;
  aiTotalScore: number;
  divergence: EssayReview['divergenceJson'];
  updatedAt: string;
  evaluator: { id: string; name: string };
  essay: { id: string; title: string; theme: string; version: number; owner: string };
  competencies: { competency: EssayCompetencyId; aiScore: number; humanScore: number; decision: EssayReviewDecision }[];
}
export interface EssayReviewCompetencyInput {
  competency: EssayCompetencyId;
  score: number;
  decision?: EssayReviewDecision;
  criterion?: string;
  justification?: string;
  evidence?: string[];
  anchorText?: string;
}
export interface EssayReviewSubmission {
  decision?: EssayReviewDecision;
  generalFeedback?: string;
  competencies: EssayReviewCompetencyInput[];
}
export interface EssayReviewChatInput {
  message: string;
  competency?: EssayCompetencyId;
  anchorText?: string;
  reviewId?: string;
}
export interface EssayReviewValidationInput {
  level: 'VALIDATED' | 'CONSOLIDATED';
  notes?: string;
  consentConfirmed?: boolean;
}
export interface EssayReviewLearningInput {
  competency: EssayCompetencyId;
  learning: string;
  criterion?: string;
  evidence?: string;
  justification?: string;
  applicability?: string;
  confidence?: number;
}
export interface EssayReviewDivergenceBucket {
  competency: EssayCompetencyId;
  label: string;
  reviews: number;
  disagreements: number;
  averageDifference: number;
  averageSignedDifference: number;
  maxDifference: number;
  criteria: Record<string, number>;
  examples: { reviewId: string; essayId: string; aiScore: number; humanScore: number; justification: string | null }[];
}
export interface EssayReviewDivergenceReport {
  summary: {
    reviews: number;
    disputed: number;
    validated: number;
    consolidated: number;
    averageTotalDifference: number;
    topCriteria: { criterion: string; count: number }[];
  };
  byCompetency: EssayReviewDivergenceBucket[];
  note: string;
}
export const apiEssayReviewWorkspace = (token: string, essayId: string): Promise<EssayReviewWorkspace> =>
  request(`/essays/${essayId}/review`, { headers: essayHeaders(token) });
export const apiEssayReviewSubmit = (token: string, essayId: string, data: EssayReviewSubmission): Promise<EssayReview> =>
  request(`/essays/${essayId}/reviews`, { method: 'POST', headers: essayHeaders(token), body: JSON.stringify(data) });
export const apiEssayReviewChat = (token: string, essayId: string, data: EssayReviewChatInput): Promise<{ messages: EssayReviewMessage[]; citations: EssayReviewCitation[]; model: string | null; promptVersion: string }> =>
  request(`/essays/${essayId}/review/chat`, { method: 'POST', headers: essayHeaders(token), body: JSON.stringify(data) });
export const apiEssayReviewLearning = (token: string, essayId: string, data: EssayReviewLearningInput): Promise<EssayLearningRecord> =>
  request(`/essays/${essayId}/review/learning`, { method: 'POST', headers: essayHeaders(token), body: JSON.stringify(data) });
export const apiEssayReviewQueue = (token: string, status?: EssayReviewStatus): Promise<{ items: EssayReviewQueueItem[] }> =>
  request(`/essay-reviews/queue${status ? `?status=${encodeURIComponent(status)}` : ''}`, { headers: essayHeaders(token) });
export const apiEssayReviewDivergences = (token: string): Promise<EssayReviewDivergenceReport> =>
  request('/essay-reviews/divergences', { headers: essayHeaders(token) });
export const apiEssayReview = (token: string, reviewId: string): Promise<EssayReview> =>
  request(`/essay-reviews/${encodeURIComponent(reviewId)}`, { headers: essayHeaders(token) });
export const apiEssayReviewAudit = (token: string, reviewId: string): Promise<{ reviewId: string; events: { id: string; action: string; entity: string; entityId: string; beforeJson: unknown; afterJson: unknown; metadataJson: unknown; createdAt: string; actor: { id: string; profile: { firstName: string; lastName: string | null } | null } | null }[] }> =>
  request(`/essay-reviews/${encodeURIComponent(reviewId)}/audit`, { headers: essayHeaders(token) });
export const apiEssayReviewValidate = (token: string, reviewId: string, data: EssayReviewValidationInput): Promise<EssayReview> =>
  request(`/essay-reviews/${encodeURIComponent(reviewId)}/validate`, { method: 'POST', headers: essayHeaders(token), body: JSON.stringify(data) });
export const apiEssayLearningValidate = (token: string, learningId: string, data: EssayReviewValidationInput): Promise<EssayLearningRecord> =>
  request(`/essay-learning/${encodeURIComponent(learningId)}/validate`, { method: 'POST', headers: essayHeaders(token), body: JSON.stringify(data) });
export const apiEssayLearningArchive = (token: string, learningId: string): Promise<{ id: string; archived: boolean }> =>
  request(`/essay-learning/${encodeURIComponent(learningId)}`, { method: 'DELETE', headers: essayHeaders(token) });

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
  acceptTerms: true;
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

export function apiAcceptTerms(accessToken: string, version: string): Promise<ApiUser> {
  return request('/users/me/accept-terms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ version }),
  });
}

export type QuestionDifficulty = "FACIL" | "MEDIA" | "DIFICIL";
export type QuestionSourceType = "OFFICIAL" | "PARTNER" | "GENERATED" | "IMPORTED";

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
  sourceType?: QuestionSourceType;
  sourceName?: string;
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
  enemSkill?: import("@/lib/enem-skills").QuestionEnemSkill | null;
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
  enemSkill?: string;
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
  /** Só na edição: habilidade do ENEM definida/confirmada (null remove). */
  enemSkill?: string | null;
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
}

export type TeacherAnalyticsRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type TeacherAnalyticsSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type TeacherAnalyticsSignalKind =
  | 'CLASS_LOW_ACCURACY'
  | 'STUDENT_LOW_ACCURACY'
  | 'STUDENT_INACTIVITY'
  | 'STUDENT_ERROR_STREAK'
  | 'DIFFICULT_QUESTION'
  | 'STUDENT_PERFORMANCE_DROP'
  | 'STUDENT_OVERDUE_TASKS';

export interface TeacherAnalyticsRiskReason {
  kind: TeacherAnalyticsSignalKind;
  label: string;
  severity: TeacherAnalyticsSeverity;
}

export interface TeacherAnalyticsStudent {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  submissions: number;
  answerCount: number;
  correctCount: number;
  accuracy: number | null;
  studyMinutes: number;
  lastActivityAt: string | null;
  errorStreak: number;
  riskLevel: TeacherAnalyticsRiskLevel;
  riskReasons: TeacherAnalyticsRiskReason[];
}

export interface TeacherAnalyticsQuestion {
  key: string;
  questionId: string | null;
  stem: string;
  subject: string;
  simulationCount: number;
  attempts: number;
  correctCount: number;
  blankCount: number;
  accuracy: number | null;
}

export interface TeacherAnalyticsClass {
  id: string;
  name: string;
  joinCode: string;
  studentCount: number;
  activeStudentCount: number;
  participationRate: number;
  submissionCount: number;
  answerCount: number;
  correctCount: number;
  accuracy: number | null;
  studyMinutes: number;
  studentsAtRisk: number;
  lastActivityAt: string | null;
  students: TeacherAnalyticsStudent[];
  difficultQuestions: TeacherAnalyticsQuestion[];
}

export interface TeacherAnalyticsSignal {
  id: string;
  kind: TeacherAnalyticsSignalKind;
  severity: TeacherAnalyticsSeverity;
  classId: string | null;
  className: string | null;
  studentId: string | null;
  studentName: string | null;
  questionKey: string | null;
  subject: string | null;
  title: string;
  detail: string;
  recommendation: string;
  metric: number | null;
}

export interface TeacherAnalyticsEvolutionPoint {
  day: string;
  submissions: number;
  answers: number;
  correctCount: number;
  accuracy: number | null;
  studyMinutes: number;
}

export interface TeacherAnalyticsResult {
  generatedAt: string;
  period: { days: number; from: string; to: string };
  summary: {
    classCount: number;
    studentCount: number;
    activeStudentCount: number;
    participationRate: number;
    submissionCount: number;
    answerCount: number;
    correctCount: number;
    accuracy: number | null;
    studyMinutes: number;
    studentsAtRisk: number;
    questionCount: number;
  };
  classes: TeacherAnalyticsClass[];
  questions: TeacherAnalyticsQuestion[];
  subjects: Array<{ subject: string; attempts: number; correctCount: number; accuracy: number | null }>;
  evolution: TeacherAnalyticsEvolutionPoint[];
  signals: TeacherAnalyticsSignal[];
}

export const apiSimulationClasses = (token: string): Promise<SimulationClass[]> => request('/simulations/classes', { headers: authHeaders(token) });
export const apiTeacherDashboard = (token: string): Promise<TeacherDashboard> => request('/simulations/teacher/dashboard', { headers: authHeaders(token) });
export const apiTeacherAnalytics = (token: string, params?: { days?: number; classId?: string }): Promise<TeacherAnalyticsResult> => {
  const query = new URLSearchParams();
  if (params?.days) query.set('days', String(params.days));
  if (params?.classId) query.set('classId', params.classId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/institutional-analytics/teacher${suffix}`, { headers: authHeaders(token) });
};
export type PedagogicalAlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
export interface PedagogicalAlert {
  id: string;
  kind: TeacherAnalyticsSignalKind;
  severity: TeacherAnalyticsSeverity;
  status: PedagogicalAlertStatus;
  classId: string | null;
  className: string | null;
  studentId: string | null;
  studentName: string | null;
  questionKey: string | null;
  title: string;
  detail: string;
  recommendation: string;
  autoResolved: boolean;
  reopenCount: number;
  note: string | null;
  history: { at: string; by: string | null; from: PedagogicalAlertStatus | null; to: PedagogicalAlertStatus; note?: string }[];
  firstSeenAt: string;
  lastSeenAt: string;
  closedAt: string | null;
}
export const apiPedagogicalAlerts = (token: string): Promise<{ generatedAt: string; windowDays: number; items: PedagogicalAlert[] }> =>
  request('/institutional-analytics/teacher/alerts', { headers: authHeaders(token) });
export const apiUpdatePedagogicalAlert = (token: string, id: string, payload: { status: PedagogicalAlertStatus; note?: string }) =>
  request(`/institutional-analytics/teacher/alerts/${id}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(payload) });
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
/** Link de convite da turma (quem gerencia). Aluno independente só entra por ele. */
export const apiClassInviteLink = (token: string, classId: string): Promise<{ token: string; expiresAt: string }> => request(`/simulations/classes/${classId}/invite-link`, { headers: authHeaders(token) });
export const apiAcceptClassInvite = (token: string, inviteToken: string): Promise<SimulationClass> => request('/simulations/classes/invite/accept', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ token: inviteToken }) });

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
/** Envia a foto e já devolve a leitura (COMPLETED ou FAILED com o motivo). */
export const apiQuestionScanCompleteUpload = (token: string, id: string, dto: { fileUrl: string; width: number; height: number; sizeBytes: number }): Promise<QuestionScanProcessingResponseDto> => request(`/simulations/question-scans/upload/${id}/complete`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(dto) });
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
  if (filters.enemSkill) params.set("enemSkill", filters.enemSkill);
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

/** Cria uma variação inédita da questão com a LuminIA. O servidor carrega o
 * contexto, valida a resposta da IA e salva a nova questão no workspace
 * pessoal antes de devolvê-la já no formato de resolução. */
export function apiGenerateSimilarQuestion(
  accessToken: string,
  questionId: string
): Promise<Question> {
  return request(SIMILAR_QUESTION_ENDPOINT, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: buildSimilarQuestionPayload(questionId),
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
  /** Provedor ativo: "tavily" ou "google-cse" (busca real) ou "demo" (demonstração). */
  provider: string;
  /** true quando a busca NÃO saiu de um provedor real (sem chaves da Tavily nem do Google CSE). */
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
// Central de revisões (item 31)
// =============================================================================

export type ReviewQueueKind = "TOPIC" | "ERROR_NOTEBOOK" | "FLASHCARD" | "MARKED_QUESTION";

export interface ReviewQueueItem {
  kind: ReviewQueueKind;
  id: string;
  questionId: string | null;
  subjectId: string | null;
  subject: string;
  topicId: string | null;
  topic: string;
  dueAt: string | null;
  masteryScore: number | null;
  status: string | null;
  attempts: number | null;
  correctAttempts: number | null;
  accuracy: number | null;
  wrongAttempts: number | null;
  correctStreak: number | null;
  difficulty: QuestionDifficulty | null;
  exam: string | null;
  year: number | null;
  stem: string | null;
  lastAttemptAt: string | null;
}

export interface ReviewQueueDue {
  total: number;
  topics: number;
  errorNotebook: number;
  flashcards: number;
  items: ReviewQueueItem[];
  truncated: boolean;
}

export interface ReviewQueueManual {
  total: number;
  items: ReviewQueueItem[];
  truncated: boolean;
}

export interface ReviewQueueResponse {
  generatedAt: string;
  due: ReviewQueueDue;
  manual: ReviewQueueManual;
  nextReviewAt: string | null;
}

/**
 * Fila unificada de revisões. `limit` limita cada seção no servidor; os
 * contadores continuam sendo o total real, para o aviso do painel não mentir.
 */
export function apiGetReviewQueue(
  accessToken: string,
  limit = 20
): Promise<ReviewQueueResponse> {
  return request(`/users/me/review-queue?limit=${limit}`, {
    headers: authHeaders(accessToken),
  });
}

// =============================================================================
// Flashcards e revisão espaçada do cartão (item 32)
// =============================================================================

export type FlashcardSource = "MANUAL" | "ERROR_NOTEBOOK" | "AI";
export type FlashcardRating = "AGAIN" | "HARD" | "GOOD" | "EASY";

export interface Flashcard {
  id: string;
  source: FlashcardSource;
  front: string;
  back: string;
  subjectId: string | null;
  subject: string | null;
  topicId: string | null;
  topic: string | null;
  sourceQuestionId: string | null;
  reviewCount: number;
  correctCount: number;
  accuracy: number | null;
  streak: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: string | null;
  lastReviewedAt: string | null;
  due: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardReviewHistory {
  id: string;
  rating: FlashcardRating;
  remembered: boolean;
  reviewedAt: string;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: string | null;
}

export interface FlashcardHistory {
  flashcard: Flashcard;
  reviews: FlashcardReviewHistory[];
}

export interface FlashcardSummary {
  total: number;
  due: number;
  newCards: number;
  totalReviews: number;
  rememberedReviews: number;
  accuracy: number | null;
  reviewedToday: number;
}

export interface CreateFlashcardPayload {
  front: string;
  back: string;
  subjectId?: string | null;
  topicId?: string | null;
}

export type UpdateFlashcardPayload = Partial<CreateFlashcardPayload>;

export function apiListFlashcards(
  accessToken: string,
  options: { due?: boolean; source?: FlashcardSource; subjectId?: string; topicId?: string } = {}
): Promise<Flashcard[]> {
  const params = new URLSearchParams();
  if (options.due) params.set("due", "true");
  if (options.source) params.set("source", options.source);
  if (options.subjectId) params.set("subjectId", options.subjectId);
  if (options.topicId) params.set("topicId", options.topicId);
  const suffix = params.toString();
  return request(`/flashcards${suffix ? `?${suffix}` : ""}`, {
    headers: authHeaders(accessToken),
  });
}

export function apiGetFlashcardSummary(accessToken: string): Promise<FlashcardSummary> {
  return request("/flashcards/summary", { headers: authHeaders(accessToken) });
}

export function apiCreateFlashcard(
  accessToken: string,
  payload: CreateFlashcardPayload
): Promise<Flashcard> {
  return request("/flashcards", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export interface GenerateFlashcardsPayload {
  content: string;
  count?: number;
  subjectId?: string | null;
  topicId?: string | null;
}

export interface GenerateFlashcardsFromPdfPayload {
  /** PDF em data URL. O servidor lê em memória e não armazena o arquivo. */
  pdf: string;
  count?: number;
  subjectId?: string | null;
  topicId?: string | null;
}

export function apiGenerateFlashcards(
  accessToken: string,
  payload: GenerateFlashcardsPayload
): Promise<Flashcard[]> {
  return request("/flashcards/generate", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiGenerateFlashcardsFromPdf(
  accessToken: string,
  payload: GenerateFlashcardsFromPdfPayload
): Promise<Flashcard[]> {
  return request("/flashcards/generate/from-pdf", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiCreateFlashcardFromError(
  accessToken: string,
  questionId: string,
  payload: { front?: string; back?: string } = {}
): Promise<Flashcard> {
  return request(`/flashcards/from-error/${questionId}`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiUpdateFlashcard(
  accessToken: string,
  id: string,
  payload: UpdateFlashcardPayload
): Promise<Flashcard> {
  return request(`/flashcards/${id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function apiDeleteFlashcard(accessToken: string, id: string): Promise<{ deleted: true; id: string }> {
  return request(`/flashcards/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export function apiReviewFlashcard(
  accessToken: string,
  id: string,
  rating: FlashcardRating
): Promise<Flashcard> {
  return request(`/flashcards/${id}/review`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ rating }),
  });
}

export function apiGetFlashcardHistory(
  accessToken: string,
  id: string
): Promise<FlashcardHistory> {
  return request(`/flashcards/${id}/history`, {
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

/** Uma linha de domínio por tópico já estudado, para o mapa de domínio. */
export interface TopicMasteryEntry {
  id: string;
  subjectId: string;
  subject: string;
  topicId: string;
  topic: string;
  masteryScore: number;
  attempts: number;
  correctAttempts: number;
  correctStreak: number;
  status: TopicMasteryStatus;
  lastStudiedAt: string | null;
  nextReviewAt: string | null;
  /** Revisão espaçada vencida no momento em que a API respondeu. */
  due: boolean;
}

export function apiGetTopicMastery(accessToken: string): Promise<TopicMasteryEntry[]> {
  return request("/users/me/topic-mastery", { headers: authHeaders(accessToken) });
}

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

export type {
  Formula,
  FormulaPayload,
  FormulaQuery,
  FormulaSummary,
  NotebookCollection,
  Repertoire,
  RepertoirePayload,
  RepertoireQuery,
  RepertoireSummary,
  RepertoireAiResult,
} from "@/lib/notebooks";
/** Compatibilidade com o nome antigo. */
export type CreateFormulaPayload = FormulaPayload;
export type UpdateFormulaPayload = Partial<FormulaPayload>;
export type CreateRepertoirePayload = RepertoirePayload;
export type UpdateRepertoirePayload = Partial<RepertoirePayload>;

type NotebookPath = "formulas" | "repertoires";
const json = (accessToken: string, method: string, body?: unknown) => ({
  method,
  headers: authHeaders(accessToken),
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function apiListFormulas(accessToken: string, query: FormulaQuery = {}): Promise<Formula[]> {
  return request(`/formulas${toQueryString(query)}`, { headers: authHeaders(accessToken) });
}
export const apiFormulaSummary = (accessToken: string): Promise<FormulaSummary> => request("/formulas/summary", { headers: authHeaders(accessToken) });
export const apiCreateFormula = (accessToken: string, payload: FormulaPayload): Promise<Formula> => request("/formulas", json(accessToken, "POST", payload));
export const apiUpdateFormula = (accessToken: string, id: string, payload: Partial<FormulaPayload>): Promise<Formula> => request(`/formulas/${id}`, json(accessToken, "PATCH", payload));
export const apiDeleteFormula = (accessToken: string, id: string): Promise<{ deleted: boolean; id: string }> => request(`/formulas/${id}`, json(accessToken, "DELETE"));
export const apiCopyFormula = (accessToken: string, id: string): Promise<Formula> => request(`/formulas/${id}/copy`, json(accessToken, "POST"));
export const apiFormulaAi = (accessToken: string, payload: { action: FormulaAiAction; id: string }): Promise<{ text: string; disclaimer: string }> =>
  request("/formulas/ai", json(accessToken, "POST", payload));

export function apiListRepertoires(accessToken: string, query: RepertoireQuery = {}): Promise<Repertoire[]> {
  return request(`/repertoires${toQueryString(query)}`, { headers: authHeaders(accessToken) });
}
export const apiRepertoireSummary = (accessToken: string): Promise<RepertoireSummary> => request("/repertoires/summary", { headers: authHeaders(accessToken) });
export const apiCreateRepertoire = (accessToken: string, payload: RepertoirePayload): Promise<Repertoire> => request("/repertoires", json(accessToken, "POST", payload));
export const apiUpdateRepertoire = (accessToken: string, id: string, payload: Partial<RepertoirePayload>): Promise<Repertoire> =>
  request(`/repertoires/${id}`, json(accessToken, "PATCH", payload));
export const apiDeleteRepertoire = (accessToken: string, id: string): Promise<{ deleted: boolean; id: string }> => request(`/repertoires/${id}`, json(accessToken, "DELETE"));
export const apiCopyRepertoire = (accessToken: string, id: string): Promise<Repertoire> => request(`/repertoires/${id}/copy`, json(accessToken, "POST"));
export const apiRepertoireAi = (
  accessToken: string,
  payload: { action: RepertoireAiAction; theme?: string; ids?: string[]; part?: "INTRODUCAO" | "DESENVOLVIMENTO"; paragraph?: string },
): Promise<RepertoireAiResult> => request("/repertoires/ai", json(accessToken, "POST", payload));

export const apiListCollections = (accessToken: string, notebook: NotebookPath): Promise<NotebookCollection[]> =>
  request(`/${notebook}/collections`, { headers: authHeaders(accessToken) });
export const apiCreateCollection = (accessToken: string, notebook: NotebookPath, payload: { name: string; description?: string | null }): Promise<NotebookCollection> =>
  request(`/${notebook}/collections`, json(accessToken, "POST", payload));
export const apiUpdateCollection = (accessToken: string, notebook: NotebookPath, id: string, payload: { name?: string; description?: string | null }): Promise<NotebookCollection> =>
  request(`/${notebook}/collections/${id}`, json(accessToken, "PATCH", payload));
export const apiDeleteCollection = (accessToken: string, notebook: NotebookPath, id: string): Promise<{ deleted: boolean }> =>
  request(`/${notebook}/collections/${id}`, json(accessToken, "DELETE"));
export const apiAddToCollection = (accessToken: string, notebook: NotebookPath, id: string, ids: string[]): Promise<{ added: number }> =>
  request(`/${notebook}/collections/${id}/items`, json(accessToken, "POST", { ids }));
export const apiRemoveFromCollection = (accessToken: string, notebook: NotebookPath, id: string, itemId: string): Promise<unknown> =>
  request(`/${notebook}/collections/${id}/items/${itemId}`, json(accessToken, "DELETE"));

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
  /** Edição dentro do ano (ex.: "D2-AMARELO"); vazio quando há um caderno só. */
  edition?: string;
  pdfUrl: string | null;
  pageImagesJson: string[] | null;
  metadataJson: { totalPages?: number; hasGabarito?: boolean; hasCaderno?: boolean; sourceUrl?: string; day?: number; bookletColor?: string | null } | null;
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
  /** Questão no banco: abre a resolução em /app/questoes?questionId=… */
  questionId?: string;
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
  questions: { number: number; displayNumber?: number; label: { x: number; y: number }; bubbles: { position: number; x: number; y: number; r: number }[] }[];
  header: { x: number; y: number; width: number; height: number };
  options?: SheetOptions;
  sections?: SheetSection[];
  gridColumns?: { x: number; y: number; width: number; height: number; rowLines: number[] }[];
  notes?: string[];
}
/** O que o gestor escolhe para o cartão-resposta. */
export interface SheetOptions {
  showInstitution: boolean;
  institutionName: string | null;
  instructions: string[];
  phrase: string | null;
  bookletColors: string[];
  foreignLanguage: boolean;
  firstQuestionNumber: number;
}
export type SheetSection =
  | { kind: 'boxes'; key: 'institution' | 'student'; label: string; x: number; y: number; cell: number; columns: number; rows: number }
  | { kind: 'text'; key: 'institution'; label: string; text: string; x: number; y: number; width: number; height: number }
  | { kind: 'instructions'; title: string; lines: string[]; x: number; y: number; width: number; height: number; lineHeight: number }
  | { kind: 'phrase'; title: string; text: string; x: number; y: number; width: number; height: number }
  | { kind: 'choices'; key: 'booklet' | 'language'; title: string; choices: { label: string; x: number; y: number; r: number }[]; x: number; y: number; width: number; height: number };
export interface PrintableSheets {
  simulation: { id: string; title: string; className: string | null; questionCount: number };
  layout: SheetLayout;
  sheets: { code: number; bits: boolean[]; studentId: string | null; studentName: string | null }[];
  /** Gestor (professor/coordenação/direção) personaliza; `locked` = já há folhas lidas. */
  customization?: { canCustomize: boolean; locked: boolean; legacy: boolean; options: SheetOptions; notes: string[] };
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
export const apiAnswerSheetSaveOptions = (token: string, simulationId: string, options: SheetOptions): Promise<PrintableSheets> =>
  request(`/answer-sheets/simulations/${simulationId}/options`, { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(options) });
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

// ---------------------------------------------------------------- Gabarito Inteligente

export type AnswerKeyOrigin = 'OFFICIAL' | 'TEACHER' | 'AI_SUGGESTED' | 'COMMUNITY';
export type AnswerKeyStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type AnswerKeyCheckStatus = 'CORRECT' | 'WRONG' | 'BLANK' | 'PENDING' | 'ANNULLED';
export interface AnswerKeyExam { id: string; name: string; year: number | null; institution: string | null }
export interface AnswerKeySummary {
  id: string;
  exam: AnswerKeyExam;
  application: string;
  day: number | null;
  bookletColor: string | null;
  area: string | null;
  origin: AnswerKeyOrigin;
  official: boolean;
  status: AnswerKeyStatus;
  sourceName: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  version: number;
  correctionNote: string | null;
  questionCount: number;
  author: string | null;
  mine: boolean;
  updatedAt: string;
}
export interface AnswerKeyItem { number: number; language: string; area: string | null; validated: boolean; answer?: number | null; justification?: string | null; confidence?: number | null; questionId?: string | null }
export interface AnswerKeyDetail extends AnswerKeySummary { needsLanguage: boolean; languages: string[]; numbers: number[]; linkedQuestions: number; items: AnswerKeyItem[] }
export interface AnswerKeyAreaResult { area: string; correct: number; wrong: number; blank: number; scored: number; percent: number }
export interface AnswerKeyCheckResult {
  id: string;
  createdAt: string;
  answerKey: AnswerKeySummary;
  outdated: boolean;
  questions: { number: number; language: string; area: string | null; selected: number | null; answer: number | null; status: AnswerKeyCheckStatus; questionId: string | null; agreement?: number | null }[];
  correct: number; wrong: number; blank: number; pending: number; annulled: number; total: number; answered: number; percent: number;
  byArea: AnswerKeyAreaResult[];
  provisional: { matches: number; differs: number; blank: number };
}
export interface AnswerKeyExplanation {
  number: number;
  language: string;
  questionId: string;
  subject: string;
  area: string | null;
  stem: string;
  alternatives: { position: number; text: string }[];
  correct: number | null;
  selected: number | null;
  explanation: string;
  model: string | null;
  source: 'ai' | 'rules';
  hasImage: boolean;
}
export interface AnswerKeyLinkResult { linked: number; total: number; missing: number[] }
export interface AnswerKeyPerformance {
  checks: number; correct: number; wrong: number; blank: number; percent: number;
  byArea: AnswerKeyAreaResult[];
  history: { id: string; createdAt: string; answerKey: AnswerKeySummary; correct: number; wrong: number; blank: number; pending: number; total: number; percent: number; outdated: boolean }[];
  difficultQuestions: { checkId: string; answerKeyId: string; label: string; number: number; area: string | null; selected: number | null; answer: number | null; misses: number }[];
}
export interface CreateAnswerKeyPayload {
  examId?: string; examName?: string; examYear?: number; application?: string; day?: number | null; bookletColor?: string | null;
  origin: AnswerKeyOrigin; sourceName?: string; sourceUrl?: string; publishedAt?: string; publish?: boolean;
  items: { number: number; answer: number | null; language?: string }[];
}
export interface SuggestAnswerKeyPayload {
  examId: string;
  application?: string;
  day?: number | null;
  bookletColor?: string | null;
  area?: string | null;
  numbers?: number[];
  language?: 'INGLES' | 'ESPANHOL';
}
export interface AnswerKeySuggestionResult {
  answerKey: AnswerKeyDetail;
  counts: { ai: number; known: number; skipped: number; missing: number };
  skipped: { number: number; language: string; reason: string }[];
  missing: { number: number; language: string }[];
  models: string[];
}
export interface ValidateAnswerKeyItemPayload {
  number: number;
  language?: string;
  answer?: number | null;
  justification?: string | null;
}

export const apiAnswerKeys = (token: string, filters: { examId?: string; year?: number; day?: number } = {}): Promise<AnswerKeySummary[]> => {
  const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  return request(`/answer-keys${q.size ? `?${q}` : ''}`, { headers: authHeaders(token) });
};
export const apiAnswerKeyExams = (token: string): Promise<AnswerKeyExam[]> => request('/answer-keys/exams', { headers: authHeaders(token) });
export const apiAnswerKey = (token: string, id: string, withAnswers = false): Promise<AnswerKeyDetail> => request(`/answer-keys/${id}${withAnswers ? '?answers=true' : ''}`, { headers: authHeaders(token) });
export const apiCreateAnswerKey = (token: string, payload: CreateAnswerKeyPayload): Promise<AnswerKeyDetail> => request('/answer-keys', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
export const apiSuggestAnswerKey = (token: string, payload: SuggestAnswerKeyPayload): Promise<AnswerKeySuggestionResult> =>
  request('/answer-keys/ai-suggestions', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
export const apiValidateAnswerKeyItems = (token: string, id: string, items: ValidateAnswerKeyItemPayload[]): Promise<AnswerKeyDetail> =>
  request(`/answer-keys/${id}/items/validate`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ items }) });
export const apiSetAnswerKeyStatus = (token: string, id: string, status: AnswerKeyStatus): Promise<AnswerKeyDetail> => request(`/answer-keys/${id}/status`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ status }) });
export const apiCheckAnswerKey = (token: string, id: string, answers: Record<string, number | null>, language?: string | null, inputMode: 'MANUAL' | 'PHOTO' = 'MANUAL'): Promise<AnswerKeyCheckResult> => request(`/answer-keys/${id}/checks`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ answers, language: language ?? undefined, inputMode }) });
export const apiAnswerKeyCheck = (token: string, checkId: string): Promise<AnswerKeyCheckResult> => request(`/answer-keys/checks/${checkId}`, { headers: authHeaders(token) });
export const apiExplainAnswerKeyQuestion = (token: string, id: string, number: number, selected: number | null, language?: string | null): Promise<AnswerKeyExplanation> => {
  const q = new URLSearchParams();
  if (selected !== null) q.set('selected', String(selected));
  if (language) q.set('language', language);
  return request(`/answer-keys/${id}/questions/${number}/explanation${q.size ? `?${q}` : ''}`, { headers: authHeaders(token) });
};
export const apiLinkAnswerKeyQuestions = (token: string, id: string): Promise<AnswerKeyLinkResult> =>
  request(`/answer-keys/${id}/link-questions`, { method: 'POST', headers: authHeaders(token) });
export const apiAnswerKeyPerformance = (token: string): Promise<AnswerKeyPerformance> => request('/answer-keys/performance', { headers: authHeaders(token) });
export const apiImportInepAnswerKey = (token: string, payload: { gabaritoUrl: string; publishedAt: string; application?: string; publish?: boolean }): Promise<AnswerKeyDetail> =>
  request('/answer-keys/import/inep', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
export interface AnswerKeySheet { title: string; layout: SheetLayout; code: number; bits: boolean[] }
export interface AnswerKeySheetReading { answers: { number: number; selected: number | null; status: 'OK' | 'BLANK' | 'MULTIPLE' | 'AMBIGUOUS'; confidence: number; review: boolean }[]; warnings: string[]; reviewCount: number }
export const apiAnswerKeySheet = (token: string, id: string): Promise<AnswerKeySheet> => request(`/answer-keys/${id}/sheet`, { headers: authHeaders(token) });
export const apiReadAnswerKeySheet = (token: string, id: string, pdf: string): Promise<AnswerKeySheetReading> => request(`/answer-keys/${id}/read-sheet`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ pdf }) });
export interface AnswerKeyStats {
  answerKey: AnswerKeySummary;
  students: number;
  averagePercent: number;
  byArea: { area: string; percent: number; scored: number }[];
  questions: { number: number; area: string | null; answer: number | null; correctPercent: number; wrong: number; blank: number; total: number; topDistractor: { position: number; count: number } | null }[];
  ranking: { userId: string; name: string; percent: number; correct: number; scored: number; checkedAt: string }[];
}
export const apiAnswerKeyStats = (token: string, id: string): Promise<AnswerKeyStats> => request(`/answer-keys/${id}/stats`, { headers: authHeaders(token) });
export const apiContributeCommunity = (token: string, payload: { examId: string; application?: string; day?: number | null; bookletColor?: string | null; language?: string; answers: Record<string, number | null> }): Promise<AnswerKeyDetail> =>
  request('/answer-keys/community/contributions', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });

// ------------------------------------------------------------ planos
export type { BillingMe, CheckoutBillingType, SubscriptionView } from "@/lib/plans";

export const apiBillingMe = (token: string): Promise<BillingMe> => request('/billing/me', { headers: authHeaders(token) });
export const apiBillingCheckout = (token: string, payload: { cpfCnpj: string; cycle: BillingCycle; installments?: number; billingType?: CheckoutBillingType }): Promise<{ subscription: SubscriptionView }> =>
  request('/billing/checkout', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
export const apiBillingCancel = (token: string): Promise<{ subscription: SubscriptionView; refunded?: boolean }> =>
  request('/billing/cancel', { method: 'POST', headers: authHeaders(token) });

// ------------------------------------------------- provas anteriores (PDF e importação)

/** Baixa o PDF da prova pelo backend (o navegador não acessa o INEP direto). */
export async function apiExamPaperPdfBlobUrl(token: string, id: string): Promise<string> {
  const response = await fetch(`${API_URL}/exam-papers/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new ApiError(response.status, response.status === 404 ? 'O PDF desta prova não está disponível.' : 'Não foi possível carregar o PDF da prova.');
  return URL.createObjectURL(await response.blob());
}

export interface EnemPaperImportItem { year: number; day: 1 | 2; provaUrl: string; gabaritoUrl: string }
export interface EnemPaperImportResult {
  year: number;
  day: number;
  status: 'OK' | 'ERROR';
  paperId?: string;
  edition?: string;
  totalPages?: number;
  questions?: { imported: number; duplicates: number; invalid: number; skipped: number };
  linked?: number;
  message?: string;
}
export const apiImportEnemPapers = (token: string, items: EnemPaperImportItem[], publish: boolean): Promise<{ items: EnemPaperImportResult[] }> =>
  request('/exam-papers/import/enem', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ items, publish }) });

/** Evolução do domínio por semana (mapa de domínio). */
export const apiGetMasteryEvolution = (accessToken: string, weeks = 8): Promise<import("@/lib/mastery-evolution").MasteryEvolution> =>
  request(`/users/me/topic-mastery/evolution?weeks=${weeks}`, { headers: authHeaders(accessToken) });

/** Videoaulas do YouTube para um assunto, no nível do aluno (item 24). */
export interface VideoLesson {
  id: string;
  title: string;
  channel: string;
  url: string;
  thumbnailUrl: string;
  duration: string;
  durationSeconds: number;
  level: 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';
  reason: string;
}
export interface VideoLessonsResult {
  topic: string;
  subject: string | null;
  level: VideoLesson['level'];
  levelLabel: string;
  mastery: number | null;
  query: string;
  searchUrl: string;
  configured: boolean;
  videos: VideoLesson[];
}
export const apiVideoLessons = (accessToken: string, params: { topicId?: string; topic?: string; subject?: string }): Promise<VideoLessonsResult> => {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][]);
  return request(`/ai/videos?${query}`, { headers: authHeaders(accessToken) });
};

/** Matriz de Referência do ENEM (texto oficial do Inep). Cacheada na sessão. */
let enemMatrixPromise: Promise<import("@/lib/enem-skills").EnemMatrix> | null = null;
export function apiGetEnemMatrix(accessToken: string): Promise<import("@/lib/enem-skills").EnemMatrix> {
  enemMatrixPromise ??= request<import("@/lib/enem-skills").EnemMatrix>("/enem-matrix", { headers: authHeaders(accessToken) }).catch((e) => {
    enemMatrixPromise = null;
    throw e;
  });
  return enemMatrixPromise;
}

/** Acerto do aluno por habilidade do ENEM (mapa de domínio). */
export const apiGetSkillMastery = (accessToken: string): Promise<import("@/lib/enem-skills").SkillMasteryReport> =>
  request("/users/me/skill-mastery", { headers: authHeaders(accessToken) });

// ---- Lumina Groups (docs/LUMINA_GROUPS.md) ----
export const apiGroups = (accessToken: string): Promise<import("@/lib/groups").GroupSummary[]> =>
  request("/groups", { headers: authHeaders(accessToken) });
export const apiGroup = (accessToken: string, id: string): Promise<import("@/lib/groups").GroupDetail> =>
  request(`/groups/${id}`, { headers: authHeaders(accessToken) });
export const apiCreateGroup = (accessToken: string, payload: import("@/lib/groups").GroupPayload): Promise<import("@/lib/groups").GroupDetail> =>
  request("/groups", { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify(payload) });
export const apiUpdateGroup = (accessToken: string, id: string, payload: Partial<import("@/lib/groups").GroupPayload>): Promise<import("@/lib/groups").GroupDetail> =>
  request(`/groups/${id}`, { method: "PATCH", headers: authHeaders(accessToken), body: JSON.stringify(payload) });
export const apiGroupPreview = (accessToken: string, input: { code?: string; token?: string }): Promise<import("@/lib/groups").GroupPreview> =>
  request(`/groups/preview?${new URLSearchParams(input.token ? { token: input.token } : { code: input.code ?? "" })}`, { headers: authHeaders(accessToken) });
export const apiJoinGroup = (accessToken: string, input: { code?: string; token?: string }): Promise<{ groupId: string; status: import("@/lib/groups").GroupMemberStatus; alreadyMember: boolean }> =>
  input.token
    ? request("/groups/join-link", { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify({ token: input.token }) })
    : request("/groups/join", { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify({ code: input.code }) });
export const apiGroupInviteLink = (accessToken: string, id: string): Promise<{ token: string; expiresAt: string }> =>
  request(`/groups/${id}/invite-link`, { method: "POST", headers: authHeaders(accessToken) });
export const apiRegenerateGroupCode = (accessToken: string, id: string): Promise<{ joinCode: string }> =>
  request(`/groups/${id}/code`, { method: "POST", headers: authHeaders(accessToken) });
export const apiUpdateGroupSharing = (accessToken: string, id: string, sharing: Partial<import("@/lib/groups").GroupSharing>): Promise<import("@/lib/groups").GroupSharing> =>
  request(`/groups/${id}/me/sharing`, { method: "PATCH", headers: authHeaders(accessToken), body: JSON.stringify(sharing) });
export const apiLeaveGroup = (accessToken: string, id: string): Promise<{ left: boolean }> =>
  request(`/groups/${id}/leave`, { method: "POST", headers: authHeaders(accessToken) });

// Salas coletivas (etapa 2). As ações devolvem o estado das salas do grupo.
type RoomsState = import("@/lib/group-rooms").GroupRoomsState;
type JoinRoom = import("@/lib/group-rooms").JoinRoomPayload;
export const apiGroupRooms = (accessToken: string, groupId: string): Promise<RoomsState> =>
  request(`/groups/${groupId}/rooms`, { headers: authHeaders(accessToken) });
export const apiOpenGroupRoom = (accessToken: string, groupId: string, payload: JoinRoom & { title?: string | null }): Promise<RoomsState> =>
  request(`/groups/${groupId}/rooms`, { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify(payload) });
export const apiJoinGroupRoom = (accessToken: string, sessionId: string, payload: JoinRoom): Promise<RoomsState> =>
  request(`/groups/rooms/${sessionId}/join`, { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify(payload) });
export const apiRoomAction = (accessToken: string, sessionId: string, action: "pause" | "resume" | "leave"): Promise<RoomsState> =>
  request(`/groups/rooms/${sessionId}/${action}`, { method: "POST", headers: authHeaders(accessToken) });
export const apiUpdateRoomParticipation = (accessToken: string, sessionId: string, payload: JoinRoom): Promise<RoomsState> =>
  request(`/groups/rooms/${sessionId}/me`, { method: "PATCH", headers: authHeaders(accessToken), body: JSON.stringify(payload) });
export const apiRoomHeartbeat = (accessToken: string, sessionId: string): Promise<{ ok: boolean; studiedSeconds: number }> =>
  request(`/groups/rooms/${sessionId}/heartbeat`, { method: "POST", headers: authHeaders(accessToken) });
export const apiMyRoom = (accessToken: string): Promise<{ mine: import("@/lib/group-rooms").MyRoomParticipation | null }> =>
  request("/groups/rooms/me", { headers: authHeaders(accessToken) });
export const apiDecideGroupRequest = (accessToken: string, id: string, userId: string, decision: "approve" | "reject"): Promise<unknown> =>
  request(`/groups/${id}/members/${userId}/${decision}`, { method: "POST", headers: authHeaders(accessToken) });
export const apiChangeGroupRole = (accessToken: string, id: string, userId: string, role: Exclude<import("@/lib/groups").GroupRole, "OWNER">): Promise<unknown> =>
  request(`/groups/${id}/members/${userId}/role`, { method: "PATCH", headers: authHeaders(accessToken), body: JSON.stringify({ role }) });
export const apiRemoveGroupMember = (accessToken: string, id: string, userId: string): Promise<unknown> =>
  request(`/groups/${id}/members/${userId}`, { method: "DELETE", headers: authHeaders(accessToken) });
export const apiTransferGroup = (accessToken: string, id: string, userId: string): Promise<unknown> =>
  request(`/groups/${id}/transfer`, { method: "POST", headers: authHeaders(accessToken), body: JSON.stringify({ userId }) });
export const apiArchiveGroup = (accessToken: string, id: string, archived: boolean): Promise<unknown> =>
  request(`/groups/${id}/${archived ? "archive" : "unarchive"}`, { method: "POST", headers: authHeaders(accessToken) });
export const apiDeleteGroup = (accessToken: string, id: string): Promise<unknown> =>
  request(`/groups/${id}`, { method: "DELETE", headers: authHeaders(accessToken) });

// ------------------------------------------------- plano de recuperação (item 42)
type RecoveryPlanDto = import("@/lib/recovery-plans").RecoveryPlan;
export const apiCreateRecoveryPlan = (token: string, payload: { studentId?: string; topicId?: string; subjectId?: string; classId?: string; alertId?: string }): Promise<RecoveryPlanDto> =>
  request('/recovery-plans', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
export const apiMyRecoveryPlans = (token: string): Promise<RecoveryPlanDto[]> => request('/recovery-plans/mine', { headers: authHeaders(token) });
export const apiTeacherRecoveryPlans = (token: string, studentId?: string): Promise<RecoveryPlanDto[]> =>
  request(`/recovery-plans/teacher${studentId ? `?studentId=${studentId}` : ''}`, { headers: authHeaders(token) });
export const apiGetRecoveryPlan = (token: string, id: string): Promise<RecoveryPlanDto> => request(`/recovery-plans/${id}`, { headers: authHeaders(token) });
export const apiRecoveryPlanVideo = (token: string, id: string): Promise<RecoveryPlanDto> =>
  request(`/recovery-plans/${id}/video`, { method: 'POST', headers: authHeaders(token) });
export const apiCancelRecoveryPlan = (token: string, id: string): Promise<RecoveryPlanDto> =>
  request(`/recovery-plans/${id}/cancel`, { method: 'POST', headers: authHeaders(token) });

// ------------------------------------------------- central de materiais (itens 48 a 50)
type MaterialDto = import("@/lib/materials").Material;
export const apiListMaterials = (token: string, filters: { classId?: string; subjectId?: string; kind?: string } = {}): Promise<MaterialDto[]> => {
  const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => !!v) as [string, string][]);
  return request(`/materials${q.toString() ? `?${q}` : ''}`, { headers: authHeaders(token) });
};
export const apiCreateMaterial = (token: string, payload: { title: string; description?: string; kind: string; url?: string; file?: string; classId?: string; subjectId?: string }): Promise<MaterialDto> =>
  request('/materials', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
export const apiDeleteMaterial = (token: string, id: string): Promise<void> => request(`/materials/${id}`, { method: 'DELETE', headers: authHeaders(token) });
export const apiSearchMaterials = (token: string, q: string, classId?: string): Promise<import("@/lib/materials").MaterialSearchResult> =>
  request(`/materials/search?${new URLSearchParams({ q, ...(classId ? { classId } : {}) })}`, { headers: authHeaders(token) });
export const apiAskMaterials = (token: string, payload: { question: string; classId?: string; materialId?: string; page?: number }): Promise<import("@/lib/materials").MaterialAnswer> =>
  request('/materials/ask', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
export const apiMaterialQuestions = (token: string, id: string, payload: { count?: number; pages?: number[] }): Promise<{ questions: import("@/lib/materials").DraftQuestion[]; subjectId: string | null; topicId: string | null }> =>
  request(`/materials/${id}/questions`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
/** Baixa o PDF do material pelo backend (exige o token) e devolve um blob URL. */
export async function apiMaterialFileUrl(token: string, id: string): Promise<string> {
  const response = await fetch(`${API_URL}/materials/${id}/file`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new ApiError(response.status, 'Não foi possível abrir o arquivo do material.');
  return URL.createObjectURL(await response.blob());
}

/** Limites de data do cronograma: início a partir de hoje e prazo máximo pela gama de conteúdos. */
export const apiScheduleLimits = (
  token: string,
  payload: { startDate?: string; studyDays: number[]; dailyMinutes: number; dayMinutes?: { weekday: number; minutes: number }[]; subjects: { subjectId: string; targetHours: number }[] },
): Promise<import("@/lib/schedule-dates").ScheduleLimits> =>
  request("/study/schedule/limits", { method: "POST", headers: authHeaders(token), body: JSON.stringify(payload) });

/** Calendário do cronograma: o que estudar em cada dia (dias futuros ainda não planejados vêm como previsão). */
export const apiScheduleCalendar = (token: string, from: string, to: string): Promise<import("@/lib/calendar").ScheduleCalendar> =>
  request(`/study/calendar?from=${from}&to=${to}`, { headers: authHeaders(token) });

// ------------------------------------------------- relatórios (item 59)
type Period = { days?: number; month?: boolean };
const periodQuery = (p: Period) => (p.month ? 'month=true' : `days=${p.days ?? 30}`);
export const apiReportScope = (token: string): Promise<import("@/lib/reports").ReportScope> => request('/reports/scope', { headers: authHeaders(token) });
export const apiClassReport = (token: string, classId: string, p: Period): Promise<import("@/lib/reports").ClassReport> =>
  request(`/reports/class/${classId}?${periodQuery(p)}`, { headers: authHeaders(token) });
export const apiSubjectReport = (token: string, subject: string, p: Period, classId?: string): Promise<import("@/lib/reports").SubjectReport> =>
  request(`/reports/subject?${new URLSearchParams({ subject, ...(classId ? { classId } : {}) })}&${periodQuery(p)}`, { headers: authHeaders(token) });
export const apiInstitutionReport = (token: string, p: Period): Promise<import("@/lib/reports").InstitutionReport> =>
  request(`/reports/institution?${periodQuery(p)}`, { headers: authHeaders(token) });
export const apiStudentReport = (token: string, studentId: string, p: Period): Promise<import("@/lib/reports").StudentReport> =>
  request(`/reports/student/${studentId}?${periodQuery(p)}`, { headers: authHeaders(token) });
export const apiReportSnapshots = (token: string): Promise<import("@/lib/reports").SnapshotSummary[]> => request('/reports/snapshots', { headers: authHeaders(token) });
export const apiSaveReport = (token: string, payload: { type: import("@/lib/reports").ReportType; scopeId: string; subject?: string } & Period) =>
  request('/reports/snapshots', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
export const apiReportSnapshot = (token: string, id: string): Promise<import("@/lib/reports").SnapshotSummary & { data: import("@/lib/reports").AnyReport }> =>
  request(`/reports/snapshots/${id}`, { headers: authHeaders(token) });
