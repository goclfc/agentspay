import { Router, Request, Response, NextFunction } from 'express';
import { createAgentSchema, selfRegisterAgentSchema, agentLookupSchema } from '@agentspay/shared';
import * as agentService from '../services/agent.service';
import { authenticate, requireUser, requireUserOrAgent } from '../middleware/auth.middleware';

export const agentRouter = Router();

agentRouter.post('/', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createAgentSchema.parse(req.body);
    const result = await agentService.createAgent(req.user!.id, data.name, data.description, data.metadata);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

agentRouter.post('/self-register', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = selfRegisterAgentSchema.parse(req.body);
    const result = await agentService.selfRegister(req.user!.id, data.name, data.description, data.capabilities);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

agentRouter.get('/', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await agentService.listAgents(req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});

agentRouter.get('/lookup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = agentLookupSchema.parse(req.query);
    const result = await agentService.lookupByAccount(data.account);
    res.json(result);
  } catch (err) { next(err); }
});

agentRouter.get('/:id', authenticate, requireUserOrAgent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requesterId = req.user?.id || req.agent?.id || '';
    const requesterType = req.authType as 'user' | 'agent';
    const result = await agentService.getAgent(req.params.id, requesterId, requesterType);
    res.json(result);
  } catch (err) { next(err); }
});

agentRouter.delete('/:id', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await agentService.revokeAgent(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});

agentRouter.post('/:id/rotate-key', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await agentService.rotateKey(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});
