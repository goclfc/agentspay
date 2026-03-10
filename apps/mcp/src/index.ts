#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgentsPay } from '@usectl/sdk';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';

const agentKey = process.env.AGENTSPAY_AGENT_KEY;
if (!agentKey) {
  console.error('AGENTSPAY_AGENT_KEY environment variable is required');
  process.exit(1);
}

const apiUrl = process.env.AGENTSPAY_API_URL || undefined;
const ap = new AgentsPay({ agentKey, apiUrl });

const server = new Server(
  { name: 'agentspay', version: '0.1.0' },
  { capabilities: { tools: {}, resources: {} } }
);

registerTools(server, ap);
registerResources(server, ap);

const transport = new StdioServerTransport();
await server.connect(transport);
