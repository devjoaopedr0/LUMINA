import assert from 'node:assert/strict';
import { ApiError, createApiClient } from '../src/lib/api-client-core.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function checks() {
  let refreshToken: string | null = 'refresh-old';
  let clearCount = 0;
  let refreshCalls = 0;
  const stored: string[][] = [];

  const concurrentClient = createApiClient({
    baseUrl: 'http://api.test',
    getRefreshToken: () => refreshToken,
    setTokens: (access, refresh) => {
      stored.push([access, refresh]);
      refreshToken = refresh;
    },
    clearTokens: () => { clearCount++; },
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await Promise.resolve();
        return jsonResponse({ accessToken: 'access-new', refreshToken: 'refresh-new' });
      }
      const authorization = new Headers(init?.headers).get('Authorization');
      return authorization === 'Bearer access-new' ? jsonResponse([{ id: 1 }]) : jsonResponse({}, 401);
    },
  });

  const calls = Array.from({ length: 6 }, () => concurrentClient.request<unknown[]>('/subjects', {
    headers: { Authorization: 'Bearer access-old' },
  }));
  const results = await Promise.all(calls);
  assert.equal(refreshCalls, 1, 'requisições concorrentes devem compartilhar um único refresh');
  assert.deepEqual(results, Array.from({ length: 6 }, () => [{ id: 1 }]));
  assert.deepEqual(stored, [['access-new', 'refresh-new']]);
  assert.equal(clearCount, 0);

  let expirationEvents = 0;
  const expiredClient = createApiClient({
    baseUrl: 'http://api.test',
    getRefreshToken: () => 'expired',
    setTokens: () => assert.fail('tokens expirados não podem ser salvos'),
    clearTokens: () => { clearCount++; },
    fetch: async () => jsonResponse({ message: 'não autorizado' }, 401),
  });
  expiredClient.onSessionExpired(() => { expirationEvents++; });
  await assert.rejects(
    expiredClient.request('/study/progress', { headers: { Authorization: 'Bearer expired' } }),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(expirationEvents, 1);
  assert.equal(clearCount, 1);

  const offlineClient = createApiClient({
    baseUrl: 'http://api.test',
    getRefreshToken: () => null,
    setTokens: () => undefined,
    clearTokens: () => undefined,
    fetch: async () => { throw new TypeError('Failed to fetch'); },
  });
  await assert.rejects(offlineClient.request('/subjects'), /Failed to fetch/);

  const emptyClient = createApiClient({
    baseUrl: 'http://api.test',
    getRefreshToken: () => null,
    setTokens: () => undefined,
    clearTokens: () => undefined,
    fetch: async () => new Response(null, { status: 200 }),
  });
  assert.equal(await emptyClient.request('/study/schedule'), null);
}

await checks();
console.log('API session checks passed: concurrency, expiration, offline failure, empty response.');
