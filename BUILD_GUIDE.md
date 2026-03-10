# AgentsPay — Build Guide for Claude Code

> **Instructions**: This document is a step-by-step build guide. Complete each step in order. Each step tells you exactly what files to create, what code to write, and what tests to pass before moving on. Reference `AGENTSPAY_PROJECT_SPEC.md` in the same directory for detailed schemas, API shapes, and design decisions.

---

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or use usectl's managed database)
- Redis (or use Upstash for serverless)
- A Stripe account with API keys
- A GitHub repository for deployment

## Deployment Target: usectl

This project deploys on **usectl** (managed Kubernetes platform). Key constraints:
- App must listen on **port 80** (or configure usectl port setting)
- usectl auto-detects Node.js projects
- PostgreSQL is provided by usectl — credentials injected as `DATABASE_URL`
- We need a `Dockerfile` since this is a monorepo (not vanilla Node.js)
- Environment variables set via `usectl env set`

---

## Step 0: Monorepo Scaffold

### What to do
Create the Turborepo monorepo with all packages. No business logic yet — just the skeleton that builds and runs.

### Files to create

```
agentspay/
├── package.json
├── turbo.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── Dockerfile                    # For usectl deployment
├── docker-compose.yml            # Local dev (Postgres + Redis)
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts          # "Hello from AgentsPay API" on port 80
│   ├── cli/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts          # "agentspay --help" outputs usage
│   └── mcp/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts          # Placeholder
├── packages/
│   ├── sdk/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts          # Export placeholder class
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts          # Export placeholder types
│   └── tsconfig/
│       ├── base.json
│       ├── node.json
│       └── package.json
```

### Root package.json
```json
{
  "name": "agentspay",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "db:generate": "cd apps/api && npx prisma generate",
    "db:migrate": "cd apps/api && npx prisma migrate deploy",
    "db:push": "cd apps/api && npx prisma db push"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

### turbo.json
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
```

### apps/api/package.json
```json
{
  "name": "@agentspay/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && tsc-alias",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.18.0",
    "zod": "^3.22.0",
    "@prisma/client": "^5.10.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "ioredis": "^5.3.0",
    "stripe": "^14.0.0",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "morgan": "^1.10.0",
    "uuid": "^9.0.0",
    "@agentspay/shared": "workspace:*"
  },
  "devDependencies": {
    "prisma": "^5.10.0",
    "tsx": "^4.7.0",
    "tsc-alias": "^1.8.0",
    "vitest": "^1.3.0",
    "@types/express": "^4.17.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/bcryptjs": "^2.4.0",
    "@types/cors": "^2.8.0",
    "@types/morgan": "^1.9.0",
    "@types/uuid": "^9.0.0",
    "supertest": "^6.3.0",
    "@types/supertest": "^6.0.0"
  }
}
```

### apps/api/src/index.ts (initial)
```typescript
import express from 'express';

const app = express();
const PORT = parseInt(process.env.PORT || '80');

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'agentspay-api', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AgentsPay API running on port ${PORT}`);
});
```

### Dockerfile (root — for usectl)
```dockerfile
FROM node:20-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npx turbo build --filter=@agentspay/api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/node_modules/.prisma ./.prisma
EXPOSE 80
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/index.js"]
```

### docker-compose.yml (local dev)
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: agentspay
      POSTGRES_PASSWORD: agentspay
      POSTGRES_DB: agentspay
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

### .env.example
```bash
DATABASE_URL=postgresql://agentspay:agentspay@localhost:5432/agentspay
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
JWT_SECRET=change-me-in-production
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
PORT=80
NODE_ENV=development
RESEND_API_KEY=re_xxx
FROM_EMAIL=noreply@agentspay.com
API_URL=http://localhost:80
```

### Verification
```bash
npm install
npm run build          # should build all packages without errors
cd apps/api && npm run dev   # should start on port 80, GET /health returns JSON
```

---

## Step 1: Database Schema + Prisma

### What to do
Create the full Prisma schema from the spec. Generate the client. Run migrations.

### Files to create
```
apps/api/prisma/
  schema.prisma          # Copy FULL schema from AGENTSPAY_PROJECT_SPEC.md Section 4
```

Copy the complete Prisma schema from the spec document (Section 4: Data Models). It includes all models: User, ApiKey, Agent, Wallet, Merchant, Transaction, FundingTransaction, SpendLog, WebhookEndpoint, AuditLog, and all enums.

### Commands to run
```bash
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
```

### Verification
```bash
npx prisma studio    # should open and show all tables
```

---

## Step 2: Shared Package — Types & Constants

### What to do
Create shared TypeScript types that all packages use. These mirror the API request/response shapes from the spec.

### File: packages/shared/src/index.ts

Export all types, constants, and Zod schemas used across api, cli, sdk, and mcp.

### What to include

**Constants:**
```typescript
export const API_KEY_PREFIX = {
  MASTER: 'ap_master_',
  AGENT: 'ap_agent_',
  MERCHANT: 'ap_merch_',
} as const;

