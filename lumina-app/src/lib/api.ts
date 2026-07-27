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

export function googleAuthUrl(): string {
  return `${API_URL}/auth/google`;
}
