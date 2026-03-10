import { HttpClient, SdkError } from './client';

export { SdkError } from './client';

const DEFAULT_API_URL = 'https://api.agentspay.com';

export interface PayOpts {
  merchantId: string;
  amount: number;
  description?: string;
  walletId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferOpts {
  toAgent: string;
  amount: number;
  reason?: string;
  walletId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface ListTxOpts {
  limit?: number;
  type?: string;
  from?: string;
  to?: string;
  walletId?: string;
  cursor?: string;
}

export interface RequestWalletOpts {
  name: string;
  amount?: number;
  reason?: string;
  dailyLimit?: number;
  monthlyLimit?: number;
  limitPerTx?: number;
}

export interface CreateAgentOpts {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateWalletOpts {
  agentId: string;
  name: string;
  fundingAmount?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  limitPerTx?: number;
  allowedMerchants?: string[];
  expiresAt?: string;
}

export class AgentsPay {
  private client: HttpClient;

  constructor(opts: { agentKey?: string; masterKey?: string; merchantKey?: string; apiUrl?: string }) {
    this.client = new HttpClient({
      baseUrl: opts.apiUrl || DEFAULT_API_URL,
      agentKey: opts.agentKey,
      masterKey: opts.masterKey,
      merchantKey: opts.merchantKey,
    });
  }

  // ── Agent-facing operations ──

  async pay(opts: PayOpts) {
    return this.client.post<any>('/v1/transactions/pay', {
      wallet_id: opts.walletId,
      merchant_id: opts.merchantId,
      amount: opts.amount,
      description: opts.description,
      metadata: opts.metadata,
      idempotency_key: opts.idempotencyKey || crypto.randomUUID(),
    });
  }

  async transfer(opts: TransferOpts) {
    return this.client.post<any>('/v1/transactions/transfer', {
      from_wallet_id: opts.walletId,
      to_agent_account: opts.toAgent,
      amount: opts.amount,
      reason: opts.reason,
      metadata: opts.metadata,
      idempotency_key: opts.idempotencyKey || crypto.randomUUID(),
    });
  }

  wallets = {
    getBalance: async (walletId?: string) => {
      if (walletId) {
        return this.client.get<any>(`/v1/wallets/${walletId}`);
      }
      const res = await this.client.get<any>('/v1/wallets');
      return res.data?.[0] || res;
    },

    list: async () => {
      return this.client.get<any>('/v1/wallets');
    },

    request: async (opts: RequestWalletOpts) => {
      return this.client.post<any>('/v1/wallets', {
        name: opts.name,
        requested_amount: opts.amount,
        daily_limit: opts.dailyLimit,
        monthly_limit: opts.monthlyLimit,
        limit_per_tx: opts.limitPerTx,
      });
    },
  };

  transactions = {
    list: async (opts?: ListTxOpts) => {
      return this.client.get<any>('/v1/transactions', {
        limit: opts?.limit,
        type: opts?.type,
        from: opts?.from,
        to: opts?.to,
        wallet_id: opts?.walletId,
        cursor: opts?.cursor,
      });
    },

    get: async (txId: string) => {
      return this.client.get<any>(`/v1/transactions/${txId}`);
    },
  };

  agents = {
    lookup: async (accountNumber: string) => {
      return this.client.get<any>('/v1/agents/lookup', { account: accountNumber });
    },
  };

  merchants = {
    list: async (opts?: { category?: string; search?: string }) => {
      return this.client.get<any>('/v1/merchants', {
        category: opts?.category,
        search: opts?.search,
      });
    },
  };

  // ── User/admin operations (require masterKey) ──

  admin = {
    agents: {
      create: async (opts: CreateAgentOpts) => {
        return this.client.post<any>('/v1/agents', {
          name: opts.name,
          description: opts.description,
          metadata: opts.metadata,
        });
      },

      list: async () => {
        return this.client.get<any>('/v1/agents');
      },

      get: async (agentId: string) => {
        return this.client.get<any>(`/v1/agents/${agentId}`);
      },

      revoke: async (agentId: string) => {
        return this.client.del<any>(`/v1/agents/${agentId}`);
      },

      rotateKey: async (agentId: string) => {
        return this.client.post<any>(`/v1/agents/${agentId}/rotate-key`);
      },
    },

    wallets: {
      create: async (opts: CreateWalletOpts) => {
        return this.client.post<any>('/v1/wallets', {
          agent_id: opts.agentId,
          name: opts.name,
          funding_amount: opts.fundingAmount,
          daily_limit: opts.dailyLimit,
          monthly_limit: opts.monthlyLimit,
          limit_per_tx: opts.limitPerTx,
          allowed_merchants: opts.allowedMerchants,
          expires_at: opts.expiresAt,
        });
      },

      fund: async (walletId: string, amount: number) => {
        return this.client.post<any>(`/v1/wallets/${walletId}/fund`, { amount });
      },

      freeze: async (walletId: string) => {
        return this.client.post<any>(`/v1/wallets/${walletId}/freeze`);
      },

      unfreeze: async (walletId: string) => {
        return this.client.post<any>(`/v1/wallets/${walletId}/unfreeze`);
      },

      approve: async (walletId: string, amount?: number) => {
        return this.client.post<any>(`/v1/wallets/${walletId}/approve`, amount ? { amount } : undefined);
      },

      reject: async (walletId: string) => {
        return this.client.post<any>(`/v1/wallets/${walletId}/reject`);
      },

      close: async (walletId: string) => {
        return this.client.del<any>(`/v1/wallets/${walletId}`);
      },

      list: async (agentId?: string) => {
        return this.client.get<any>('/v1/wallets', { agent_id: agentId });
      },
    },

    funding: {
      getBalance: async () => {
        return this.client.get<any>('/v1/funding/balance');
      },

      deposit: async (amount: number) => {
        return this.client.post<any>('/v1/funding/deposit', { amount });
      },

      withdraw: async (amount: number) => {
        return this.client.post<any>('/v1/funding/withdraw', { amount });
      },
    },

    transactions: {
      list: async (opts?: ListTxOpts) => {
        return this.client.get<any>('/v1/transactions', {
          limit: opts?.limit,
          type: opts?.type,
          from: opts?.from,
          to: opts?.to,
          wallet_id: opts?.walletId,
          cursor: opts?.cursor,
        });
      },
    },

    auth: {
      register: async (email: string, password: string) => {
        return this.client.post<any>('/v1/auth/register', { email, password });
      },

      login: async (email: string, password: string) => {
        return this.client.post<any>('/v1/auth/login', { email, password });
      },

      me: async () => {
        return this.client.get<any>('/v1/auth/me');
      },
    },

    webhooks: {
      create: async (url: string, events: string[]) => {
        return this.client.post<any>('/v1/webhooks', { url, events });
      },

      list: async () => {
        return this.client.get<any>('/v1/webhooks');
      },

      delete: async (webhookId: string) => {
        return this.client.del<any>(`/v1/webhooks/${webhookId}`);
      },
    },
  };
}