export const ACCOUNT_NUMBER_PREFIX = 'AGT-';

export const RATE_LIMITS = {
  MASTER: { window: 60, max: 120 },
  AGENT: { window: 60, max: 60 },
  MERCHANT: { window: 60, max: 60 },
  PAY: { window: 60, max: 30 },
  TRANSFER: { window: 60, max: 20 },
  AUTH: { window: 60, max: 10 },
} as const;

export const PLATFORM_FEE_PERCENT = 1.5; // 1.5% on transactions
```

**Types** (mirror every API request/response from spec Section 5):
- `RegisterRequest`, `RegisterResponse`
- `LoginRequest`, `LoginResponse`
- `CreateAgentRequest`, `CreateAgentResponse`
- `CreateWalletRequest`, `CreateWalletResponse`
- `PayRequest`, `PayResponse`
- `TransferRequest`, `TransferResponse`
- `FundingDepositRequest`, `FundingDepositResponse`
- `WebhookEvent`, `WebhookEventType`
- etc.

**Zod schemas** for validation (used by both API server and SDK):
- `registerSchema`, `loginSchema`
- `createAgentSchema`, `createWalletSchema`
- `paySchema`, `transferSchema`
- etc.

### Verification
```bash
cd packages/shared && npm run build   # compiles without errors
```

---

## Step 3: API Key Utilities

### What to do
Create utility functions for generating, hashing, and verifying API keys and account numbers.

### File: apps/api/src/utils/apiKey.ts

```typescript
import crypto from 'crypto';
import { API_KEY_PREFIX, ACCOUNT_NUMBER_PREFIX } from '@agentspay/shared';

// Generate a random API key with prefix
export function generateApiKey(type: 'MASTER' | 'AGENT' | 'MERCHANT'): { key: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(24).toString('base64url');
  const prefix = API_KEY_PREFIX[type];
  const key = `${prefix}${random}`;
  const hash = hashApiKey(key);
  return { key, hash, prefix: key.substring(0, prefix.length + 4) };
}

// SHA-256 hash of a key (for storage)
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Generate AGT-XXXXXXXX account number
export function generateAccountNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = ACCOUNT_NUMBER_PREFIX;
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(crypto.randomInt(chars.length));
  }
  return result;
}
```

### File: apps/api/src/utils/errors.ts

Create custom error classes:
```typescript
export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code: string) {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(401, message, 'UNAUTHORIZED'); }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, message, 'FORBIDDEN'); }
}

export class NotFoundError extends AppError {
  constructor(resource: string) { super(404, `${resource} not found`, 'NOT_FOUND'); }
}

export class BadRequestError extends AppError {
  constructor(message: string) { super(400, message, 'BAD_REQUEST'); }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(409, message, 'CONFLICT'); }
}

export class InsufficientFundsError extends AppError {
  constructor() { super(400, 'Insufficient wallet balance', 'INSUFFICIENT_FUNDS'); }
}

