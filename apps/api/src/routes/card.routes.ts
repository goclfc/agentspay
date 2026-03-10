import { Router, Request, Response, NextFunction } from 'express';
import * as issuingService from '../services/issuing.service';
import { authenticate, requireUser, requireAgent } from '../middleware/auth.middleware';

export const cardRouter = Router();

// POST /v1/wallets/:id/card — Create a virtual card for a wallet (user auth)
cardRouter.post('/:id/card', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await issuingService.createCardForWallet(req.params.id, req.user!.id);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// GET /v1/wallets/:id/card — Get masked card info (user auth)
cardRouter.get('/:id/card', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await issuingService.getCardInfo(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /v1/wallets/:id/card/details — Get full card number+CVC (agent auth)
cardRouter.get('/:id/card/details', authenticate, requireAgent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await issuingService.getCardDetails(req.params.id, req.agent!.id);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /v1/wallets/:id/card/freeze — Freeze card (user auth)
cardRouter.post('/:id/card/freeze', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await issuingService.freezeCard(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /v1/wallets/:id/card/unfreeze — Unfreeze card (user auth)
cardRouter.post('/:id/card/unfreeze', authenticate, requireUser, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await issuingService.unfreezeCard(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) { next(err); }
});
