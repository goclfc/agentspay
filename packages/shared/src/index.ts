import { z } from 'zod';

// ──────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────

export const API_VERSION = 'v1';

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

export const PLATFORM_FEE_PERCENT = 1.5;

export const WEBHOOK_EVENT_TYPES = [
  'transaction.completed',
  'transaction.failed',
  'transfer.completed',
  'wallet.approval_requested',
  'wallet.funded',
  'wallet.low_balance',
  'wallet.frozen',
  'wallet.expired',
  'agent.created',
  'agent.revoked',
  'merchant.payment_received',
  'card.authorization.approved',
  'card.authorization.declined',
  'card.created',
] as const;

// ──────────────────────────────────────
// ENUMS
// ──────────────────────────────────────

export type UserTier = 'FREE' | 'PRO';
export type AgentStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type WalletStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CLOSED';
export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type TxType = 'PAYMENT' | 'TRANSFER' | 'FUND' | 'WITHDRAW' | 'REFUND' | 'CARD_PAYMENT';
export type TxStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type FundingDirection = 'IN' | 'OUT';
export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

// ──────────────────────────────────────
// ZOD SCHEMAS — Auth
// ──────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export const createApiKeySchema = z.object({
  label: z.string().max(64).optional(),
});

// ──────────────────────────────────────
// ZOD SCHEMAS — Agents
// ──────────────────────────────────────

export const createAgentSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const selfRegisterAgentSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  capabilities: z.array(z.string()).optional(),
});

export const agentLookupSchema = z.object({
  account: z.string().regex(/^AGT-[A-Z0-9]{8}$/),
});

// ──────────────────────────────────────
// ZOD SCHEMAS — Wallets
// ──────────────────────────────────────

export const createWalletSchema = z.object({
  agent_id: z.string().min(1),
  name: z.string().min(1).max(128),
  funding_amount: z.number().positive().optional(),
  requested_amount: z.number().positive().optional(),
  limit_per_tx: z.number().positive().optional(),
  daily_limit: z.number().positive().optional(),
  monthly_limit: z.number().positive().optional(),
  allowed_merchants: z.array(z.string()).optional(),
  expires_at: z.string().datetime().optional(),
});

export const fundWalletSchema = z.object({
  amount: z.number().positive(),
});

// ──────────────────────────────────────
// ZOD SCHEMAS — Transactions
// ──────────────────────────────────────

export const paySchema = z.object({
  wallet_id: z.string().min(1),
  merchant_id: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().max(512).optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotency_key: z.string().min(1).max(128),
});

export const transferSchema = z.object({
  from_wallet_id: z.string().min(1),
  to_agent_account: z.string().regex(/^AGT-[A-Z0-9]{8}$/),
  amount: z.number().positive(),
  reason: z.string().max(512).optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotency_key: z.string().min(1).max(128),
});

export const listTransactionsSchema = z.object({
  wallet_id: z.string().optional(),
  type: z.enum(['PAYMENT', 'TRANSFER', 'FUND', 'WITHDRAW', 'REFUND', 'CARD_PAYMENT']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// ──────────────────────────────────────
// ZOD SCHEMAS — Funding
// ──────────────────────────────────────

export const depositSchema = z.object({
  amount: z.number().positive(),
  payment_method_id: z.string().optional(),
});

export const withdrawSchema = z.object({
  amount: z.number().positive(),
});

export const addPaymentMethodSchema = z.object({
  type: z.enum(['card', 'bank_account']),
  stripe_token: z.string().min(1),
});

// ──────────────────────────────────────
// ZOD SCHEMAS — Merchants
// ──────────────────────────────────────

export const registerMerchantSchema = z.object({
  name: z.string().min(1).max(128),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  category: z.string().max(64).optional(),
});

export const merchantWithdrawSchema = z.object({
  amount: z.number().positive().optional(),
});

// ──────────────────────────────────────
// ZOD SCHEMAS — Webhooks
// ──────────────────────────────────────

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES as unknown as [string, ...string[]])).min(1),
});

// ──────────────────────────────────────
// RESPONSE TYPES
// ──────────────────────────────────────

export interface RegisterResponse {
  user_id: string;
  master_api_key: string;
}

export interface LoginResponse {
  token: string;
  refresh_token: string;
  expires_in: number;
}

export interface UserProfile {
  user_id: string;
  email: string;
  platform_balance: string;
  tier: UserTier;
  created_at: string;
}

export interface CreateApiKeyResponse {
  key_id: string;
  api_key: string;
  prefix: string;
}

export interface CreateAgentResponse {
  agent_id: string;
  account_number: string;
  api_key: string;
}

