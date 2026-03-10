import crypto from 'crypto';
import { API_KEY_PREFIX, ACCOUNT_NUMBER_PREFIX } from '@usectl/shared';

export function generateApiKey(type: 'MASTER' | 'AGENT' | 'MERCHANT'): { key: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(24).toString('base64url');
  const prefixStr = API_KEY_PREFIX[type];
  const key = `${prefixStr}${random}`;
  const hash = hashApiKey(key);
  return { key, hash, prefix: key.substring(0, prefixStr.length + 4) };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateAccountNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = ACCOUNT_NUMBER_PREFIX;
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(crypto.randomInt(chars.length));
  }
  return result;
}
