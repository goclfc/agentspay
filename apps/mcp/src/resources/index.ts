import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AgentsPay } from '@usectl/sdk';

export function registerResources(server: Server, ap: AgentsPay) {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'agentspay://transactions/recent',
        name: 'Recent Transactions',
        description: 'Last 10 transactions',
        mimeType: 'application/json',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      if (uri === 'agentspay://transactions/recent') {
        const result = await ap.transactions.list({ limit: 10 });
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          }],
        };
      }

      if (uri.startsWith('agentspay://wallet/')) {
        const walletId = uri.replace('agentspay://wallet/', '');
        const result = await ap.wallets.getBalance(walletId);
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          }],
        };
      }

      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: `Unknown resource: ${uri}`,
        }],
      };
    } catch (err: any) {
      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: `Error: ${err.message || 'Unknown error'}`,
        }],
      };
    }
  });
}