export class SpendingLimitError extends AppError {
  constructor(limit: string) { super(400, `Spending limit exceeded: ${limit}`, 'SPENDING_LIMIT'); }
}
```

### Tests: apps/api/tests/utils/apiKey.test.ts
- `generateApiKey('MASTER')` returns key starting with `ap_master_`
- `generateApiKey('AGENT')` returns key starting with `ap_agent_`
- `hashApiKey` produces consistent SHA-256 hash
- `generateAccountNumber` returns `AGT-` + 8 alphanumeric chars
- Two calls to `generateAccountNumber` produce different results

### Verification
```bash
cd apps/api && npm test -- utils/apiKey
```

---

## Step 4: Auth Middleware

### What to do
Create middleware that authenticates requests via JWT (Bearer token) or API keys (X-Master-Key, X-Agent-Key, X-Merchant-Key).

### File: apps/api/src/middleware/auth.middleware.ts

This middleware should:
1. Check for `Authorization: Bearer <jwt>` header → verify JWT, attach `req.user`
2. Check for `X-Master-Key` header → hash it, look up in `api_keys` table, attach `req.user`
3. Check for `X-Agent-Key` header → hash it, look up in `agents` table, attach `req.agent`
4. Check for `X-Merchant-Key` header → hash it, look up in `merchants` table, attach `req.merchant`
5. If none found → 401 Unauthorized

Create typed request extension:
```typescript
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; tier: string };
      agent?: { id: string; userId: string; accountNumber: string };
      merchant?: { id: string; name: string };
      authType: 'user' | 'agent' | 'merchant';
    }
  }
}
```

Create helper middleware factories:
```typescript
export function requireUser(req, res, next) { /* reject if not user auth */ }
export function requireAgent(req, res, next) { /* reject if not agent auth */ }
export function requireMerchant(req, res, next) { /* reject if not merchant auth */ }
export function requireUserOrAgent(req, res, next) { /* allow either */ }
```

### File: apps/api/src/middleware/rateLimit.middleware.ts

Redis sliding window rate limiter. Key based on API key hash or IP.
Use the limits from `@agentspay/shared` RATE_LIMITS constant.

### File: apps/api/src/middleware/audit.middleware.ts

Log every request to the AuditLog table:
```typescript
{
  actor: req.user?.id || req.agent?.id || req.merchant?.id || 'anonymous',
  actorType: req.authType || 'anonymous',
  action: `${req.method} ${req.path}`,
  resourceId: req.params.id || '',
  details: { body: req.body, query: req.query },
  ip: req.ip,
}
```

### File: apps/api/src/middleware/error.middleware.ts

Global error handler that catches `AppError` subclasses and returns consistent JSON:
```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Insufficient wallet balance"
  }
}
```

### Verification
Write integration tests with supertest that:
- Request without auth → 401
- Request with valid JWT → 200 (mock)
- Request with valid API key → 200 (mock)
- Request with revoked key → 401

---

## Step 5: Auth Service + Routes

### What to do
Implement user registration, login, JWT issuance, and API key management.

### File: apps/api/src/services/auth.service.ts

Functions:
- `register(email, password)` → create User, generate master API key, return key (ONCE)
- `login(email, password)` → verify password, issue JWT + refresh token
- `refreshToken(refreshToken)` → issue new JWT
- `getProfile(userId)` → return user info + balance
- `createApiKey(userId, label)` → generate new master key, store hash
- `revokeApiKey(userId, keyId)` → set revoked=true

### File: apps/api/src/routes/auth.routes.ts

Endpoints (from spec Section 5.1):
```
POST /v1/auth/register
POST /v1/auth/login
POST /v1/auth/refresh
GET  /v1/auth/me                    [requireUser]
POST /v1/auth/api-keys              [requireUser]
DELETE /v1/auth/api-keys/:keyId     [requireUser]
```

### Tests
- Register with valid email/password → 201, returns master_api_key
- Register with duplicate email → 409
- Login with correct credentials → 200, returns JWT
- Login with wrong password → 401
- GET /me with valid JWT → 200, returns profile
- GET /me without auth → 401
- Create API key → 200, key starts with `ap_master_`
- Revoke API key → key no longer authenticates

### Verification
```bash
cd apps/api && npm test -- auth
```

---

## Step 6: Funding Service (Stripe Deposits)

### What to do
Implement deposit and withdrawal of funds from user's bank/card to platform balance.

### File: apps/api/src/services/stripe.service.ts

Wrapper around the Stripe SDK:
- `createCustomer(email)` → Stripe Customer
- `createCheckoutSession(customerId, amount)` → returns URL for Stripe hosted checkout
- `createPaymentMethod(customerId, token)` → attach payment method
- `createPayout(stripeAccountId, amount)` → payout to merchant bank

### File: apps/api/src/services/funding.service.ts

Functions:
- `deposit(userId, amount, paymentMethodId?)` → if no payment method, create Checkout session and return URL. If payment method exists, charge directly. Create FundingTransaction record.
- `withdraw(userId, amount)` → validate sufficient balance, create FundingTransaction, initiate Stripe payout
- `getBalance(userId)` → return { available, pending }
- `handleStripeWebhook(event)` → on `payment_intent.succeeded` or `checkout.session.completed`, credit user's `platformBalance`

### File: apps/api/src/routes/funding.routes.ts

```
POST /v1/funding/deposit              [requireUser]
POST /v1/funding/withdraw             [requireUser]
GET  /v1/funding/balance              [requireUser]
POST /v1/funding/payment-methods      [requireUser]
GET  /v1/funding/payment-methods      [requireUser]
POST /v1/stripe/webhook               [no auth — verify Stripe signature]
```

### Important: Stripe Webhook Route
The webhook route must:
1. Use `express.raw()` body parser (not JSON)
2. Verify the Stripe signature using `stripe.webhooks.constructEvent()`
3. Handle `payment_intent.succeeded` and `checkout.session.completed`
4. Be idempotent (check if FundingTransaction already completed)

### Tests
- Deposit creates a Stripe Checkout session and returns URL
- Stripe webhook credits user balance
- Withdraw with sufficient balance → success
- Withdraw with insufficient balance → 400 INSUFFICIENT_FUNDS
- Balance returns correct available amount

---

## Step 7: Agent Service + Routes

### What to do
Implement agent creation, self-registration, lookup, and key rotation.

### File: apps/api/src/services/agent.service.ts

Functions:
- `createAgent(userId, name, description?, metadata?)` → create Agent, generate API key + account number, return { agent_id, account_number, api_key }
- `selfRegister(masterKeyHash, name, capabilities?)` → look up user by master key, create agent under that user (if `allowAgentSelfRegister` is true)
- `listAgents(userId)` → list all agents with wallet counts and balances
- `getAgent(agentId, requesterId)` → get agent details (check ownership)
- `revokeAgent(agentId, userId)` → set status to REVOKED
- `rotateKey(agentId, userId)` → generate new key, invalidate old
- `lookupByAccount(accountNumber)` → return public info { name, account_number, accepts_transfers }

### File: apps/api/src/routes/agent.routes.ts

```
POST   /v1/agents                    [requireUser]
POST   /v1/agents/self-register      [requireUser via master key]
GET    /v1/agents                    [requireUser]
GET    /v1/agents/:id                [requireUserOrAgent]
DELETE /v1/agents/:id                [requireUser]
POST   /v1/agents/:id/rotate-key    [requireUser]
GET    /v1/agents/lookup             [any auth]  ?account=AGT-XXXXXXXX
```

### Tests
- Create agent → returns agent_id, account_number (AGT-format), api_key (ap_agent_ prefix)
- API key shown once is valid for authentication
- Self-register with master key → creates agent under that user
- Self-register when `allowAgentSelfRegister=false` → 403
- Lookup by account number → returns name, accepts_transfers
- Lookup nonexistent account → 404
- Revoke agent → agent key no longer authenticates
- Rotate key → old key fails, new key works

---

## Step 8: Wallet Service + Routes

### What to do
Implement wallet creation (user and agent-initiated), funding, spending limit management, freeze/approve flows.

### File: apps/api/src/services/wallet.service.ts

Functions:
- `createWallet(agentId, opts)` → if called by user: create ACTIVE wallet, debit user balance, credit wallet. If called by agent: create PENDING_APPROVAL wallet.
- `approveWallet(walletId, userId)` → change PENDING → ACTIVE, debit user balance, credit wallet
- `rejectWallet(walletId, userId)` → change PENDING → CLOSED
- `fundWallet(walletId, userId, amount)` → debit user platformBalance, credit wallet balance. Both in a DB transaction.
- `getBalance(walletId)` → return balance + daily/monthly remaining
- `freezeWallet(walletId, userId)` → set FROZEN
- `unfreezeWallet(walletId, userId)` → set ACTIVE
- `closeWallet(walletId, userId)` → return remaining balance to user, set CLOSED
- `listWallets(agentId?, userId?)` → list wallets with balances
- `checkSpendingLimits(walletId, amount)` → verify per-tx, daily, monthly limits. Return { allowed: boolean, reason?: string }

**Critical**: `fundWallet` and `closeWallet` must use database transactions with `SELECT ... FOR UPDATE` on the wallet row to prevent race conditions.

### File: apps/api/src/routes/wallet.routes.ts

```
POST   /v1/wallets                   [requireUserOrAgent]
GET    /v1/wallets                   [requireUserOrAgent]
GET    /v1/wallets/:id               [requireUserOrAgent]
POST   /v1/wallets/:id/fund          [requireUser]
POST   /v1/wallets/:id/freeze        [requireUser]
POST   /v1/wallets/:id/unfreeze      [requireUser]
POST   /v1/wallets/:id/approve       [requireUser]
POST   /v1/wallets/:id/reject        [requireUser]
DELETE /v1/wallets/:id               [requireUser]
```

### Tests
- User creates wallet → ACTIVE, balance matches funding_amount, user balance decremented
- Agent creates wallet → PENDING_APPROVAL, balance=0
- Approve pending wallet → ACTIVE, balance matches requested_amount, user balance decremented
- Fund wallet → wallet balance up, user balance down
- Close wallet → wallet CLOSED, remaining balance returned to user
- Freeze → wallet FROZEN, unfreeze → wallet ACTIVE
- Create wallet with amount > user balance → 400 INSUFFICIENT_FUNDS
- Concurrent fund requests don't create double-spend (test with concurrent promises)

---

## Step 9: Transaction Service — Payments

### What to do
Implement the core payment flow: agent pays a merchant.

### File: apps/api/src/services/transaction.service.ts

Function `pay(agentId, walletId, merchantId, amount, description, metadata, idempotencyKey)`:

1. Check idempotency key — if transaction already exists with this key, return existing result
2. Validate wallet belongs to this agent
3. Validate wallet is ACTIVE and not expired
4. Validate merchant exists and is ACTIVE
5. Check allowed_merchants (if set, merchant must be in list)
6. Check spending limits via `wallet.checkSpendingLimits()`
7. Calculate platform fee: `amount * PLATFORM_FEE_PERCENT / 100`
8. **In a single database transaction:**
   - `SELECT wallet FOR UPDATE` (lock the row)
   - Verify balance >= amount (recheck after lock)
   - Debit wallet balance
   - Credit merchant balance (amount - fee)
   - Create Transaction record (status: COMPLETED)
   - Update SpendLog (daily + monthly totals)
9. Fire webhook to user (transaction.completed)
10. Fire webhook to merchant (merchant.payment_received)
11. Return transaction receipt

### File: apps/api/src/services/idempotency.service.ts

- Check if idempotency key exists in `transactions` table
- If exists and COMPLETED → return cached result
- If exists and PENDING → wait briefly and recheck (or return 409)
- If not exists → proceed with transaction

### Routes (add to transaction.routes.ts):

```
POST /v1/transactions/pay            [requireAgent]
GET  /v1/transactions                [requireUserOrAgent]
GET  /v1/transactions/:id            [requireUserOrAgent]
```

### Tests
- Agent pays merchant → wallet debited, merchant credited, fee deducted, transaction COMPLETED
- Pay with insufficient balance → 400 INSUFFICIENT_FUNDS
- Pay exceeding per-tx limit → 400 SPENDING_LIMIT
- Pay exceeding daily limit → 400 SPENDING_LIMIT
- Pay to disallowed merchant (not in allowed_merchants) → 400
- Pay with frozen wallet → 400
- Pay with expired wallet → 400
- Duplicate idempotency key → returns same transaction, no double charge
- Concurrent pay requests on same wallet don't overdraft

---

## Step 10: Transaction Service — Transfers

### What to do
Implement agent-to-agent transfers.

### Add to transaction.service.ts

Function `transfer(agentId, fromWalletId, toAgentAccount, amount, reason, metadata, idempotencyKey)`:

1. Check idempotency
2. Validate sender wallet (active, owns it, has balance, within limits)
3. Look up receiving agent by account number
4. Validate receiving agent is ACTIVE and has `allowTransfersIn=true` on at least one wallet
5. Find receiver's default wallet (first active wallet with `allowTransfersIn=true`)
6. Validate sender wallet has `allowTransfersOut=true`
7. Calculate fee (same as payment)
8. **In a single database transaction:**
   - Lock sender wallet (`FOR UPDATE`)
   - Lock receiver wallet (`FOR UPDATE`) — **always lock in consistent order by wallet ID to prevent deadlocks**
   - Debit sender wallet
   - Credit receiver wallet (amount - fee)
   - Create Transaction record with senderAgentId and receiverAgentId
   - Update SpendLogs for sender
9. Fire webhooks to both users
10. Return transfer receipt

### Route:
```
POST /v1/transactions/transfer       [requireAgent]
```

### Tests
- Transfer between agents → sender debited, receiver credited
- Transfer to nonexistent account → 404
- Transfer to agent that doesn't accept transfers → 400
- Transfer from wallet with transfersOut disabled → 400
- Insufficient balance → 400
- Idempotency works for transfers too

---

## Step 11: Merchant Service

### What to do
Implement merchant registration, Stripe Connect onboarding, balance, and payouts.

### File: apps/api/src/services/merchant.service.ts

Functions:
- `register(name, email, password, category?)` → create Merchant, generate API key, create Stripe Connected Account (Express), return { merchant_id, api_key, onboarding_url }
- `getOnboardingLink(merchantId)` → Stripe Account Link for completing onboarding
- `getProfile(merchantId)` → return merchant info + balance
- `getBalance(merchantId)` → { available, pending }
- `withdraw(merchantId, amount?)` → create Stripe Transfer from platform to connected account, then trigger payout
- `listTransactions(merchantId, filters)` → transactions where merchantId matches
- `handleStripeAccountWebhook(event)` → on `account.updated`, update `onboardingComplete`

### File: apps/api/src/routes/merchant.routes.ts

```
POST /v1/merchants/register                  [no auth]
GET  /v1/merchants/me                        [requireMerchant]
GET  /v1/merchants/balance                   [requireMerchant]
POST /v1/merchants/withdraw                  [requireMerchant]
GET  /v1/merchants/transactions              [requireMerchant]
GET  /v1/merchants/onboarding-link           [requireMerchant]
```

### Tests
- Register merchant → returns API key, onboarding URL
- Merchant balance reflects received payments
- Withdraw triggers Stripe payout
- Incomplete onboarding → withdrawal blocked

---

## Step 12: Webhook Delivery Service

### What to do
Implement outgoing webhooks to user and merchant endpoints.

### File: apps/api/src/services/webhook.service.ts

Functions:
- `registerEndpoint(userId, url, events)` → create WebhookEndpoint with HMAC secret
- `listEndpoints(userId)` → list user's webhook endpoints
- `deleteEndpoint(userId, endpointId)` → remove
- `deliver(userId, event)` → find matching endpoints, POST the event payload, sign with HMAC-SHA256

Delivery logic:
1. Build payload: `{ id, type, created_at, data }`
2. Sign: `X-AgentsPay-Signature: sha256=<hmac(secret, JSON.stringify(payload))>`
3. POST to endpoint URL with 5-second timeout
4. If fails (non-2xx or timeout): retry up to 3 times with exponential backoff (1s, 5s, 25s)
5. Log delivery attempts

### File: apps/api/src/routes/webhook.routes.ts

```
POST   /v1/webhooks           [requireUser]
GET    /v1/webhooks           [requireUser]
DELETE /v1/webhooks/:id       [requireUser]
```

### Integrate webhook delivery into:
- `transaction.service.ts` → after pay: fire `transaction.completed` to user, `merchant.payment_received` to merchant
- `transaction.service.ts` → after transfer: fire `transfer.completed` to both users
- `wallet.service.ts` → when agent requests wallet: fire `wallet.approval_requested` to user
- `wallet.service.ts` → on fund: check if balance < 20% of monthly limit, fire `wallet.low_balance`

---

## Step 13: Wire Up the Express App

### What to do
Connect all routes, middleware, and services into the Express app.

### File: apps/api/src/app.ts

```typescript
import express from 'express';
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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/v1/auth', authRouter);
app.use('/v1/funding', fundingRouter);
app.use('/v1/agents', agentRouter);
app.use('/v1/wallets', walletRouter);
app.use('/v1/transactions', transactionRouter);
app.use('/v1/merchants', merchantRouter);
app.use('/v1/webhooks', webhookRouter);