export interface AgentListItem {
  agent_id: string;
  name: string;
  account_number: string;
  status: AgentStatus;
  wallet_count: number;
  total_balance: string;
  last_active_at: string | null;
}

export interface AgentDetail {
  agent_id: string;
  name: string;
  account_number: string;
  status: AgentStatus;
  description: string | null;
  metadata: Record<string, unknown> | null;
  wallets: WalletListItem[];
  created_at: string;
}

export interface AgentPublicInfo {
  agent_id: string;
  name: string;
  account_number: string;
  accepts_transfers: boolean;
}

export interface WalletListItem {
  wallet_id: string;
  name: string;
  balance: string;
  status: WalletStatus;
  limits: WalletLimits;
  agent_id: string;
}

export interface WalletDetail {
  wallet_id: string;
  name: string;
  balance: string;
  status: WalletStatus;
  limits: WalletLimits;
  spend_today: string;
  spend_this_month: string;
}

export interface WalletLimits {
  limit_per_tx: string | null;
  daily_limit: string | null;
  monthly_limit: string | null;
  allowed_merchants: string[];
}

export interface FundWalletResponse {
  wallet_id: string;
  new_balance: string;
  transaction_id: string;
}

export interface PayResponse {
  transaction_id: string;
  status: 'completed';
  amount: string;
  fee: string;
  wallet_balance_after: string;
  created_at: string;
}

export interface TransferResponse {
  transaction_id: string;
  status: 'completed';
  amount: string;
  fee: string;
  wallet_balance_after: string;
  recipient_agent: { account_number: string; name: string };
  created_at: string;
}

export interface TransactionListItem {
  transaction_id: string;
  type: TxType;
  status: TxStatus;
  amount: string;
  fee: string;
  description: string | null;
  wallet_id: string;
  merchant_id: string | null;
  sender_agent_id: string | null;
  receiver_agent_id: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  has_more: boolean;
}

export interface FundingDepositResponse {
  funding_id: string;
  amount: string;
  status: TxStatus;
  stripe_client_secret?: string;
  checkout_url?: string;
}

export interface FundingWithdrawResponse {
  funding_id: string;
  amount: string;
  status: TxStatus;
  estimated_arrival: string;
}

export interface FundingBalance {
  available: string;
  pending: string;
}

export interface PaymentMethodItem {
  payment_method_id: string;
  type: string;
  last4: string;
  default: boolean;
}

export interface MerchantRegisterResponse {
  merchant_id: string;
  api_key: string;
  onboarding_url: string;
}

export interface MerchantProfile {
  merchant_id: string;
  name: string;
  balance: string;
  status: MerchantStatus;
  onboarding_complete: boolean;
}

export interface MerchantBalance {
  available: string;
  pending: string;
}

export interface MerchantWithdrawResponse {
  payout_id: string;
  amount: string;
  estimated_arrival: string;
}

export interface WebhookEndpointResponse {
  webhook_id: string;
  url: string;
  secret: string;
  events: string[];
}

export interface WebhookEndpointListItem {
  webhook_id: string;
  url: string;
  events: string[];
  active: boolean;
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  created_at: string;
  data: Record<string, unknown>;
}

// ──────────────────────────────────────
// CARD RESPONSE TYPES
// ──────────────────────────────────────

export interface CardInfo {
  card_id: string;
  wallet_id: string;
  last4: string;
  brand: string;
  exp_month: number;
  exp_year: number;
  status: string;
}

export interface CardDetails extends CardInfo {
  number: string;
  cvc: string;
}

// ──────────────────────────────────────
// ERROR RESPONSE TYPE
// ──────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// ──────────────────────────────────────
// REQUEST TYPES (inferred from Zod)
// ──────────────────────────────────────

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;
export type CreateApiKeyRequest = z.infer<typeof createApiKeySchema>;
export type CreateAgentRequest = z.infer<typeof createAgentSchema>;
export type SelfRegisterAgentRequest = z.infer<typeof selfRegisterAgentSchema>;
export type CreateWalletRequest = z.infer<typeof createWalletSchema>;
export type FundWalletRequest = z.infer<typeof fundWalletSchema>;
export type PayRequest = z.infer<typeof paySchema>;
export type TransferRequest = z.infer<typeof transferSchema>;
export type ListTransactionsRequest = z.infer<typeof listTransactionsSchema>;
export type DepositRequest = z.infer<typeof depositSchema>;
export type WithdrawRequest = z.infer<typeof withdrawSchema>;
export type AddPaymentMethodRequest = z.infer<typeof addPaymentMethodSchema>;
export type RegisterMerchantRequest = z.infer<typeof registerMerchantSchema>;
export type MerchantWithdrawRequest = z.infer<typeof merchantWithdrawSchema>;
export type CreateWebhookRequest = z.infer<typeof createWebhookSchema>;
