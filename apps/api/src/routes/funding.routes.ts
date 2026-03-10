import { Router, Request, Response, NextFunction } from 'express';
import { depositSchema, withdrawSchema, addPaymentMethodSchema } from '@agentspay/shared';
import * as fundingService from '../services/funding.service';
import { authenticate, requireUser } from '../middleware/auth.middleware';

export const fundingRouter = Router();

fundingRouter.post('/deposit', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = depositSchema.parse(req.body);
    const result = await fundingService.deposit(req.user!.id, data.amount, data.payment_method_id);
    res.json(result);
  } catch (err) { next(err); }
});

fundingRouter.post('/withdraw', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = withdrawSchema.parse(req.body);
    const result = await fundingService.withdraw(req.user!.id, data.amount);
    res.json(result);
  } catch (err) { next(err); }
});

fundingRouter.get('/balance', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await fundingService.getBalance(req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});
