import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitMiddleware } from './rate-limit.middleware';

describe('RateLimitMiddleware', () => {
  it('permite até o limite e depois responde com 429', () => {
    const config = { get: (key: string) => (key === 'RATE_LIMIT_MAX' ? 2 : 60_000) } as never;
    const middleware = new RateLimitMiddleware(config);
    const request = { ip: '127.0.0.1', socket: {} } as Request;
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;
    const next = vi.fn();

    middleware.use(request, response, next);
    middleware.use(request, response, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(() => middleware.use(request, response, next)).toThrowError(HttpException);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 60);
  });
});
