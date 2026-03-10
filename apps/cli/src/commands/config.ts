import { Command } from 'commander';
import { loadConfig, saveConfig } from '../lib/config';

export const configCommand = new Command('config').description('CLI configuration');

configCommand
  .command('set <key> <value>')
  .description('Set a config value (e.g., api_url, default_output)')
  .action((key, value) => {
    saveConfig({ [key]: value });
    console.log(`Config: ${key} = ${value}`);
  });

configCommand
  .command('get [key]')
  .description('Get a config value or show all config')
  .action((key) => {
    const config = loadConfig();
    if (key) {
      console.log(config[key] ?? '(not set)');
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
  });
