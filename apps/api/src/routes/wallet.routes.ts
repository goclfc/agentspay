import { Router, Request, Response, NextFunction } from 'express';
import { createWalletSchema, fundWalletSchema } from '@agentspay/shared';
import * as walletService from '../services/wallet.service';
import { authenticate, requireUser, requireUserOrAgent } from '../middleware/auth.middleware';

export const walletRouter = Router();

walletRouter.post('/', authenticate, requireUserOrAgent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createWalletSchema.parse(req.body);
    const authType = req.authType as 'user' | 'agent';
    const result = await walletService.createWallet(
      data.agent_id,
      data.name,
      {
        fundingAmount: data.funding_amount,
        requestedAmount: data.requested_amount,
        limitPerTx: data.limit_per_tx,
        dailyLimit: data.daily_limit,
        monthlyLimit: data.monthly_limit,
        allowedMerchants: data.allowed_merchants,
        expiresAt: data.expires_at,
      },
      authType,
      req.user?.id
    );
    res.status(201).json(result);
  } catch (err) { next(err); }
});

walletRouter.get('/', authenticate, requireUserOrAgent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await walletService.listWallets({
      agentId: req.query.agent_id as string | undefined,
      userId: req.user?.id,
    });
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.get('/:id', authenticate, requireUserOrAgent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await walletService.getBalance(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.post('/:id/fund', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = fundWalletSchema.parse(req.body);
    const result = await walletService.fundWallet(req.params.id, req.user!.id, data.amount);
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.post('/:id/freeze', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await walletService.freezeWallet(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.post('/:id/unfreeze', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await walletService.unfreezeWallet(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.post('/:id/approve', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const amount = req.body.amount ? Number(req.body.amount) : undefined;
    const result = await walletService.approveWallet(req.params.id, req.user!.id, amount);
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.post('/:id/reject', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await walletService.rejectWallet(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.delete('/:id', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await walletService.closeWallet(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});
