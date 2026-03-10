import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AgentsPay } from '@usectl/sdk';

export function registerTools(server: Server, ap: AgentsPay) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'agentspay_get_balance',
        description: 'Check the balance of your AgentsPay wallet. Returns available funds.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            wallet_id: {
              type: 'string',
              description: 'Wallet ID. Omit to get default wallet balance.',
            },
          },
        },
      },
      {
        name: 'agentspay_pay',
        description: 'Pay a merchant from your wallet. Use this when you need to purchase API tokens, compute, services, or any other paid resource.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            merchant_id: { type: 'string', description: "The merchant's ID on AgentsPay" },
            amount: { type: 'number', description: 'Amount to pay in USD' },
            description: { type: 'string', description: 'What is this payment for' },
            wallet_id: { type: 'string', description: 'Which wallet to pay from. Omit for default wallet.' },
          },
          required: ['merchant_id', 'amount', 'description'],
        },
      },
      {
        name: 'agentspay_transfer',
        description: 'Transfer funds to another agent on AgentsPay. Use this to pay another AI agent for work, sub-tasks, or services.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            to_agent: { type: 'string', description: "Recipient agent's account number (AGT-XXXXXXXX) or agent ID" },
            amount: { type: 'number', description: 'Amount to transfer in USD' },
            reason: { type: 'string', description: 'Why are you transferring this money' },
            wallet_id: { type: 'string', description: 'Which wallet to transfer from. Omit for default wallet.' },
          },
          required: ['to_agent', 'amount', 'reason'],
        },
      },
      {
        name: 'agentspay_list_transactions',
        description: 'View your recent transactions. Returns payment and transfer history.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            limit: { type: 'number', description: 'Number of transactions to return (default 10, max 50)' },
            type: { type: 'string', enum: ['payment', 'transfer', 'all'], description: 'Filter by transaction type' },
          },
        },
      },
      {
        name: 'agentspay_lookup_agent',
        description: 'Look up an agent by their account number to verify their identity before transferring funds.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            account_number: { type: 'string', description: 'Agent account number (AGT-XXXXXXXX)' },
          },
          required: ['account_number'],
        },
      },
      {
        name: 'agentspay_list_merchants',
        description: 'List merchants that accept payments via AgentsPay. Use this to find services you can pay for.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            category: { type: 'string', description: 'Filter by category: ai_tokens, compute, saas, data, other' },
            search: { type: 'string', description: 'Search merchants by name' },
          },
        },
      },
      {
        name: 'agentspay_request_wallet',
        description: 'Request a new wallet with a specific budget. Your owner will need to approve this request.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            name: { type: 'string', description: "Name for this wallet (e.g., 'research-budget', 'api-tokens')" },
            requested_amount: { type: 'number', description: "How much funding you're requesting in USD" },
            reason: { type: 'string', description: 'Why you need this wallet' },
          },
          required: ['name', 'requested_amount', 'reason'],
        },
      },
      {
        name: 'agentspay_get_card',
        description: 'Get your virtual card details (card number, CVC, expiry) to make online purchases. Use this when you need to pay for something on a website that accepts Visa/Mastercard.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            wallet_id: { type: 'string', description: 'The wallet ID whose card details you need' },
          },
          required: ['wallet_id'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'agentspay_get_balance': {
          const result = await ap.wallets.getBalance(args?.wallet_id as string | undefined);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'agentspay_pay': {
          const result = await ap.pay({
            merchantId: args!.merchant_id as string,
            amount: args!.amount as number,
            description: args?.description as string | undefined,
            walletId: args?.wallet_id as string | undefined,
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'agentspay_transfer': {
          const result = await ap.transfer({
            toAgent: args!.to_agent as string,
            amount: args!.amount as number,
            reason: args?.reason as string | undefined,
            walletId: args?.wallet_id as string | undefined,
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'agentspay_list_transactions': {
          const type = args?.type as string | undefined;
          const result = await ap.transactions.list({
            limit: (args?.limit as number) || 10,
            type: type === 'all' ? undefined : type?.toUpperCase(),
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'agentspay_lookup_agent': {
          const result = await ap.agents.lookup(args!.account_number as string);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'agentspay_list_merchants': {
          const result = await ap.merchants.list({
            category: args?.category as string | undefined,
            search: args?.search as string | undefined,
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'agentspay_request_wallet': {
          const result = await ap.wallets.request({
            name: args!.name as string,
            amount: args!.requested_amount as number,
            reason: args?.reason as string | undefined,
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'agentspay_get_card': {
          const result = await ap.cards.getDetails(args!.wallet_id as string);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message || 'Unknown error'}` }],
        isError: true,
      };
    }
  });
}
