export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

interface ApiClientDependencies {
  baseUrl: string;
  getRefreshToken: () => string | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearTokens: () => void;
  fetch: typeof globalThis.fetch;
}

type SessionExpiredListener = () => void;

const AUTH_ENDPOINTS_WITHOUT_RETRY = new Set(["/auth/login", "/auth/register", "/auth/refresh"]);

export function createApiClient(dependencies: ApiClientDependencies) {
  const listeners = new Set<SessionExpiredListener>();
  let refreshInFlight: Promise<string | null> | null = null;

  function onSessionExpired(listener: SessionExpiredListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notifySessionExpired(): void {
    listeners.forEach((listener) => listener());
  }

  async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = dependencies.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await dependencies.fetch(`${dependencies.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (!text) return null;
      const data = JSON.parse(text) as TokenResponse;
      dependencies.setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    }
  }

  async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    const response = await dependencies.fetch(`${dependencies.baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });

    const authHeader = (options.headers as Record<string, string> | undefined)?.Authorization;
    if (response.status === 401 && !isRetry && authHeader && !AUTH_ENDPOINTS_WITHOUT_RETRY.has(path)) {
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
      const newAccessToken = await refreshInFlight;

      if (newAccessToken) {
        return request<T>(path, {
          ...options,
          headers: { ...options.headers, Authorization: `Bearer ${newAccessToken}` },
        }, true);
      }

      dependencies.clearTokens();
      notifySessionExpired();
      throw new ApiError(401, "Sua sessão expirou. Faça login novamente.");
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = Array.isArray(body?.message)
        ? body.message.join(" ")
        : (body?.message ?? "Não foi possível completar a operação.");
      throw new ApiError(response.status, message);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  }

  return { onSessionExpired, request };
}
