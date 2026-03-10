import { Router, Request, Response, NextFunction } from 'express';
import { constructWebhookEvent } from '../services/stripe.service';
import * as fundingService from '../services/funding.service';
import * as issuingService from '../services/issuing.service';

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      return res.status(400).json({ error: 'Missing Stripe signature' });
    }

    const event = constructWebhookEvent(req.body, signature);

    switch (event.type) {
      case 'checkout.session.completed':
        await fundingService.handleStripeWebhook(event.type, event.data.object);
        break;
      case 'payment_intent.succeeded':
        await fundingService.handleStripeWebhook(event.type, event.data.object);
        break;
      case 'issuing_authorization.request':
        await issuingService.handleIssuingAuthorization(event.data.object);
        break;
      case 'issuing_authorization.updated':
        await issuingService.handleIssuingAuthorizationUpdate(event.data.object);
        break;
      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});
