import { Command } from 'commander';
import { getClient } from '../lib/client';
import { outputResult, outputTable, handleError } from '../lib/output';

export const txCommand = new Command('tx').description('Transaction commands');

txCommand
  .command('list')
  .description('List transactions')
  .option('--wallet-id <walletId>', 'Filter by wallet')
  .option('--type <type>', 'Filter by type (PAYMENT, TRANSFER, FUND, WITHDRAW)')
  .option('--from <date>', 'From date (ISO 8601)')
  .option('--to <date>', 'To date (ISO 8601)')
  .option('--limit <limit>', 'Max results', parseInt)
  .option('--cursor <cursor>', 'Pagination cursor')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.transactions.list({
        walletId: opts.walletId,
        type: opts.type,
        from: opts.from,
        to: opts.to,
        limit: opts.limit,
        cursor: opts.cursor,
      });
      if (opts.json) {
        outputResult(result, true);
      } else {
        const txs = result.data || result;
        if (!Array.isArray(txs) || txs.length === 0) {
          console.log('No transactions found.');
          return;
        }
        outputTable(
          ['TX ID', 'Type', 'Status', 'Amount', 'Fee', 'Date'],
          txs.map((t: any) => [
            t.transaction_id, t.type, t.status, t.amount, t.fee,
            new Date(t.created_at).toLocaleString(),
          ]),
        );
        if (result.has_more) {
          console.log(`\nMore results available. Use --cursor ${result.cursor}`);
        }
      }
    } catch (err) { handleError(err); }
  });

txCommand
  .command('get <txId>')
  .description('Get transaction details')
  .option('--json', 'Output as JSON')
  .action(async (txId, opts) => {
    try {
      const client = getClient();
      const result = await client.transactions.get(txId);
      outputResult(result, opts.json);
    } catch (err) { handleError(err); }
  });
