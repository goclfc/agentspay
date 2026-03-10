import { Router, Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema, refreshTokenSchema, createApiKeySchema } from '@usectl/shared';
import * as authService from '../services/auth.service';
import { authenticate, requireUser } from '../middleware/auth.middleware';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data.email, data.password);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data.email, data.password);
    res.json(result);
  } catch (err) { next(err); }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = refreshTokenSchema.parse(req.body);
    const result = await authService.refreshToken(data.refresh_token);
    res.json(result);
  } catch (err) { next(err); }
});

authRouter.get('/me', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.getProfile(req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});

authRouter.post('/api-keys', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createApiKeySchema.parse(req.body);
    const result = await authService.createApiKey(req.user!.id, data.label);
    res.json(result);
  } catch (err) { next(err); }
});

authRouter.delete('/api-keys/:keyId', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.revokeApiKey(req.user!.id, req.params.keyId);
    res.json(result);
  } catch (err) { next(err); }
});
