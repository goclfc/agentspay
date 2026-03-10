import { AgentsPay } from '@usectl/sdk';
import { getApiUrl, getMasterKey, loadCredentials } from './config';

export function getClient(): AgentsPay {
  const creds = loadCredentials();
  const masterKey = getMasterKey();
  const apiUrl = getApiUrl();

  return new AgentsPay({
    masterKey,
    apiUrl,
  });
}

export function getAgentClient(agentKey: string): AgentsPay {
  return new AgentsPay({
    agentKey,
    apiUrl: getApiUrl(),
  });
}
