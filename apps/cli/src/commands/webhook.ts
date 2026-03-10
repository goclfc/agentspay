import { Command } from 'commander';
import { getClient } from '../lib/client';
import { outputResult, outputTable, handleError } from '../lib/output';

export const webhookCommand = new Command('webhook').description('Webhook management');

webhookCommand
  .command('add')
  .description('Register a webhook endpoint')
  .requiredOption('--url <url>', 'Webhook URL')
  .requiredOption('--events <events>', 'Comma-separated event types')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const events = opts.events.split(',').map((e: string) => e.trim());
      const result = await client.admin.webhooks.create(opts.url, events);
      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log('Webhook registered!');
        console.log(`Webhook ID: ${result.webhook_id}`);
        console.log(`Secret:     ${result.secret}`);
      }
    } catch (err) { handleError(err); }
  });

webhookCommand
  .command('list')
  .description('List webhook endpoints')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.webhooks.list();
      if (opts.json) {
        outputResult(result, true);
      } else {
        const hooks = result.data || result;
        if (!Array.isArray(hooks) || hooks.length === 0) {
          console.log('No webhooks found.');
          return;
        }
        outputTable(
          ['Webhook ID', 'URL', 'Events', 'Active'],
          hooks.map((h: any) => [
            h.webhook_id, h.url,
            (h.events || []).join(', '),
            String(h.active ?? true),
          ]),
        );
      }
    } catch (err) { handleError(err); }
  });

webhookCommand
  .command('delete <webhookId>')
  .description('Delete a webhook endpoint')
  .action(async (webhookId) => {
    try {
      const client = getClient();
      await client.admin.webhooks.delete(webhookId);
      console.log(`Webhook ${webhookId} deleted.`);
    } catch (err) { handleError(err); }
  });
