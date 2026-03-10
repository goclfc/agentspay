import { Command } from 'commander';
import { getClient } from '../lib/client';
import { outputResult, outputTable, handleError } from '../lib/output';

export const agentCommand = new Command('agent').description('Manage agents');

agentCommand
  .command('create')
  .description('Create a new agent')
  .requiredOption('--name <name>', 'Agent name')
  .option('--description <desc>', 'Agent description')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.agents.create({
        name: opts.name,
        description: opts.description,
      });
      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log('Agent created!');
        console.log(`Agent ID:        ${result.agent_id}`);
        console.log(`Account Number:  ${result.account_number}`);
        console.log(`API Key:         ${result.api_key}`);
      }
    } catch (err) { handleError(err); }
  });

agentCommand
  .command('list')
  .description('List all agents')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.agents.list();
      if (opts.json) {
        outputResult(result, true);
      } else {
        const agents = result.data || result;
        if (!Array.isArray(agents) || agents.length === 0) {
          console.log('No agents found.');
          return;
        }
        outputTable(
          ['Agent ID', 'Name', 'Account #', 'Status', 'Wallets', 'Balance'],
          agents.map((a: any) => [
            a.agent_id, a.name, a.account_number, a.status,
            String(a.wallet_count || 0), a.total_balance || '0',
          ]),
        );
      }
    } catch (err) { handleError(err); }
  });

agentCommand
  .command('get <agentId>')
  .description('Get agent details')
  .option('--json', 'Output as JSON')
  .action(async (agentId, opts) => {
    try {
      const client = getClient();
      const result = await client.admin.agents.get(agentId);
      outputResult(result, opts.json);
    } catch (err) { handleError(err); }
  });

agentCommand
  .command('revoke <agentId>')
  .description('Revoke an agent')
  .action(async (agentId) => {
    try {
      const client = getClient();
      await client.admin.agents.revoke(agentId);
      console.log(`Agent ${agentId} revoked.`);
    } catch (err) { handleError(err); }
  });

agentCommand
  .command('rotate-key <agentId>')
  .description('Rotate agent API key')
  .option('--json', 'Output as JSON')
  .action(async (agentId, opts) => {
    try {
      const client = getClient();
      const result = await client.admin.agents.rotateKey(agentId);
      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log(`New API Key: ${result.api_key}`);
      }
    } catch (err) { handleError(err); }
  });

agentCommand
  .command('lookup <account>')
  .description('Look up agent by account number')
  .option('--json', 'Output as JSON')
  .action(async (account, opts) => {
    try {
      const client = getClient();
      const result = await client.agents.lookup(account);
      outputResult(result, opts.json);
    } catch (err) { handleError(err); }
  });