app.use(errorHandler);

export { app };
```

### Update apps/api/src/index.ts
```typescript
import { app } from './app';

const PORT = parseInt(process.env.PORT || '80');

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AgentsPay API running on port ${PORT}`);
});
```

### Verification
```bash
npm run build
npm test                    # all tests pass
docker compose up -d        # start local Postgres + Redis
npm run db:push             # push schema
npm run dev                 # API starts, all routes respond
```

---

## Step 14: CLI

### What to do
Build the CLI tool that talks to the API. The CLI is the only way users interact with AgentsPay.

### Architecture
The CLI uses `@agentspay/sdk` internally (build the SDK first — Step 15). Commander.js for command parsing, inquirer for interactive prompts.

### File: apps/cli/src/index.ts

```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('agentspay')
  .description('Payment infrastructure for AI agents')
  .version('0.0.1');

// Import and register all command groups
// program.addCommand(authCommand);
// program.addCommand(agentCommand);
// program.addCommand(walletCommand);
// program.addCommand(txCommand);
// program.addCommand(merchantCommand);
// program.addCommand(webhookCommand);
// program.addCommand(fundingCommand);
// program.addCommand(configCommand);

program.parse();
```

### Implement each command file under apps/cli/src/commands/

Implement ALL commands from spec Section 7. Each command:
1. Parses arguments/flags
2. Calls the SDK client
3. Formats output as table (default) or JSON (--json flag)
4. Handles errors gracefully

