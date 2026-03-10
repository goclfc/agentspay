import { Router, Request, Response, NextFunction } from 'express';
import { paySchema, transferSchema, listTransactionsSchema } from '@agentspay/shared';
import * as txService from '../services/transaction.service';
import { authenticate, requireAgent, requireUserOrAgent } from '../middleware/auth.middleware';

export const transactionRouter = Router();

transactionRouter.post('/pay', authenticate, requireAgent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = paySchema.parse(req.body);
    const result = await txService.pay(
      req.agent!.id,
      data.wallet_id,
      data.merchant_id,
      data.amount,
      data.description,
      data.metadata,
      data.idempotency_key
    );
    res.json(result);
  } catch (err) { next(err); }
});

transactionRouter.post('/transfer', authenticate, requireAgent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = transferSchema.parse(req.body);
    const result = await txService.transfer(
      req.agent!.id,
      data.from_wallet_id,
      data.to_agent_account,
      data.amount,
      data.reason,
      data.metadata,
      data.idempotency_key
    );
    res.json(result);
  } catch (err) { next(err); }
});

transactionRouter.get('/', authenticate, requireUserOrAgent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = listTransactionsSchema.parse(req.query);
    const result = await txService.listTransactions({
      userId: req.user?.id,
      agentId: req.agent?.id,
      walletId: data.wallet_id,
      type: data.type,
      from: data.from,
      to: data.to,
      limit: data.limit,
      cursor: data.cursor,
    });
    res.json(result);
  } catch (err) { next(err); }
});

transactionRouter.get('/:id', authenticate, requireUserOrAgent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requesterId = req.user?.id || req.agent?.id || '';
    const requesterType = req.authType as 'user' | 'agent';
    const result = await txService.getTransaction(req.params.id, requesterId, requesterType);
    res.json(result);
  } catch (err) { next(err); }
});
