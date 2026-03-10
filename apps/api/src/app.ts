import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import { authRouter } from './routes/auth.routes';
import { fundingRouter } from './routes/funding.routes';
import { agentRouter } from './routes/agent.routes';
import { walletRouter } from './routes/wallet.routes';
import { transactionRouter } from './routes/transaction.routes';
import { merchantRouter } from './routes/merchant.routes';
import { webhookRouter } from './routes/webhook.routes';
import { cardRouter } from './routes/card.routes';
import { stripeWebhookRouter } from './routes/stripe-webhook.routes';
import { errorHandler } from './middleware/error.middleware';
import { rateLimiter } from './middleware/rateLimit.middleware';
import { auditLogger } from './middleware/audit.middleware';

const app = express();

// Stripe webhook needs raw body — mount BEFORE json parser
app.use('/v1/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookRouter);

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(rateLimiter);
app.use(auditLogger);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'agentspay-api', timestamp: new Date().toISOString() }));

app.use('/v1/auth', authRouter);
app.use('/v1/funding', fundingRouter);
app.use('/v1/agents', agentRouter);
app.use('/v1/wallets', walletRouter);
app.use('/v1/wallets', cardRouter);
app.use('/v1/transactions', transactionRouter);
app.use('/v1/merchants', merchantRouter);
app.use('/v1/webhooks', webhookRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(errorHandler);

export { app };