### Key commands (implement in this order):
1. `register` — interactive email/password, outputs master key
2. `login` — stores JWT to `~/.agentspay/credentials.json`
3. `balance` — shows platform balance
4. `deposit` — opens Stripe checkout URL
5. `agent create` — creates agent, outputs key
6. `agent list` — table of agents
7. `wallet create` — creates + funds wallet
8. `wallet list` / `wallet balance`
9. `wallet approve` / `wallet freeze`
10. `tx list` — transaction history
11. `merchant register` — merchant onboarding
12. `webhook add` / `webhook list`
13. `config set` / `config get`

### Local credential storage: apps/cli/src/lib/auth.ts
```typescript
// Store credentials in ~/.agentspay/credentials.json
// Auto-refresh JWT when expired
// Read master key from config for API calls
```

### Verification
```bash
cd apps/cli && npm run build
npx agentspay --help        # shows all commands
npx agentspay register      # interactive flow works
npx agentspay agent list --json   # JSON output works
```

---

## Step 15: SDK Package

### What to do
Build `@agentspay/sdk` — the TypeScript client library.

### File: packages/sdk/src/index.ts

Export the `AgentsPay` class. See spec Section 8 for the full interface.

### Core structure:
```typescript
export class AgentsPay {
  private client: HttpClient;

  constructor(opts: { agentKey?: string; masterKey?: string; apiUrl?: string }) {
    // Set up HTTP client with auth headers
  }

  // Agent-facing methods
  async pay(opts: PayRequest): Promise<PayResponse> { ... }
  async transfer(opts: TransferRequest): Promise<TransferResponse> { ... }

  wallets = {
    getBalance: async (walletId?: string): Promise<WalletBalance> => { ... },
    request: async (opts: RequestWalletOpts): Promise<Wallet> => { ... },
    list: async (): Promise<Wallet[]> => { ... },
  };

  transactions = {
    list: async (opts?: ListTxOpts): Promise<PaginatedTxResponse> => { ... },
    get: async (txId: string): Promise<Transaction> => { ... },
  };

  agents = {
    lookup: async (account: string): Promise<AgentPublicInfo> => { ... },
  };

  merchants = {
    list: async (opts?: ListMerchantOpts): Promise<Merchant[]> => { ... },
  };

  // User/admin methods (only work with masterKey)
  admin = {
    agents: {
      create: async (opts: CreateAgentOpts): Promise<CreateAgentResponse> => { ... },
      list: async (): Promise<Agent[]> => { ... },
      revoke: async (agentId: string): Promise<void> => { ... },
    },
    wallets: {
      create: async (opts: CreateWalletOpts): Promise<Wallet> => { ... },
      fund: async (walletId: string, amount: number): Promise<Wallet> => { ... },
      freeze: async (walletId: string): Promise<void> => { ... },
      approve: async (walletId: string): Promise<Wallet> => { ... },
    },
    funding: {
      getBalance: async (): Promise<FundingBalance> => { ... },
      deposit: async (amount: number): Promise<DepositResponse> => { ... },
    },
  };
}
```

