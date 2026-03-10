import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export function auditLogger(req: Request, _res: Response, next: NextFunction) {
  // Fire and forget — don't block the request
  const actor = req.user?.id || req.agent?.id || req.merchant?.id || 'anonymous';
  const actorType = req.authType || 'anonymous';

  // Only audit mutating requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    prisma.auditLog.create({
      data: {
        actor,
        actorType,
        action: `${req.method} ${req.path}`,
        resourceId: req.params.id || '',
        details: { body: req.body, query: req.query },
        ip: req.ip || null,
      },
    }).catch(() => {
      // Silently fail — audit logging should never break the app
    });
  }

  next();
}
