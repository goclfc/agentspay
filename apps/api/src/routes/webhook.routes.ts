import { Router, Request, Response, NextFunction } from 'express';
import { createWebhookSchema } from '@usectl/shared';
import * as webhookService from '../services/webhook.service';
import { authenticate, requireUser } from '../middleware/auth.middleware';

export const webhookRouter = Router();

webhookRouter.post('/', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createWebhookSchema.parse(req.body);
    const result = await webhookService.registerEndpoint(req.user!.id, data.url, data.events);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

webhookRouter.get('/', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await webhookService.listEndpoints(req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});

webhookRouter.delete('/:id', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await webhookService.deleteEndpoint(req.user!.id, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});