### File: packages/sdk/src/client.ts

HTTP client with:
- Base URL configuration (default: `https://api.agentspay.com`)
- Auth header injection (X-Agent-Key or X-Master-Key)
- Automatic retry on 5xx (3 attempts, exponential backoff)
- Error parsing (convert API error JSON to typed SDK errors)
- Request/response typing

### Verification
```bash
cd packages/sdk && npm run build
# Write a simple test that creates AgentsPay instance and mocks an API call
npm test
```

---

## Step 16: MCP Server

### What to do
Build the MCP server that exposes AgentsPay tools to any MCP-compatible agent.

### File: apps/mcp/src/index.ts

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgentsPay } from '@agentspay/sdk';
import { registerTools } from './tools';
import { registerResources } from './resources';

const agentKey = process.env.AGENTSPAY_AGENT_KEY;
if (!agentKey) {
  console.error('AGENTSPAY_AGENT_KEY environment variable is required');
  process.exit(1);
}

const ap = new AgentsPay({ agentKey });
const server = new Server({ name: 'agentspay', version: '0.1.0' }, {
  capabilities: { tools: {}, resources: {} }
});

registerTools(server, ap);
registerResources(server, ap);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Dependencies for apps/mcp/package.json:
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@agentspay/sdk": "workspace:*"
  }
}
```

### File: apps/mcp/src/tools/index.ts

Register ALL MCP tools from spec Section 6:
- `agentspay_get_balance`
- `agentspay_pay`
- `agentspay_transfer`
- `agentspay_list_transactions`
- `agentspay_lookup_agent`
- `agentspay_list_merchants`
- `agentspay_request_wallet`

Each tool implementation calls the SDK and returns formatted results. Copy the exact input schemas from the spec.

### File: apps/mcp/src/resources/index.ts

Register MCP resources:
```
agentspay://wallet/{walletId}     → wallet state
agentspay://transactions/recent   → last 10 transactions
agentspay://agent/me              → current agent info
```

### Verification
```bash
cd apps/mcp && npm run build
# Test by running with stdio:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | AGENTSPAY_AGENT_KEY=test node dist/index.js
# Should return list of tools
```

---

## Step 17: Integration Tests

### What to do
Write end-to-end tests that exercise the full flow.

### File: apps/api/tests/integration/full-flow.test.ts

Test the complete loop:
```
1. Register user → get master key
2. Login → get JWT
3. Deposit $100 (mock Stripe webhook)
4. Check balance → $100
5. Create agent → get agent key
6. Create wallet with $50, daily limit $20
7. Check wallet balance → $50
8. Register merchant (in separate test context)
9. Agent pays merchant $5 → success, wallet=$45, merchant=$4.925
10. Agent pays merchant $25 → fails (exceeds daily limit after $5 already spent... wait, daily limit is $20 and we spent $5, so $15 remaining. Pay $16 → fail)
11. Agent pays $15 → success, wallet=$30
12. Try pay $1 → fails (daily limit $20 reached: $5 + $15 = $20)
13. Create second agent
14. Transfer $10 from agent1 to agent2
15. Verify agent2 wallet has $10 (minus fee)
16. Close wallet → remaining returned to user balance
```

### File: apps/api/tests/integration/concurrent.test.ts

Test race conditions:
- 10 concurrent $5 payments from a wallet with $30 → exactly 6 succeed, 4 fail
- 2 concurrent fund operations → both complete, no double-credit

---

## Step 18: Deploy to usectl

### What to do
Push to GitHub and deploy via usectl.

### Pre-deploy checklist:
- [ ] All tests pass
- [ ] Dockerfile builds successfully locally: `docker build -t agentspay .`
- [ ] `.env.example` documents all required vars
- [ ] `prisma migrate deploy` runs in Dockerfile CMD

### Deploy commands:
```bash
# Push code to GitHub
git init
git add .
git commit -m "Initial AgentsPay release"
git remote add origin https://github.com/<user>/agentspay.git
git push -u origin main

