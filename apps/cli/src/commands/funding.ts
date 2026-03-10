import { Command } from 'commander';
import { getClient } from '../lib/client';
import { outputResult, handleError } from '../lib/output';

export const fundingCommand = new Command('funding').description('Platform funding commands');

fundingCommand
  .command('balance')
  .description('Show platform balance')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.funding.getBalance();
      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log(`Available: $${result.available}`);
        console.log(`Pending:   $${result.pending}`);
      }
    } catch (err) { handleError(err); }
  });

fundingCommand
  .command('deposit')
  .description('Deposit funds via Stripe')
  .requiredOption('--amount <amount>', 'Amount to deposit', parseFloat)
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.funding.deposit(opts.amount);
      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log(`Deposit initiated: $${opts.amount}`);
        if (result.checkout_url) {
          console.log(`\nComplete payment at: ${result.checkout_url}`);
        }
      }
    } catch (err) { handleError(err); }
  });

fundingCommand
  .command('withdraw')
  .description('Withdraw funds')
  .requiredOption('--amount <amount>', 'Amount to withdraw', parseFloat)
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.funding.withdraw(opts.amount);
      outputResult(result, opts.json);
    } catch (err) { handleError(err); }
  });
