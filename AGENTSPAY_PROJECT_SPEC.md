# AgentsPay — Project Specification v2

> **Payment infrastructure for AI agents. No dashboard. No UI. Pure API.**
> Developers register via CLI. Agents get wallets, pay for services, and transfer money to other agents — all programmatically. Built on Stripe.

---

## Table of Contents

1. [Vision & Philosophy](#1-vision--philosophy)
2. [How It Works](#2-how-it-works)
3. [Architecture](#3-architecture)
4. [Data Models](#4-data-models)
5. [REST API](#5-rest-api)
6. [MCP Server](#6-mcp-server)
7. [CLI Specification](#7-cli-specification)
8. [SDK Specification](#8-sdk-specification)
9. [Stripe Integration](#9-stripe-integration)
10. [Agent-to-Agent Protocol](#10-agent-to-agent-protocol)
11. [Security](#11-security)
12. [Development Phases](#12-development-phases)
13. [Project Structure](#13-project-structure)

---

## 1. Vision & Philosophy

### The Problem
AI agents need to pay for things — API tokens, compute, services, other agents' work. Today, every payment requires a human to pre-provision API keys, set up billing, and manually manage spend. There's no way for an agent to autonomously acquire what it needs.

### The Solution
AgentsPay is **payment infrastructure for agents**. Not a dashboard. Not a SaaS with a UI. It's plumbing.

- A **REST API** that agents call to pay and get paid
- An **MCP server** so any MCP-compatible agent (Claude, GPT, etc.) can use AgentsPay as a native tool
- A **CLI** for developers to set up accounts, fund wallets, and monitor spend
- An **SDK** (`@agentspay/sdk`) for programmatic integration into any agent framework
- **No web frontend.** Everything is API-first, CLI-first, agent-first.

### Design Principles

1. **Agent-native**: The primary consumer of AgentsPay is an AI agent, not a human
2. **Developer-operated**: Humans interact only via CLI and API — no clicking around in browsers
3. **Stripe under the hood**: We don't reinvent payment rails. Stripe moves money. We manage agent wallets, spending rules, and agent-to-agent transfers.
4. **MCP-first**: Any agent that supports MCP tools can use AgentsPay with zero custom code
5. **Minimal surface area**: Fewer features, done perfectly. Pay, transfer, check balance. That's it.

### Business Model
- Transaction fee: 1.5% per payment (on top of Stripe's fees)
- Free tier: up to $100/month in transactions
- Pro tier: $29/month — higher limits, priority support, webhook delivery guarantees

---

## 2. How It Works

### The Complete Loop

```
SETUP (human, one time via CLI):
  1. Developer runs: agentspay register
  2. Developer runs: agentspay deposit --amount 100
  3. Developer runs: agentspay agent create --name "my-agent"
     → gets back: AGENTSPAY_AGENT_KEY=ap_agent_xxxxx
  4. Developer runs: agentspay wallet create --agent my-agent --amount 50 --daily-limit 20
     → gets back: wallet_id=wal_abc123
  5. Developer sets AGENTSPAY_AGENT_KEY in agent's environment

RUNTIME (agent, autonomous):
  6. Agent needs to pay for something (e.g., buy API tokens)
     → calls AgentsPay API or MCP tool: pay $5 to merchant mer_openai
     → AgentsPay validates limits, debits wallet, credits merchant
     → returns receipt

  7. Agent needs to pay another agent for a sub-task
     → calls: transfer $10 to AGT-87654321
     → AgentsPay moves funds between wallets
     → both agents get confirmation

  8. Another agent receives money and can spend it
     → the cycle continues

MONITORING (human, via CLI):
  9. Developer checks: agentspay transactions --agent my-agent
  10. Developer checks: agentspay wallet balance wal_abc123
  11. Developer gets webhook notifications for each transaction
```

### Who Registers as What

| Entity | How They Register | What They Get |
|--------|------------------|---------------|
| **Developer** (human) | `agentspay register` via CLI | Account, master API key, ability to fund and create agents |
| **Agent** | Developer creates via CLI, OR agent self-registers via API using master key | Agent ID, agent API key, account number (AGT-XXXXXXXX) |
| **Merchant** (service provider) | `agentspay merchant register` via CLI or API | Merchant ID, API key, Stripe Connected Account for payouts |

### Agent Self-Registration Flow
An agent CAN register itself if the developer enables it:
```
Developer: agentspay config set allow-agent-self-register true

Agent (at runtime):
  POST /v1/agents/self-register
  Headers: X-Master-Key: ap_master_xxxxx
  Body: { "name": "sub-agent-research", "capabilities": ["web-search", "summarize"] }

  → Response: { "agent_id": "agt_xyz", "api_key": "ap_agent_yyyyy", "account": "AGT-12345678" }

Agent then requests a wallet:
  POST /v1/wallets
  Headers: X-Agent-Key: ap_agent_yyyyy
  Body: { "name": "research-budget", "requested_amount": 25 }

  → Wallet created in PENDING_APPROVAL state
  → Developer gets CLI notification / webhook
  → Developer approves: agentspay wallet approve wal_pending123
  → Wallet is now active with $25
```

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AGENT INTEGRATION LAYER                      │
│                                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│   │ MCP Server│    │   SDK    │    │   CLI    │    │ REST API │ │
│   │(stdio/sse)│    │(npm pkg) │    │ (Node)   │    │ (direct) │ │
│   └─────┬────┘    └─────┬────┘    └─────┬────┘    └─────┬────┘ │
│         │               │               │               │       │
└─────────┼───────────────┼───────────────┼───────────────┼───────┘
          │               │               │               │
          ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API SERVER                               │
│                    (Express + TypeScript)                         │
│                                                                  │
│   Auth Middleware → Rate Limiter → Route Handler → Service Layer │
│                                                                  │
│   Routes:                                                        │
│     /v1/auth/*           User registration, login, API keys     │
│     /v1/agents/*         Agent CRUD, self-register, lookup      │
│     /v1/wallets/*        Wallet CRUD, fund, freeze, approve     │
│     /v1/transactions/*   Pay, transfer, history                 │
│     /v1/merchants/*      Merchant register, balance, payout     │
│     /v1/webhooks/*       Webhook configuration                  │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL   │  │    Redis     │  │    Stripe    │
│              │  │              │  │              │
│  Users       │  │  Rate limits │  │  Payments    │
│  Agents      │  │  Tx locks    │  │  Connect     │
│  Wallets     │  │  Balance     │  │  Payouts     │
│  Transactions│  │  cache       │  │              │
│  Audit logs  │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **API Server** | Express.js + TypeScript | Simple, battle-tested, easy to deploy |
| **Database** | PostgreSQL 15+ (Prisma ORM) | ACID transactions critical for financial data |
| **Cache** | Redis | Rate limiting, balance caching, distributed locks |
| **Payments** | Stripe (Payments, Connect) | Industry standard, handles compliance |
| **CLI** | Node.js + Commander.js | Consistent with TypeScript stack |
| **SDK** | TypeScript (`@agentspay/sdk`) | Type-safe, works in Node + edge runtimes |
| **MCP Server** | TypeScript (`@agentspay/mcp`) | stdio + SSE transport for agent integration |
| **Validation** | Zod | Runtime type checking, schema-first |
| **Monorepo** | Turborepo | Shared types between api, cli, sdk, mcp |
| **Hosting** | Railway / Render | Simple deploy, auto-scaling, managed infra |
| **Database hosting** | Neon | Serverless Postgres, branching for dev |

---

## 4. Data Models

### Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ──────────────────────────────────────
// USER (developer who operates agents)
// ──────────────────────────────────────
model User {
  id                     String    @id @default(cuid())
  email                  String    @unique
  passwordHash           String
  stripeCustomerId       String?   @unique
  emailVerified          Boolean   @default(false)
  platformBalance        Decimal   @default(0) @db.Decimal(12, 2)
  allowAgentSelfRegister Boolean   @default(false)
  tier                   UserTier  @default(FREE)
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  apiKeys                ApiKey[]
  agents                 Agent[]
  fundingTransactions    FundingTransaction[]
  webhookEndpoints       WebhookEndpoint[]

  @@map("users")
}

enum UserTier {
  FREE
  PRO
}

// ──────────────────────────────────────
// API KEY (master keys for users)
// ──────────────────────────────────────
model ApiKey {
  id          String    @id @default(cuid())
  userId      String
  keyHash     String    @unique          // SHA-256 hash of the key
  keyPrefix   String                     // first 8 chars for identification: ap_master_xxxx
  label       String    @default("default")
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  revoked     Boolean   @default(false)
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id])

  @@index([keyHash])
  @@map("api_keys")
}

// ──────────────────────────────────────
// AGENT
// ──────────────────────────────────────
model Agent {
  id              String      @id @default(cuid())
  userId          String
  name            String
  accountNumber   String      @unique    // AGT-XXXXXXXX (public identifier)
  description     String?
  apiKeyHash      String      @unique    // SHA-256 hash
  apiKeyPrefix    String                 // ap_agent_xxxx
  status          AgentStatus @default(ACTIVE)
  metadata        Json?
  lastActiveAt    DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  user            User        @relation(fields: [userId], references: [id])
  wallets         Wallet[]
  sentTx          Transaction[] @relation("SenderAgent")
  receivedTx      Transaction[] @relation("ReceiverAgent")

  @@index([accountNumber])
  @@map("agents")
}

enum AgentStatus {
  ACTIVE
  SUSPENDED
  REVOKED
}

// ──────────────────────────────────────
// WALLET
// ──────────────────────────────────────
model Wallet {
  id                  String       @id @default(cuid())
  agentId             String
  name                String
  balance             Decimal      @default(0) @db.Decimal(12, 2)
  currency            String       @default("USD")
  status              WalletStatus @default(ACTIVE)

  // Spending controls
  limitPerTx          Decimal?     @db.Decimal(12, 2)  // max per single transaction
  dailyLimit          Decimal?     @db.Decimal(12, 2)  // max spend per day
  monthlyLimit        Decimal?     @db.Decimal(12, 2)  // max spend per month
  allowedMerchants    String[]                          // merchant IDs (empty = all)
  allowTransfersIn    Boolean      @default(true)
  allowTransfersOut   Boolean      @default(true)

  expiresAt           DateTime?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  agent               Agent        @relation(fields: [agentId], references: [id])
  transactions        Transaction[]
  spendLogs           SpendLog[]

  @@map("wallets")
}

enum WalletStatus {
  PENDING_APPROVAL   // agent requested, waiting for user to approve via CLI
  ACTIVE
  FROZEN
  EXPIRED
  CLOSED
}

// ──────────────────────────────────────
// MERCHANT (service provider)
// ──────────────────────────────────────
model Merchant {
  id                  String         @id @default(cuid())
  name                String
  email               String         @unique
  stripeAccountId     String?        @unique
  onboardingComplete  Boolean        @default(false)
  apiKeyHash          String         @unique
  apiKeyPrefix        String
  webhookUrl          String?
  webhookSecret       String?
  category            String?        // "ai_tokens", "compute", "saas", "data"
  balance             Decimal        @default(0) @db.Decimal(12, 2)
  status              MerchantStatus @default(PENDING)
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  transactions        Transaction[]

  @@map("merchants")
}

enum MerchantStatus {
  PENDING
  ACTIVE
  SUSPENDED
}

// ──────────────────────────────────────
// TRANSACTION
// ──────────────────────────────────────
model Transaction {
  id              String            @id @default(cuid())
  type            TxType
  status          TxStatus          @default(PENDING)
  amount          Decimal           @db.Decimal(12, 2)
  fee             Decimal           @default(0) @db.Decimal(12, 2)
  currency        String            @default("USD")
  description     String?
  metadata        Json?
  idempotencyKey  String?           @unique

  walletId        String
  wallet          Wallet            @relation(fields: [walletId], references: [id])

  senderAgentId   String?
  senderAgent     Agent?            @relation("SenderAgent", fields: [senderAgentId], references: [id])

  receiverAgentId String?
  receiverAgent   Agent?            @relation("ReceiverAgent", fields: [receiverAgentId], references: [id])

  merchantId      String?
  merchant        Merchant?         @relation(fields: [merchantId], references: [id])

  stripePaymentId String?

  createdAt       DateTime          @default(now())
  completedAt     DateTime?

  @@index([walletId, createdAt])
  @@index([senderAgentId])
  @@index([merchantId])
  @@index([idempotencyKey])
  @@map("transactions")
}

enum TxType {
  PAYMENT         // agent → merchant
  TRANSFER        // agent → agent
  FUND            // user balance → wallet
  WITHDRAW        // wallet → user balance
  REFUND          // reversal
}

enum TxStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
}

// ──────────────────────────────────────
// FUNDING (bank ↔ platform)
// ──────────────────────────────────────
model FundingTransaction {
  id              String    @id @default(cuid())
  userId          String
  amount          Decimal   @db.Decimal(12, 2)
  direction       FundingDirection
  status          TxStatus  @default(PENDING)
  stripePaymentId String?
  createdAt       DateTime  @default(now())

  user            User      @relation(fields: [userId], references: [id])

  @@map("funding_transactions")
}

enum FundingDirection {
  IN    // bank → platform
  OUT   // platform → bank
}

// ──────────────────────────────────────
// SPEND LOG (daily/monthly tracking)
// ──────────────────────────────────────
model SpendLog {
  id        String   @id @default(cuid())
  walletId  String
  date      DateTime @db.Date
  daily     Decimal  @default(0) @db.Decimal(12, 2)
  monthly   Decimal  @default(0) @db.Decimal(12, 2)

  wallet    Wallet   @relation(fields: [walletId], references: [id])

  @@unique([walletId, date])
  @@map("spend_logs")
}

// ──────────────────────────────────────
// WEBHOOK ENDPOINT
// ──────────────────────────────────────
model WebhookEndpoint {
  id        String   @id @default(cuid())
  userId    String
  url       String
  secret    String   // HMAC signing secret
  events    String[] // ["transaction.completed", "wallet.low_balance", ...]
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])

  @@map("webhook_endpoints")
}

// ──────────────────────────────────────
// AUDIT LOG (append-only)
// ──────────────────────────────────────
model AuditLog {
  id         String   @id @default(cuid())
  actor      String   // user_id, agent_id, or "system"
  actorType  String   // "user", "agent", "merchant", "system"
  action     String   // "transaction.pay", "wallet.create", etc.
  resourceId String
  details    Json?
  ip         String?
  createdAt  DateTime @default(now())

  @@index([actor, createdAt])
  @@index([resourceId])
  @@map("audit_logs")
}
```

---

## 5. REST API

### Base URL
```
https://api.agentspay.com/v1
```

### Authentication

| Who | Header | Format |
|-----|--------|--------|
| Developer (user) | `Authorization: Bearer <jwt>` | From `POST /auth/login` |
| Developer (programmatic) | `X-Master-Key` | `ap_master_xxxxxxxx` |
| Agent | `X-Agent-Key` | `ap_agent_xxxxxxxx` |
| Merchant | `X-Merchant-Key` | `ap_merch_xxxxxxxx` |

All responses are JSON. All monetary amounts are in the smallest currency unit or decimal with 2 places.

### 5.1 Auth

```
POST /v1/auth/register
  Body: { email, password }
  → { user_id, master_api_key }    // key shown ONCE

POST /v1/auth/login
  Body: { email, password }
  → { token, refresh_token, expires_in }

POST /v1/auth/refresh
  Body: { refresh_token }
  → { token, refresh_token, expires_in }

GET  /v1/auth/me
  → { user_id, email, platform_balance, tier, created_at }

POST /v1/auth/api-keys
  Body: { label? }
  → { key_id, api_key, prefix }    // key shown ONCE

DELETE /v1/auth/api-keys/:keyId
  → { revoked: true }
```

### 5.2 Funding

```
POST /v1/funding/deposit
  Auth: user
  Body: { amount, payment_method_id? }
  → { funding_id, amount, status, stripe_client_secret? }

POST /v1/funding/withdraw
  Auth: user
  Body: { amount }
  → { funding_id, amount, status, estimated_arrival }

GET  /v1/funding/balance
  Auth: user
  → { available: 95.50, pending: 0 }

POST /v1/funding/payment-methods
  Auth: user
  Body: { type: "card" | "bank_account", stripe_token }
  → { payment_method_id, type, last4 }

GET  /v1/funding/payment-methods
  Auth: user
  → [{ payment_method_id, type, last4, default }]
```

### 5.3 Agents

```
POST /v1/agents
  Auth: user
  Body: { name, description?, metadata? }
  → { agent_id, account_number, api_key }   // key shown ONCE

POST /v1/agents/self-register
  Auth: master key
  Body: { name, description?, capabilities? }
  → { agent_id, account_number, api_key }   // key shown ONCE

GET  /v1/agents
  Auth: user
  → [{ agent_id, name, account_number, status, wallet_count, total_balance, last_active_at }]

GET  /v1/agents/:id
  Auth: user or owning agent
  → { agent_id, name, account_number, status, wallets, metadata, created_at }

DELETE /v1/agents/:id
  Auth: user
  → { status: "revoked" }

POST /v1/agents/:id/rotate-key
  Auth: user
  → { new_api_key }                          // shown ONCE

GET  /v1/agents/lookup
  Auth: any authenticated
  Query: ?account=AGT-12345678
  → { agent_id, name, account_number, accepts_transfers }
```

### 5.4 Wallets

```
POST /v1/wallets
  Auth: user or agent
  Body: {
    agent_id,
    name,
    funding_amount?,          // if user auth, funds immediately
    requested_amount?,        // if agent auth, creates PENDING wallet
    limit_per_tx?,
    daily_limit?,
    monthly_limit?,
    allowed_merchants?,       // string[] of merchant IDs
    expires_at?
  }
  → { wallet_id, status, balance, limits }

GET  /v1/wallets
  Auth: user or agent
  Query: ?agent_id=xxx
  → [{ wallet_id, name, balance, status, limits, agent_id }]

GET  /v1/wallets/:id
  Auth: user or owning agent
  → { wallet_id, name, balance, status, limits, spend_today, spend_this_month }

POST /v1/wallets/:id/fund
  Auth: user
  Body: { amount }
  → { wallet_id, new_balance, transaction_id }

POST /v1/wallets/:id/freeze
  Auth: user
  → { wallet_id, status: "frozen" }

POST /v1/wallets/:id/unfreeze
  Auth: user
  → { wallet_id, status: "active" }

POST /v1/wallets/:id/approve
  Auth: user
  → { wallet_id, status: "active", balance }

POST /v1/wallets/:id/reject
  Auth: user
  → { wallet_id, status: "closed" }

DELETE /v1/wallets/:id
  Auth: user
  → { wallet_id, status: "closed", returned_amount }
  // remaining balance returned to user platform balance
```

### 5.5 Transactions

```
POST /v1/transactions/pay
  Auth: agent
  Body: {
    wallet_id,
    merchant_id,
    amount,
    description?,
    metadata?,
    idempotency_key          // REQUIRED
  }
  → {
    transaction_id,
    status: "completed",
    amount,
    fee,
    wallet_balance_after,
    created_at
  }

POST /v1/transactions/transfer
  Auth: agent
  Body: {
    from_wallet_id,
    to_agent_account,        // AGT-XXXXXXXX
    amount,
    reason?,
    metadata?,
    idempotency_key          // REQUIRED
  }
  → {
    transaction_id,
    status: "completed",
    amount,
    fee,
    wallet_balance_after,
    recipient_agent: { account_number, name },
    created_at
  }

GET  /v1/transactions
  Auth: user or agent
  Query: ?wallet_id=xxx&type=payment&from=2026-01-01&to=2026-03-10&limit=50&cursor=xxx
  → { transactions: [...], cursor?, has_more }

GET  /v1/transactions/:id
  Auth: user or agent involved
  → { full transaction details }
```

### 5.6 Merchants

```
POST /v1/merchants/register
  Body: { name, email, password, category? }
  → { merchant_id, api_key, onboarding_url }
  // onboarding_url → Stripe Connect Express onboarding

GET  /v1/merchants/me
  Auth: merchant
  → { merchant_id, name, balance, status, onboarding_complete }

GET  /v1/merchants/balance
  Auth: merchant
  → { available, pending }

POST /v1/merchants/withdraw
  Auth: merchant
  Body: { amount? }             // omit to withdraw all
  → { payout_id, amount, estimated_arrival }

GET  /v1/merchants/transactions
  Auth: merchant
  Query: ?from=xxx&to=xxx&limit=50&cursor=xxx
  → { transactions: [...], cursor?, has_more }
```

### 5.7 Webhooks

```
POST /v1/webhooks
  Auth: user
  Body: { url, events: ["transaction.completed", "wallet.low_balance", ...] }
  → { webhook_id, url, secret, events }

GET  /v1/webhooks
  Auth: user
  → [{ webhook_id, url, events, active }]

DELETE /v1/webhooks/:id
  Auth: user
  → { deleted: true }
```

**Webhook payload format:**
```json
{
  "id": "evt_abc123",
  "type": "transaction.completed",
  "created_at": "2026-03-10T14:30:00Z",
  "data": { ... }
}
```

**Signature:** `X-AgentsPay-Signature: sha256=<hmac of body with webhook secret>`

**Event types:**
```
transaction.completed
transaction.failed
transfer.completed
wallet.approval_requested
wallet.funded
wallet.low_balance          // triggers at 20% remaining
wallet.frozen
wallet.expired
agent.created
agent.revoked
merchant.payment_received
```

---

## 6. MCP Server

The MCP server is the **killer feature**. Any MCP-compatible agent (Claude, GPT with tools, custom agents) can use AgentsPay as a native tool — no SDK integration needed. The agent just has AgentsPay in its tool list and can pay for things naturally.

### Package
```
@agentspay/mcp
```

### Installation & Configuration
```bash
npm install -g @agentspay/mcp
```

**Claude Desktop / Claude Code config (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "agentspay": {
      "command": "npx",
      "args": ["@agentspay/mcp"],
      "env": {
        "AGENTSPAY_AGENT_KEY": "ap_agent_xxxxx"
      }
    }
  }
}
```

**SSE transport (for remote agents):**
```bash
agentspay-mcp --transport sse --port 3100
```

### MCP Tools Exposed

#### `agentspay_get_balance`
Check wallet balance.
```json
{
  "name": "agentspay_get_balance",
  "description": "Check the balance of your AgentsPay wallet. Returns available funds.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "wallet_id": {
        "type": "string",
        "description": "Wallet ID. Omit to get default wallet balance."
      }
    }
  }
}
```
**Returns:**
```json
{
  "wallet_id": "wal_abc123",
  "balance": "45.00",
  "currency": "USD",
  "daily_remaining": "15.00",
  "monthly_remaining": "180.00"
}
```

#### `agentspay_pay`
Pay a merchant.
```json
{
  "name": "agentspay_pay",
  "description": "Pay a merchant from your wallet. Use this when you need to purchase API tokens, compute, services, or any other paid resource.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "merchant_id": {
        "type": "string",
        "description": "The merchant's ID on AgentsPay"
      },
      "amount": {
        "type": "number",
        "description": "Amount to pay in USD"
      },
      "description": {
        "type": "string",
        "description": "What is this payment for"
      },
      "wallet_id": {
        "type": "string",
        "description": "Which wallet to pay from. Omit for default wallet."
      }
    },
    "required": ["merchant_id", "amount", "description"]
  }
}
```
**Returns:**
```json
{
  "transaction_id": "tx_def456",
  "status": "completed",
  "amount": "5.00",
  "wallet_balance_after": "40.00",
  "receipt": "Payment of $5.00 to OpenAI for API tokens"
}
```

#### `agentspay_transfer`
Transfer money to another agent.
```json
{
  "name": "agentspay_transfer",
  "description": "Transfer funds to another agent on AgentsPay. Use this to pay another AI agent for work, sub-tasks, or services.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "to_agent": {
        "type": "string",
        "description": "Recipient agent's account number (AGT-XXXXXXXX) or agent ID"
      },
      "amount": {
        "type": "number",
        "description": "Amount to transfer in USD"
      },
      "reason": {
        "type": "string",
        "description": "Why are you transferring this money"
      },
      "wallet_id": {
        "type": "string",
        "description": "Which wallet to transfer from. Omit for default wallet."
      }
    },
    "required": ["to_agent", "amount", "reason"]
  }
}
```

#### `agentspay_list_transactions`
View recent transactions.
```json
{
  "name": "agentspay_list_transactions",
  "description": "View your recent transactions. Returns payment and transfer history.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit": {
        "type": "number",
        "description": "Number of transactions to return (default 10, max 50)"
      },
      "type": {
        "type": "string",
        "enum": ["payment", "transfer", "all"],
        "description": "Filter by transaction type"
      }
    }
  }
}
```

#### `agentspay_lookup_agent`
Find another agent by account number.
```json
{
  "name": "agentspay_lookup_agent",
  "description": "Look up an agent by their account number to verify their identity before transferring funds.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "account_number": {
        "type": "string",
        "description": "Agent account number (AGT-XXXXXXXX)"
      }
    },
    "required": ["account_number"]
  }
}
```

#### `agentspay_list_merchants`
Discover available merchants.
```json
{
  "name": "agentspay_list_merchants",
  "description": "List merchants that accept payments via AgentsPay. Use this to find services you can pay for.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "Filter by category: ai_tokens, compute, saas, data, other"
      },
      "search": {
        "type": "string",
        "description": "Search merchants by name"
      }
    }
  }
}
```

#### `agentspay_request_wallet`
Agent requests a new wallet (requires user approval).
```json
{
  "name": "agentspay_request_wallet",
  "description": "Request a new wallet with a specific budget. Your owner will need to approve this request.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Name for this wallet (e.g., 'research-budget', 'api-tokens')"
      },
      "requested_amount": {
        "type": "number",
        "description": "How much funding you're requesting in USD"
      },
      "reason": {
        "type": "string",
        "description": "Why you need this wallet"
      }
    },
    "required": ["name", "requested_amount", "reason"]
  }
}
```

### MCP Resources

The MCP server also exposes resources for context:

```
agentspay://wallet/wal_abc123          → Current wallet state
agentspay://transactions/recent        → Last 10 transactions
agentspay://merchants/directory        → Available merchants
agentspay://agent/me                   → Current agent info
```

---

## 7. CLI Specification

### Package
```
npm install -g @agentspay/cli
```

Binary name: `agentspay`

### Authentication & Setup

```bash
# Register a new account
agentspay register
  → Interactive: email, password
  → Outputs: master API key (save it!)

# Login (stores JWT locally)
agentspay login
  → Interactive: email, password

# Show current user
agentspay whoami
  → Email, balance, tier, agent count

# Logout
agentspay logout
```

### Funding

```bash
# Check platform balance
agentspay balance

# Deposit money
agentspay deposit --amount 100
  → Opens Stripe Checkout link in browser (or returns URL)
  → Confirms when payment succeeds

# Withdraw to bank
agentspay withdraw --amount 50

# List payment methods
agentspay payment-methods

# Add payment method
agentspay payment-methods add
  → Opens Stripe setup link
```

### Agents

```bash
# Create an agent
agentspay agent create --name "research-bot" --description "Web research agent"
  → agent_id: agt_abc123
  → account:  AGT-12345678
  → api_key:  ap_agent_xxxxx    (SAVE THIS — shown once)

# List agents
agentspay agent list
  → Table: name, account, status, wallets, balance, last active

# Get agent details
agentspay agent info agt_abc123

# Rotate API key
agentspay agent rotate-key agt_abc123
  → new_api_key: ap_agent_yyyyy  (shown once)

# Revoke agent
agentspay agent revoke agt_abc123

# Enable agent self-registration
agentspay config set allow-agent-self-register true
```

### Wallets

```bash
# Create a wallet and fund it
agentspay wallet create \
  --agent agt_abc123 \
  --name "api-budget" \
  --amount 50 \
  --daily-limit 20 \
  --tx-limit 5

# List wallets
agentspay wallet list
agentspay wallet list --agent agt_abc123

# Check balance
agentspay wallet balance wal_xyz789

# Add funds
agentspay wallet fund wal_xyz789 --amount 25

# Freeze / unfreeze
agentspay wallet freeze wal_xyz789
agentspay wallet unfreeze wal_xyz789

# Approve a pending wallet (requested by agent)
agentspay wallet approve wal_pending123

# Close wallet (returns remaining funds)
agentspay wallet close wal_xyz789
```

### Transactions

```bash
# List all transactions
agentspay tx list

# Filter
agentspay tx list --agent agt_abc123 --type payment --from 2026-03-01

# Get details
agentspay tx info tx_def456
```

### Merchants

```bash
# Register as a merchant
agentspay merchant register --name "My AI Service" --category ai_tokens
  → merchant_id: mer_abc123
  → api_key: ap_merch_xxxxx
  → Complete onboarding: <stripe_url>

# Check merchant balance
agentspay merchant balance

# Withdraw
agentspay merchant withdraw
```

### Webhooks

```bash
# Add a webhook
agentspay webhook add --url https://myserver.com/webhooks --events transaction.completed,wallet.low_balance

# List webhooks
agentspay webhook list

# Remove
agentspay webhook remove whk_abc123
```

### Global Flags

```bash
--json          # Output as JSON (for scripting / piping)
--quiet         # Minimal output
--verbose       # Debug output
--api-url URL   # Override API base URL (for local dev)
```

### Config Storage
```
~/.agentspay/
  config.json        # { api_url, default_agent, default_wallet }
  credentials.json   # { token, refresh_token, master_key (encrypted) }
```

---

## 8. SDK Specification

### Package
```
npm install @agentspay/sdk
```

### Core Client

```typescript
import { AgentsPay } from '@agentspay/sdk';

// Initialize as an agent
const ap = new AgentsPay({
  agentKey: process.env.AGENTSPAY_AGENT_KEY,
});

// Initialize as a user (for programmatic management)
const apAdmin = new AgentsPay({
  masterKey: process.env.AGENTSPAY_MASTER_KEY,
});
```

### Agent Operations

```typescript
// ── Check balance ──
const balance = await ap.wallets.getBalance();
// → { wallet_id: "wal_abc", balance: 45.00, daily_remaining: 15.00 }

const specificWallet = await ap.wallets.getBalance("wal_xyz789");

// ── Pay a merchant ──
const payment = await ap.pay({
  merchantId: "mer_openai",
  amount: 5.00,
  description: "GPT-4 API tokens - 50k",
  idempotencyKey: `task-${taskId}-pay`,
});
// → { transaction_id: "tx_def456", status: "completed", wallet_balance_after: 40.00 }

// ── Transfer to another agent ──
const transfer = await ap.transfer({
  toAgent: "AGT-87654321",
  amount: 10.00,
  reason: "Payment for image generation sub-task",
  idempotencyKey: `task-${taskId}-transfer`,
});

// ── List transactions ──
const txs = await ap.transactions.list({ limit: 10, type: "payment" });

// ── Look up an agent ──
const agent = await ap.agents.lookup("AGT-87654321");
// → { name: "image-gen-bot", account_number: "AGT-87654321", accepts_transfers: true }

// ── List available merchants ──
const merchants = await ap.merchants.list({ category: "ai_tokens" });

// ── Request a new wallet (triggers approval from user) ──
const walletRequest = await ap.wallets.request({
  name: "extra-budget",
  amount: 100,
  reason: "Need additional funds for large research task",
});
// → { wallet_id: "wal_pending123", status: "pending_approval" }
```

### User/Admin Operations

```typescript
const apAdmin = new AgentsPay({ masterKey: "ap_master_xxxxx" });

// ── Create an agent ──
const agent = await apAdmin.agents.create({
  name: "research-bot",
  description: "Autonomous research agent",
});
// → { agent_id, account_number, api_key }

// ── Create and fund a wallet ──
const wallet = await apAdmin.wallets.create({
  agentId: agent.agent_id,
  name: "research-budget",
  fundingAmount: 50,
  dailyLimit: 20,
  limitPerTx: 5,
});

// ── Check platform balance ──
const balance = await apAdmin.funding.getBalance();

// ── Deposit ──
const deposit = await apAdmin.funding.deposit({ amount: 100 });
// → { stripe_checkout_url: "..." }  // or process directly if payment method saved

// ── Approve a pending wallet ──
await apAdmin.wallets.approve("wal_pending123");

// ── Freeze a wallet ──
await apAdmin.wallets.freeze("wal_abc123");

// ── List all transactions across all agents ──
const txs = await apAdmin.transactions.list({ from: "2026-03-01" });
```

### Framework Integration Examples

#### With LangChain
```typescript
import { AgentsPay } from '@agentspay/sdk';
import { tool } from '@langchain/core/tools';

const ap = new AgentsPay({ agentKey: process.env.AGENTSPAY_AGENT_KEY });

const payTool = tool(
  async ({ merchantId, amount, description }) => {
    const tx = await ap.pay({ merchantId, amount, description, idempotencyKey: crypto.randomUUID() });
    return `Paid $${tx.amount} to ${merchantId}. Balance: $${tx.wallet_balance_after}`;
  },
  {
    name: "pay_merchant",
    description: "Pay a merchant for services like API tokens or compute",
    schema: z.object({
      merchantId: z.string(),
      amount: z.number(),
      description: z.string(),
    }),
  }
);
```

#### With Vercel AI SDK
```typescript
import { AgentsPay } from '@agentspay/sdk';
import { tool } from 'ai';

const ap = new AgentsPay({ agentKey: process.env.AGENTSPAY_AGENT_KEY });

const tools = {
  payMerchant: tool({
    description: 'Pay a merchant for API tokens, compute, or services',
    parameters: z.object({
      merchantId: z.string(),
      amount: z.number(),
      description: z.string(),
    }),
    execute: async ({ merchantId, amount, description }) => {
      return ap.pay({ merchantId, amount, description, idempotencyKey: crypto.randomUUID() });
    },
  }),
};
```

#### With CrewAI
```python
# Python wrapper would be separate: pip install agentspay
from agentspay import AgentsPay
from crewai.tools import tool

ap = AgentsPay(agent_key=os.environ["AGENTSPAY_AGENT_KEY"])

@tool("Pay for a service via AgentsPay")
def pay_merchant(merchant_id: str, amount: float, description: str) -> str:
    tx = ap.pay(merchant_id=merchant_id, amount=amount, description=description)
    return f"Paid ${tx.amount}. Balance: ${tx.wallet_balance_after}"
```

---

## 9. Stripe Integration

### What We Use

| Stripe Product | Purpose | Phase |
|---------------|---------|-------|
| **Payments** | User deposits (card + ACH) | Phase 1 |
| **Customers** | Track users for saved payment methods | Phase 1 |
| **Connect (Express)** | Merchant onboarding + payouts | Phase 2 |
| **Checkout** | Hosted deposit page (via CLI link) | Phase 1 |
| **Webhooks** | Payment confirmations, payout status | Phase 1 |

### Internal Ledger Model (Phase 1)
We do NOT use Stripe to move money between agents or from agents to merchants on our platform. Instead:

1. **Deposits**: User pays via Stripe → funds land in our Stripe account → we credit their `platformBalance` in our DB
2. **Agent payments**: Pure database operations. Debit agent wallet, credit merchant balance. No Stripe call.
3. **Merchant payouts**: When merchant requests withdrawal, we use Stripe Connect to transfer from our account to theirs.
4. **Agent transfers**: Pure database operations. Debit wallet A, credit wallet B.

This means most transactions are **instant** (just DB writes) with no Stripe latency.

### Stripe Webhook Handling
```
payment_intent.succeeded     → Credit user.platformBalance
checkout.session.completed   → Credit user.platformBalance (for hosted checkout)
account.updated              → Update merchant onboarding status
payout.paid                  → Log successful merchant payout
payout.failed                → Alert merchant, retry
```

### Future: Stripe Issuing (Phase 5+)
Each agent wallet gets a virtual card. Agents can pay **anywhere** that accepts cards — not just AgentsPay merchants. This would be a massive expansion of capabilities but requires Stripe Issuing approval.

---

## 10. Agent-to-Agent Protocol

### Account Numbers
Every agent gets a unique public identifier: `AGT-XXXXXXXX` (8 alphanumeric characters, generated at creation).

This is the "phone number" of the agent economy. You give your agent's account number to other agents, and they can send you money.

### Discovery
```
GET /v1/agents/lookup?account=AGT-12345678
→ { name, account_number, accepts_transfers, category }
```

No private information is exposed. Just enough to verify you're sending to the right agent.

### Transfer Flow
```
Agent A: "I need Agent B to do image generation for me"

1. Agent A calls: agentspay_lookup_agent("AGT-87654321")
   → Confirms: "image-gen-bot", accepts transfers

2. Agent A calls: agentspay_transfer(to_agent="AGT-87654321", amount=10, reason="Generate 5 product images")
   → Server validates A's wallet balance and limits
   → Server debits A's wallet
   → Server credits B's default wallet (or creates one)
   → Returns receipt to both agents

3. Agent B sees incoming transfer via:
   → Webhook to B's owner
   → B checks agentspay_list_transactions(type="transfer")
   → B sees: "Received $10 from AGT-12345678: Generate 5 product images"

4. Agent B does the work, uses $3 of the $10 to pay for compute
   → agentspay_pay(merchant_id="mer_gpu_cloud", amount=3, description="GPU hours")

5. Agent B delivers the images (via separate channel — not AgentsPay's concern)
```

### Escrow (Future)
For trustless agent-to-agent transactions:
```
POST /v1/escrow/create
  { from_wallet, to_agent, amount, conditions, timeout }
  → Funds locked until conditions met or timeout
```
This is Phase 5+.

---

## 11. Security

### API Key Format
```
ap_master_xxxxxxxxxxxxxxxx    User master keys
ap_agent_xxxxxxxxxxxxxxxx     Agent keys
ap_merch_xxxxxxxxxxxxxxxx     Merchant keys
```

Prefixes allow quick identification. Keys are 32+ random characters after the prefix.

### Key Storage
- Keys are hashed with SHA-256 before database storage
- Only the hash is stored — raw key is shown ONCE at creation
- Prefix is stored separately for identification

### Authentication Flow
1. Request arrives with key in header
2. Extract prefix to determine key type
3. Hash the provided key with SHA-256
4. Look up hash in database
5. If found and not revoked → authenticated
6. Log the access in audit log

### Rate Limiting (Redis)
```
Sliding window per API key:

Master key:     120 req/min
Agent key:       60 req/min
Merchant key:    60 req/min
Pay endpoint:    30 req/min per agent
Transfer endpoint: 20 req/min per agent
Auth endpoints:   10 req/min per IP
```

### Transaction Safety
- **Idempotency keys** required on all pay/transfer operations
- **Pessimistic locking** on wallet balance (`SELECT ... FOR UPDATE`)
- **Double-entry bookkeeping**: every debit has a corresponding credit
- **Atomic transactions**: payment + balance update in single DB transaction
- **Audit log**: immutable, append-only log of every action

### Wallet Limits (Defense in Depth)
```
Per-transaction limit  → hard cap per single payment
Daily limit            → rolling 24h spend cap
Monthly limit          → rolling 30d spend cap
Allowed merchants      → whitelist of specific merchant IDs
Transfer controls      → separate in/out toggle
Expiration             → wallet auto-freezes after date
```

An agent cannot circumvent these. The server enforces them before processing any transaction.

---

## 12. Development Phases

### Phase 1: Core Infrastructure (Weeks 1-3)
**Goal**: Developer can register via CLI, deposit funds, create agents with wallets.

```
[ ] Monorepo scaffold (Turborepo: api, cli, sdk, mcp, shared)
[ ] PostgreSQL + Prisma — all models
[ ] API server scaffold (Express + TypeScript + Zod)
[ ] Auth: register, login, JWT, API key generation
[ ] User model + master API key management
[ ] Agent CRUD + API key generation + account numbers
[ ] Wallet CRUD + balance management + spending limits
[ ] Funding: Stripe Checkout integration for deposits
[ ] CLI: register, login, balance, agent create, wallet create
[ ] Rate limiting middleware (Redis)
[ ] Audit logging middleware
[ ] Error handling + standard error responses
[ ] Tests: auth, agents, wallets
```

### Phase 2: Payments (Weeks 4-6)
**Goal**: Agents can pay merchants. Merchants onboard and withdraw.

```
[ ] Merchant registration + Stripe Connect onboarding
[ ] POST /transactions/pay — full flow with limit enforcement
[ ] Spending limit engine (per-tx, daily, monthly, category)
[ ] Idempotency key handling
[ ] Webhook system (outgoing — HMAC signed)
[ ] Merchant payout via Stripe Connect
[ ] CLI: merchant commands, tx list, webhook management
[ ] SDK: ap.pay(), ap.wallets.getBalance()
[ ] Tests: payment flow, limit enforcement, idempotency
```

### Phase 3: Transfers + MCP (Weeks 7-9)
**Goal**: Agent-to-agent transfers work. MCP server live.

```
[ ] Agent lookup endpoint
[ ] POST /transactions/transfer — agent-to-agent
[ ] Agent self-registration flow
[ ] Wallet approval flow (pending → approve via CLI)
[ ] MCP server: all tools (pay, transfer, balance, lookup, list merchants)
[ ] MCP: stdio + SSE transport
[ ] SDK: ap.transfer(), ap.agents.lookup(), ap.wallets.request()
[ ] CLI: wallet approve/reject commands
[ ] Tests: transfers, MCP tools, self-registration
```

### Phase 4: Production Hardening (Weeks 10-12)
**Goal**: Production-ready. Secure. Documented.

```
[ ] API documentation (OpenAPI spec, auto-generated)
[ ] SDK documentation + examples for LangChain, CrewAI, Vercel AI
[ ] MCP server documentation + example configs
[ ] CLI help text + man pages
[ ] Load testing (k6 or similar)
[ ] Security audit (key handling, SQL injection, rate limits)
[ ] Monitoring: health checks, error tracking (Sentry), uptime
[ ] CI/CD pipeline
[ ] Publish: SDK to npm, CLI to npm, MCP server to npm
[ ] Landing page (simple — what it is, install command, docs link)
[ ] Beta launch
```

### Phase 5: Growth (Post-Launch)
```
[ ] Python SDK (for CrewAI, LangChain Python)
[ ] Stripe Issuing integration (virtual cards per wallet)
[ ] Escrow for trustless agent-to-agent deals
[ ] Merchant directory / marketplace
[ ] Agent spending analytics (exposed via API, not UI)
[ ] Multi-currency support
[ ] Agent reputation scores
[ ] Batch payments (agent pays multiple merchants in one call)
```

---

## 13. Project Structure

```
agentspay/
├── apps/
│   ├── api/                          # Express API server
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point
│   │   │   ├── app.ts                # Express app setup
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── agent.routes.ts
│   │   │   │   ├── wallet.routes.ts
│   │   │   │   ├── transaction.routes.ts
│   │   │   │   ├── funding.routes.ts
│   │   │   │   ├── merchant.routes.ts
│   │   │   │   └── webhook.routes.ts
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── agent.service.ts
│   │   │   │   ├── wallet.service.ts
│   │   │   │   ├── transaction.service.ts
│   │   │   │   ├── funding.service.ts
│   │   │   │   ├── merchant.service.ts
│   │   │   │   ├── webhook.service.ts
│   │   │   │   └── stripe.service.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts      # JWT + API key validation
│   │   │   │   ├── rateLimit.middleware.ts  # Redis sliding window
│   │   │   │   ├── audit.middleware.ts      # Log every request
│   │   │   │   └── error.middleware.ts      # Global error handler
│   │   │   ├── validators/
│   │   │   │   ├── auth.schema.ts
│   │   │   │   ├── agent.schema.ts
│   │   │   │   ├── wallet.schema.ts
│   │   │   │   └── transaction.schema.ts
│   │   │   └── utils/
│   │   │       ├── apiKey.ts               # Generate, hash, verify
│   │   │       ├── accountNumber.ts        # Generate AGT-XXXXXXXX
│   │   │       ├── idempotency.ts          # Idempotency key handling
│   │   │       └── errors.ts              # Custom error classes
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── tests/
│   │   │   ├── auth.test.ts
│   │   │   ├── agent.test.ts
│   │   │   ├── wallet.test.ts
│   │   │   ├── transaction.test.ts
│   │   │   └── helpers/
│   │   │       └── setup.ts               # Test DB, seed data
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── cli/                               # @agentspay/cli
│   │   ├── src/
│   │   │   ├── index.ts                   # Entry point (#!/usr/bin/env node)
│   │   │   ├── commands/
│   │   │   │   ├── register.ts
│   │   │   │   ├── login.ts
│   │   │   │   ├── balance.ts
│   │   │   │   ├── deposit.ts
│   │   │   │   ├── agent.ts               # create, list, info, rotate-key, revoke
│   │   │   │   ├── wallet.ts              # create, list, balance, fund, freeze, approve
│   │   │   │   ├── tx.ts                  # list, info
│   │   │   │   ├── merchant.ts            # register, balance, withdraw
│   │   │   │   ├── webhook.ts             # add, list, remove
│   │   │   │   └── config.ts              # set, get
│   │   │   ├── lib/
│   │   │   │   ├── client.ts              # HTTP client (wraps SDK)
│   │   │   │   ├── auth.ts                # Token storage + refresh
│   │   │   │   ├── config.ts              # Read/write ~/.agentspay/
│   │   │   │   └── output.ts              # Table + JSON formatters
│   │   │   └── utils/
│   │   │       └── prompt.ts              # Interactive prompts (inquirer)
│   │   ├── bin/
│   │   │   └── agentspay.js
│   │   └── package.json
│   │
│   └── mcp/                               # @agentspay/mcp
│       ├── src/
│       │   ├── index.ts                   # Entry point
│       │   ├── server.ts                  # MCP server setup (stdio + SSE)
│       │   ├── tools/
│       │   │   ├── getBalance.ts
│       │   │   ├── pay.ts
│       │   │   ├── transfer.ts
│       │   │   ├── listTransactions.ts
│       │   │   ├── lookupAgent.ts
│       │   │   ├── listMerchants.ts
│       │   │   └── requestWallet.ts
│       │   ├── resources/
│       │   │   ├── wallet.ts
│       │   │   ├── transactions.ts
│       │   │   └── agent.ts
│       │   └── lib/
│       │       └── client.ts              # Uses @agentspay/sdk internally
│       └── package.json
│
├── packages/
│   ├── sdk/                               # @agentspay/sdk
│   │   ├── src/
│   │   │   ├── index.ts                   # Export AgentsPay class
│   │   │   ├── client.ts                  # HTTP client with auth, retries, error handling
│   │   │   ├── resources/
│   │   │   │   ├── agents.ts
│   │   │   │   ├── wallets.ts
│   │   │   │   ├── transactions.ts
│   │   │   │   ├── funding.ts
│   │   │   │   └── merchants.ts
│   │   │   ├── types.ts                   # All TypeScript types/interfaces
│   │   │   └── errors.ts                  # SDK error classes
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── shared/                            # @agentspay/shared
│   │   ├── src/
│   │   │   ├── types.ts                   # Shared types (API request/response)
│   │   │   ├── constants.ts               # Limits, prefixes, etc.
│   │   │   └── validation.ts              # Shared Zod schemas
│   │   └── package.json
│   │
│   └── tsconfig/                          # Shared TypeScript configs
│       ├── base.json
│       ├── node.json
│       └── package.json
│
├── docs/                                  # Documentation (markdown)
│   ├── quickstart.md
│   ├── cli-reference.md
│   ├── sdk-reference.md
│   ├── mcp-setup.md
│   ├── api-reference.md
│   └── examples/
│       ├── langchain-agent.md
│       ├── crewai-agent.md
│       └── claude-mcp.md
│
├── turbo.json
├── package.json
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/agentspay
REDIS_URL=redis://host:6379

# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Auth
JWT_SECRET=xxx
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# API
API_URL=https://api.agentspay.com
PORT=3000
NODE_ENV=production

# Email (for notifications)
RESEND_API_KEY=xxx
FROM_EMAIL=noreply@agentspay.com
```

### Deployment

| Component | Where | Published As |
|-----------|-------|-------------|
| API | Railway / Render | Self-hosted |
| Database | Neon | Managed Postgres |
| Redis | Upstash | Serverless Redis |
| CLI | npm | `@agentspay/cli` |
| SDK | npm | `@agentspay/sdk` |
| MCP Server | npm | `@agentspay/mcp` |
| Docs | GitHub Pages / Mintlify | docs.agentspay.com |

---

## Appendix: Quick Start Example

### Developer Setup (2 minutes)
```bash
npm install -g @agentspay/cli

agentspay register
# → Enter email, password
# → Master key: ap_master_xxxxx (save this!)

agentspay deposit --amount 50
# → Opens Stripe checkout → pay → balance: $50

agentspay agent create --name "my-agent"
# → agent_id: agt_abc123
# → account:  AGT-12345678
# → api_key:  ap_agent_xxxxx

agentspay wallet create --agent agt_abc123 --name "main" --amount 25 --daily-limit 10
# → wallet_id: wal_xyz789, balance: $25
```

### Agent Integration (30 seconds)
```bash
# Add to your agent's MCP config:
{
  "mcpServers": {
    "agentspay": {
      "command": "npx",
      "args": ["@agentspay/mcp"],
      "env": { "AGENTSPAY_AGENT_KEY": "ap_agent_xxxxx" }
    }
  }
}
```

Now your agent can say: *"I need to pay for GPT-4 tokens"* and it will call `agentspay_pay` automatically.

### Or via SDK
```typescript
import { AgentsPay } from '@agentspay/sdk';

const ap = new AgentsPay({ agentKey: 'ap_agent_xxxxx' });

// Your agent pays for something
await ap.pay({
  merchantId: 'mer_openai',
  amount: 2.50,
  description: 'API tokens for research task',
  idempotencyKey: crypto.randomUUID(),
});
```

---

*AgentsPay: Let agents pay.*