# Create project on usectl with database
usectl projects create \
  --repo https://github.com/<user>/agentspay \
  --name agentspay \
  --database

# Set environment variables
usectl env set --project agentspay --key STRIPE_SECRET_KEY --value "sk_live_xxx"
usectl env set --project agentspay --key STRIPE_WEBHOOK_SECRET --value "whsec_xxx"
usectl env set --project agentspay --key JWT_SECRET --value "$(openssl rand -base64 32)"
usectl env set --project agentspay --key REDIS_URL --value "redis://your-redis-host:6379"
usectl env set --project agentspay --key NODE_ENV --value "production"
usectl env set --project agentspay --key PORT --value "80"

# Deploy
usectl deploy --project agentspay

# Watch logs
usectl logs --project agentspay --follow

# Once live, verify:
curl https://agentspay.usectl.app/health
```

### Note on Redis
usectl provides PostgreSQL but not Redis. Options:
1. **Upstash** (recommended) — free tier, serverless Redis, set `REDIS_URL` env var
2. **Skip Redis initially** — use in-memory rate limiting for MVP (not production-safe but works for launch)

### Post-deploy:
```bash
# Publish packages to npm
cd packages/sdk && npm publish --access public
cd apps/cli && npm publish --access public
cd apps/mcp && npm publish --access public

