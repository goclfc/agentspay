import { Command } from 'commander';
import { getClient } from '../lib/client';
import { outputResult, outputTable, handleError } from '../lib/output';

export const walletCommand = new Command('wallet').description('Manage wallets');

walletCommand
  .command('create')
  .description('Create a new wallet')
  .requiredOption('--agent-id <agentId>', 'Agent ID')
  .requiredOption('--name <name>', 'Wallet name')
  .option('--funding <amount>', 'Initial funding amount', parseFloat)
  .option('--daily-limit <amount>', 'Daily spending limit', parseFloat)
  .option('--monthly-limit <amount>', 'Monthly spending limit', parseFloat)
  .option('--limit-per-tx <amount>', 'Per-transaction limit', parseFloat)
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.wallets.create({
        agentId: opts.agentId,
        name: opts.name,
        fundingAmount: opts.funding,
        dailyLimit: opts.dailyLimit,
        monthlyLimit: opts.monthlyLimit,
        limitPerTx: opts.limitPerTx,
      });
      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log('Wallet created!');
        outputResult(result, false);
      }
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('list')
  .description('List wallets')
  .option('--agent-id <agentId>', 'Filter by agent')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.wallets.list(opts.agentId);
      if (opts.json) {
        outputResult(result, true);
      } else {
        const wallets = result.data || result;
        if (!Array.isArray(wallets) || wallets.length === 0) {
          console.log('No wallets found.');
          return;
        }
        outputTable(
          ['Wallet ID', 'Name', 'Balance', 'Status', 'Agent ID'],
          wallets.map((w: any) => [
            w.wallet_id, w.name, w.balance, w.status, w.agent_id,
          ]),
        );
      }
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('balance <walletId>')
  .description('Get wallet balance')
  .option('--json', 'Output as JSON')
  .action(async (walletId, opts) => {
    try {
      const client = getClient();
      const result = await client.wallets.getBalance(walletId);
      outputResult(result, opts.json);
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('fund <walletId>')
  .description('Fund a wallet')
  .requiredOption('--amount <amount>', 'Amount to fund', parseFloat)
  .option('--json', 'Output as JSON')
  .action(async (walletId, opts) => {
    try {
      const client = getClient();
      const result = await client.admin.wallets.fund(walletId, opts.amount);
      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log(`Wallet ${walletId} funded with $${opts.amount}`);
        outputResult(result, false);
      }
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('freeze <walletId>')
  .description('Freeze a wallet')
  .action(async (walletId) => {
    try {
      const client = getClient();
      await client.admin.wallets.freeze(walletId);
      console.log(`Wallet ${walletId} frozen.`);
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('unfreeze <walletId>')
  .description('Unfreeze a wallet')
  .action(async (walletId) => {
    try {
      const client = getClient();
      await client.admin.wallets.unfreeze(walletId);
      console.log(`Wallet ${walletId} unfrozen.`);
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('approve <walletId>')
  .description('Approve a pending wallet')
  .option('--amount <amount>', 'Override funding amount', parseFloat)
  .action(async (walletId, opts) => {
    try {
      const client = getClient();
      await client.admin.wallets.approve(walletId, opts.amount);
      console.log(`Wallet ${walletId} approved.`);
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('reject <walletId>')
  .description('Reject a pending wallet')
  .action(async (walletId) => {
    try {
      const client = getClient();
      await client.admin.wallets.reject(walletId);
      console.log(`Wallet ${walletId} rejected.`);
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('close <walletId>')
  .description('Close a wallet')
  .action(async (walletId) => {
    try {
      const client = getClient();
      await client.admin.wallets.close(walletId);
      console.log(`Wallet ${walletId} closed.`);
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('create-card <walletId>')
  .description('Create a virtual card for a wallet')
  .option('--json', 'Output as JSON')
  .action(async (walletId, opts) => {
    try {
      const client = getClient();
      const result = await client.admin.wallets.createCard(walletId);
      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log(`Virtual card created for wallet ${walletId}`);
        outputResult(result, false);
      }
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('card-info <walletId>')
  .description('Get card information for a wallet')
  .option('--json', 'Output as JSON')
  .action(async (walletId, opts) => {
    try {
      const client = getClient();
      const result = await client.admin.wallets.getCard(walletId);
      outputResult(result, opts.json);
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('freeze-card <walletId>')
  .description('Freeze the virtual card for a wallet')
  .action(async (walletId) => {
    try {
      const client = getClient();
      await client.admin.wallets.freezeCard(walletId);
      console.log(`Card for wallet ${walletId} frozen.`);
    } catch (err) { handleError(err); }
  });

walletCommand
  .command('unfreeze-card <walletId>')
  .description('Unfreeze the virtual card for a wallet')
  .action(async (walletId) => {
    try {
      const client = getClient();
      await client.admin.wallets.unfreezeCard(walletId);
      console.log(`Card for wallet ${walletId} unfrozen.`);
    } catch (err) { handleError(err); }
  });
