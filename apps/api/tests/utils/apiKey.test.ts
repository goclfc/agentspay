import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, generateAccountNumber } from '../../src/utils/apiKey';

describe('generateApiKey', () => {
  it('generates MASTER key with correct prefix', () => {
    const { key, hash, prefix } = generateApiKey('MASTER');
    expect(key).toMatch(/^ap_master_/);
    expect(prefix).toMatch(/^ap_master_/);
    expect(hash).toHaveLength(64); // SHA-256 hex
  });

  it('generates AGENT key with correct prefix', () => {
    const { key } = generateApiKey('AGENT');
    expect(key).toMatch(/^ap_agent_/);
  });

  it('generates MERCHANT key with correct prefix', () => {
    const { key } = generateApiKey('MERCHANT');
    expect(key).toMatch(/^ap_merch_/);
  });

  it('generates unique keys', () => {
    const k1 = generateApiKey('MASTER');
    const k2 = generateApiKey('MASTER');
    expect(k1.key).not.toBe(k2.key);
    expect(k1.hash).not.toBe(k2.hash);
  });
});

describe('hashApiKey', () => {
  it('produces consistent SHA-256 hash', () => {
    const key = 'ap_master_test123';
    const h1 = hashApiKey(key);
    const h2 = hashApiKey(key);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('produces different hashes for different keys', () => {
    expect(hashApiKey('key1')).not.toBe(hashApiKey('key2'));
  });
});

describe('generateAccountNumber', () => {
  it('returns AGT- followed by 8 alphanumeric chars', () => {
    const acct = generateAccountNumber();
    expect(acct).toMatch(/^AGT-[A-Z0-9]{8}$/);
  });

  it('generates unique account numbers', () => {
    const a1 = generateAccountNumber();
    const a2 = generateAccountNumber();
    expect(a1).not.toBe(a2);
  });
});