# Configure Stripe webhook endpoint
# In Stripe Dashboard → Webhooks → Add endpoint:
# URL: https://agentspay.usectl.app/v1/stripe/webhook
# Events: payment_intent.succeeded, checkout.session.completed, account.updated, payout.paid, payout.failed

# Add custom domain (optional)
usectl domains add --project agentspay --domain api.agentspay.com
# Then add CNAME: api.agentspay.com → agentspay.usectl.app
```

---

## Summary: Build Order

| Step | What | Depends On | Estimated Time |
|------|------|-----------|---------------|
| 0 | Monorepo scaffold | Nothing | 1 hour |
| 1 | Prisma schema + migrations | Step 0 | 30 min |
| 2 | Shared types + constants | Step 0 | 1 hour |
| 3 | API key utilities | Step 2 | 30 min |
| 4 | Auth middleware | Steps 1, 3 | 2 hours |
| 5 | Auth service + routes | Step 4 | 2 hours |
| 6 | Funding service (Stripe) | Step 5 | 3 hours |
| 7 | Agent service + routes | Step 5 | 2 hours |
| 8 | Wallet service + routes | Steps 6, 7 | 3 hours |
| 9 | Payment transactions | Step 8 | 3 hours |
| 10 | Transfer transactions | Step 9 | 2 hours |
| 11 | Merchant service | Steps 6, 9 | 2 hours |
| 12 | Webhook delivery | Steps 9, 10 | 2 hours |
| 13 | Wire up Express app | Steps 5-12 | 1 hour |
| 14 | CLI | Step 15 (SDK) | 4 hours |
| 15 | SDK package | Step 2 | 3 hours |
| 16 | MCP server | Step 15 | 3 hours |
| 17 | Integration tests | Step 13 | 3 hours |
| 18 | Deploy to usectl | Step 17 | 1 hour |

**Total estimate: ~38 hours of focused building**

---

*Feed this document to Claude Code one step at a time. Say: "Complete Step 0 of the AgentsPay build guide" and it will know exactly what to do.*
