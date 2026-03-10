import { Request, Response, NextFunction } from 'express';
import { RATE_LIMITS } from '@agentspay/shared';
import { hashApiKey } from '../utils/apiKey';
import { AppError } from '../utils/errors';

// In-memory sliding window rate limiter (Redis version can replace this later)
const windows = new Map<string, { count: number; resetAt: number }>();

function getRateLimitKey(req: Request): { key: string; limit: { window: number; max: number } } {
  const masterKey = req.headers['x-master-key'] as string | undefined;
  if (masterKey) return { key: `rl:master:${hashApiKey(masterKey).slice(0, 16)}`, limit: RATE_LIMITS.MASTER };

  const agentKey = req.headers['x-agent-key'] as string | undefined;
  if (agentKey) return { key: `rl:agent:${hashApiKey(agentKey).slice(0, 16)}`, limit: RATE_LIMITS.AGENT };

  const merchantKey = req.headers['x-merchant-key'] as string | undefined;
  if (merchantKey) return { key: `rl:merchant:${hashApiKey(merchantKey).slice(0, 16)}`, limit: RATE_LIMITS.MERCHANT };

  // Fallback to IP-based limiting
  return { key: `rl:ip:${req.ip}`, limit: RATE_LIMITS.AUTH };
}

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Skip rate limiting for health checks
  if (req.path === '/health') return next();

  const { key, limit } = getRateLimitKey(req);
  const now = Date.now();
  const windowMs = limit.window * 1000;

  let entry = windows.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    windows.set(key, entry);
  }

  entry.count++;

  res.setHeader('X-RateLimit-Limit', limit.max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit.max - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > limit.max) {
    return next(new AppError(429, 'Rate limit exceeded', 'RATE_LIMIT'));
  }

  next();
}
