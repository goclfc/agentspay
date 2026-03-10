import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { hashApiKey } from '../utils/apiKey';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; tier: string };
      agent?: { id: string; userId: string; accountNumber: string };
      merchant?: { id: string; name: string };
      authType?: 'user' | 'agent' | 'merchant';
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    // 1. Bearer JWT
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; tier: string };
      req.user = { id: payload.userId, email: payload.email, tier: payload.tier };
      req.authType = 'user';
      return next();
    }

    // 2. X-Master-Key
    const masterKey = req.headers['x-master-key'] as string | undefined;
    if (masterKey) {
      const keyHash = hashApiKey(masterKey);
      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: { user: true },
      });
      if (!apiKey || apiKey.revoked) throw new UnauthorizedError('Invalid or revoked API key');
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) throw new UnauthorizedError('API key expired');
      await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
      req.user = { id: apiKey.user.id, email: apiKey.user.email, tier: apiKey.user.tier };
      req.authType = 'user';
      return next();
    }

    // 3. X-Agent-Key
    const agentKey = req.headers['x-agent-key'] as string | undefined;
    if (agentKey) {
      const keyHash = hashApiKey(agentKey);
      const agent = await prisma.agent.findUnique({ where: { apiKeyHash: keyHash } });
      if (!agent || agent.status !== 'ACTIVE') throw new UnauthorizedError('Invalid or inactive agent key');
      await prisma.agent.update({ where: { id: agent.id }, data: { lastActiveAt: new Date() } });
      req.agent = { id: agent.id, userId: agent.userId, accountNumber: agent.accountNumber };
      req.authType = 'agent';
      return next();
    }

    // 4. X-Merchant-Key
    const merchantKey = req.headers['x-merchant-key'] as string | undefined;
    if (merchantKey) {
      const keyHash = hashApiKey(merchantKey);
      const merchant = await prisma.merchant.findUnique({ where: { apiKeyHash: keyHash } });
      if (!merchant || merchant.status === 'SUSPENDED') throw new UnauthorizedError('Invalid or suspended merchant key');
      req.merchant = { id: merchant.id, name: merchant.name };
      req.authType = 'merchant';
      return next();
    }

    throw new UnauthorizedError();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    if (err instanceof jwt.JsonWebTokenError) return next(new UnauthorizedError('Invalid token'));
    if (err instanceof jwt.TokenExpiredError) return next(new UnauthorizedError('Token expired'));
    next(err);
  }
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (req.authType !== 'user' || !req.user) return next(new ForbiddenError('User authentication required'));
  next();
}

export function requireAgent(req: Request, _res: Response, next: NextFunction) {
  if (req.authType !== 'agent' || !req.agent) return next(new ForbiddenError('Agent authentication required'));
  next();
}

export function requireMerchant(req: Request, _res: Response, next: NextFunction) {
  if (req.authType !== 'merchant' || !req.merchant) return next(new ForbiddenError('Merchant authentication required'));
  next();
}

export function requireUserOrAgent(req: Request, _res: Response, next: NextFunction) {
  if ((req.authType === 'user' && req.user) || (req.authType === 'agent' && req.agent)) return next();
  next(new ForbiddenError('User or agent authentication required'));
}
