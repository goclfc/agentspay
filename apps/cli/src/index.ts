#!/usr/bin/env node
import { Command } from 'commander';
import { authCommand } from './commands/auth';
import { agentCommand } from './commands/agent';
import { walletCommand } from './commands/wallet';
import { txCommand } from './commands/tx';
import { fundingCommand } from './commands/funding';
import { merchantCommand } from './commands/merchant';
import { webhookCommand } from './commands/webhook';
import { configCommand } from './commands/config';

const program = new Command();

program
  .name('agentspay')
  .description('Payment infrastructure for AI agents')
  .version('0.0.1');

program.addCommand(authCommand);
program.addCommand(agentCommand);
program.addCommand(walletCommand);
program.addCommand(txCommand);
program.addCommand(fundingCommand);
program.addCommand(merchantCommand);
program.addCommand(webhookCommand);
program.addCommand(configCommand);

program.parse();
