import { Command } from 'commander';
import { AgentsPay } from '@agentspay/sdk';
import { getApiUrl } from '../lib/config';
import { outputResult, handleError } from '../lib/output';

export const merchantCommand = new Command('merchant').description('Merchant commands');

merchantCommand
  .command('register')
  .description('Register as a merchant')
  .requiredOption('--name <name>', 'Business name')
  .requiredOption('--email <email>', 'Contact email')
  .requiredOption('--password <password>', 'Password')
  .option('--category <category>', 'Business category')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      // Merchant registration is unauthenticated
      const client = new AgentsPay({ apiUrl: getApiUrl() });
      const result = await (client as any).client.post('/v1/merchants/register', {
        name: opts.name,
        email: opts.email,
        password: opts.password,
        category: opts.category,
      });
      if (opts.json) {
        outputResult(result, true);
      } else {
        console.log('Merchant registered!');
        console.log(`Merchant ID: ${result.merchant_id}`);
        console.log(`API Key:     ${result.api_key}`);
        if (result.onboarding_url) {
          console.log(`\nComplete onboarding: ${result.onboarding_url}`);
        }
      }
    } catch (err) { handleError(err); }
  });
