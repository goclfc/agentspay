import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.agentspay');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export interface Credentials {
  master_key?: string;
  token?: string;
  refresh_token?: string;
}

export function loadCredentials(): Credentials {
  try {
    const data = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function saveCredentials(creds: Partial<Credentials>) {
  ensureConfigDir();
  const existing = loadCredentials();
  const merged = { ...existing, ...creds };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(merged, null, 2));
}

export function clearCredentials() {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE);
  }
}

export interface Config {
  api_url?: string;
  default_output?: 'table' | 'json';
  [key: string]: string | undefined;
}

export function loadConfig(): Config {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function saveConfig(updates: Partial<Config>) {
  ensureConfigDir();
  const existing = loadConfig();
  const merged = { ...existing, ...updates };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

export function getApiUrl(): string {
  return loadConfig().api_url || process.env.AGENTSPAY_API_URL || 'http://localhost:80';
}

export function getMasterKey(): string | undefined {
  return process.env.AGENTSPAY_MASTER_KEY || loadCredentials().master_key;
}
