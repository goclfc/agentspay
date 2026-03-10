import { Command } from 'commander';
import { getClient } from '../lib/client';
import { saveCredentials, clearCredentials } from '../lib/config';
import { outputResult, handleError } from '../lib/output';

export const authCommand = new Command('auth').description('Authentication commands');

authCommand
  .command('register')
  .description('Register a new account')
  .requiredOption('--email <email>', 'Email address')
  .requiredOption('--password <password>', 'Password (min 8 chars)')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.auth.register(opts.email, opts.password);
      saveCredentials({ master_key: result.master_api_key });
      console.log('Registration successful!');
      console.log(`User ID: ${result.user_id}`);
      console.log(`Master API Key: ${result.master_api_key}`);
      console.log('\nYour master key has been saved to ~/.agentspay/credentials.json');
    } catch (err) { handleError(err); }
  });

authCommand
  .command('login')
  .description('Login to your account')
  .requiredOption('--email <email>', 'Email address')
  .requiredOption('--password <password>', 'Password')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.auth.login(opts.email, opts.password);
      saveCredentials({ token: result.token, refresh_token: result.refresh_token });
      console.log('Login successful! Token saved.');
    } catch (err) { handleError(err); }
  });

authCommand
  .command('me')
  .description('Show current user profile')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const client = getClient();
      const result = await client.admin.auth.me();
      outputResult(result, opts.json);
    } catch (err) { handleError(err); }
  });

authCommand
  .command('logout')
  .description('Clear stored credentials')
  .action(() => {
    clearCredentials();
    console.log('Credentials cleared.');
  });
