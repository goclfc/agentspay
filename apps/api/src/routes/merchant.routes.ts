import { Router, Request, Response, NextFunction } from 'express';
import { registerMerchantSchema, merchantWithdrawSchema } from '@usectl/shared';
import * as merchantService from '../services/merchant.service';
import { authenticate, requireMerchant } from '../middleware/auth.middleware';

export const merchantRouter = Router();

merchantRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerMerchantSchema.parse(req.body);
    const result = await merchantService.register(data.name, data.email, data.password, data.category);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

merchantRouter.get('/me', authenticate, requireMerchant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await merchantService.getProfile(req.merchant!.id);
    res.json(result);
  } catch (err) { next(err); }
});

merchantRouter.get('/balance', authenticate, requireMerchant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await merchantService.getBalance(req.merchant!.id);
    res.json(result);
  } catch (err) { next(err); }
});

merchantRouter.post('/withdraw', authenticate, requireMerchant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = merchantWithdrawSchema.parse(req.body);
    const result = await merchantService.withdraw(req.merchant!.id, data.amount);
    res.json(result);
  } catch (err) { next(err); }
});

merchantRouter.get('/transactions', authenticate, requireMerchant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await merchantService.listTransactions(req.merchant!.id, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      limit: parseInt(req.query.limit as string) || 50,
      cursor: req.query.cursor as string | undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

merchantRouter.get('/onboarding-link', authenticate, requireMerchant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await merchantService.getOnboardingLink(req.merchant!.id);
    res.json(result);
  } catch (err) { next(err); }
});
