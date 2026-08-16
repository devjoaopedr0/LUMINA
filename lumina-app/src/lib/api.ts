import { API_URL } from "@/lib/config";

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(" ")
      : (body?.message ?? "Não foi possível completar a operação.");
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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
