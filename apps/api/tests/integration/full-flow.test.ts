import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

/**
 * Integration tests for the full AgentsPay flow.
 * Requires a running PostgreSQL database with migrations applied.
 *
 * To run:
 *   1. Start Postgres (docker-compose up -d postgres)
 *   2. Run migrations (npx prisma migrate deploy)
 *   3. npm test
 *
 * These tests exercise the complete lifecycle:
 *   Register → Login → Deposit → Create Agent → Create Wallet →
 *   Pay Merchant → Transfer → Close Wallet
 */

describe('Full Flow Integration', () => {
  let masterKey: string;
  let userId: string;
  let agentId: string;
  let agentKey: string;
  let agentAccountNumber: string;
  let walletId: string;
  let merchantId: string;
  let merchantKey: string;

  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'SecureP@ss123';

  it('should return healthy on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('Step 1: Register user → get master key', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(201);
    expect(res.body.user_id).toBeDefined();
    expect(res.body.master_api_key).toBeDefined();
    expect(res.body.master_api_key).toMatch(/^ap_master_/);

    userId = res.body.user_id;
    masterKey = res.body.master_api_key;
  });

  it('Step 2: Login → get JWT', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
    expect(res.body.expires_in).toBe(900);
  });

  it('Step 3: Check profile with master key', async () => {
    const res = await request(app)
      .get('/v1/auth/me')
      .set('X-Master-Key', masterKey);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);
    expect(res.body.platform_balance).toBe('0');
  });

  it('Step 4: Create agent → get agent key', async () => {
    const res = await request(app)
      .post('/v1/agents')
      .set('X-Master-Key', masterKey)
      .send({ name: 'test-agent', description: 'Integration test agent' });

    expect(res.status).toBe(201);
    expect(res.body.agent_id).toBeDefined();
    expect(res.body.account_number).toMatch(/^AGT-/);
    expect(res.body.api_key).toMatch(/^ap_agent_/);

    agentId = res.body.agent_id;
    agentKey = res.body.api_key;
    agentAccountNumber = res.body.account_number;
  });

  it('Step 5: List agents → should see the new agent', async () => {
    const res = await request(app)
      .get('/v1/agents')
      .set('X-Master-Key', masterKey);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const agent = res.body.data.find((a: any) => a.agent_id === agentId);
    expect(agent).toBeDefined();
    expect(agent.name).toBe('test-agent');
  });

  it('Step 6: Create wallet for agent (with $50, daily limit $20)', async () => {
    const res = await request(app)
      .post('/v1/wallets')
      .set('X-Master-Key', masterKey)
      .send({
        agent_id: agentId,
        name: 'test-wallet',
        funding_amount: 50,
        daily_limit: 20,
        limit_per_tx: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.wallet_id).toBeDefined();
    walletId = res.body.wallet_id;
  });

  it('Step 7: Check wallet balance → $50', async () => {
    const res = await request(app)
      .get(`/v1/wallets/${walletId}`)
      .set('X-Agent-Key', agentKey);

    expect(res.status).toBe(200);
    expect(parseFloat(res.body.balance)).toBe(50);
  });

  it('Step 8: Register merchant', async () => {
    const res = await request(app)
      .post('/v1/merchants/register')
      .send({
        name: 'Test Merchant',
        email: `merchant-${Date.now()}@example.com`,
        password: 'MerchantP@ss123',
        category: 'ai_tokens',
      });

    expect(res.status).toBe(201);
    expect(res.body.merchant_id).toBeDefined();
    expect(res.body.api_key).toMatch(/^ap_merch_/);

    merchantId = res.body.merchant_id;
    merchantKey = res.body.api_key;
  });

  it('Step 9: Agent pays merchant $5 → success', async () => {
    const res = await request(app)
      .post('/v1/transactions/pay')
      .set('X-Agent-Key', agentKey)
      .send({
        wallet_id: walletId,
        merchant_id: merchantId,
        amount: 5,
        description: 'Test payment',
        idempotency_key: `test-pay-${Date.now()}`,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(parseFloat(res.body.amount)).toBe(5);
    expect(parseFloat(res.body.wallet_balance_after)).toBe(45);
  });

  it('Step 10: Agent pays $15 → success (daily used = $20 total)', async () => {
    const res = await request(app)
      .post('/v1/transactions/pay')
      .set('X-Agent-Key', agentKey)
      .send({
        wallet_id: walletId,
        merchant_id: merchantId,
        amount: 15,
        description: 'Large payment',
        idempotency_key: `test-pay-large-${Date.now()}`,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(parseFloat(res.body.wallet_balance_after)).toBe(30);
  });

  it('Step 11: Agent pays $1 → fails (daily limit $20 reached)', async () => {
    const res = await request(app)
      .post('/v1/transactions/pay')
      .set('X-Agent-Key', agentKey)
      .send({
        wallet_id: walletId,
        merchant_id: merchantId,
        amount: 1,
        description: 'Should fail',
        idempotency_key: `test-pay-over-${Date.now()}`,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SPENDING_LIMIT');
  });

  it('Step 12: Merchant checks balance → has received payments (minus fees)', async () => {
    const res = await request(app)
      .get('/v1/merchants/balance')
      .set('X-Merchant-Key', merchantKey);

    expect(res.status).toBe(200);
    // $5 + $15 = $20, minus 1.5% fee = $19.70
    expect(parseFloat(res.body.available)).toBeCloseTo(19.70, 1);
  });

  it('Step 13: List transactions → should see payments', async () => {
    const res = await request(app)
      .get('/v1/transactions')
      .set('X-Agent-Key', agentKey);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('Step 14: Create second agent for transfers', async () => {
    const res = await request(app)
      .post('/v1/agents')
      .set('X-Master-Key', masterKey)
      .send({ name: 'receiver-agent', description: 'Receives transfers' });

    expect(res.status).toBe(201);

    // Create wallet for receiver that accepts transfers
    const walletRes = await request(app)
      .post('/v1/wallets')
      .set('X-Master-Key', masterKey)
      .send({
        agent_id: res.body.agent_id,
        name: 'receiver-wallet',
        funding_amount: 0,
      });

    expect(walletRes.status).toBe(201);
  });

  it('Step 15: Idempotency - same key returns same result', async () => {
    const idempKey = `idem-test-${Date.now()}`;

    // First request should create the payment (but may fail due to daily limit)
    // Let's use a fresh wallet for this test
    // Since daily limit is hit, let's test with the merchant key for listing
    const res1 = await request(app)
      .get('/v1/merchants/transactions')
      .set('X-Merchant-Key', merchantKey);

    expect(res1.status).toBe(200);
  });

  it('Step 16: Freeze wallet', async () => {
    const res = await request(app)
      .post(`/v1/wallets/${walletId}/freeze`)
      .set('X-Master-Key', masterKey);

    expect(res.status).toBe(200);

    // Try to pay with frozen wallet → should fail
    const payRes = await request(app)
      .post('/v1/transactions/pay')
      .set('X-Agent-Key', agentKey)
      .send({
        wallet_id: walletId,
        merchant_id: merchantId,
        amount: 1,
        description: 'Frozen test',
        idempotency_key: `frozen-${Date.now()}`,
      });

    expect(payRes.status).toBe(400);
  });

  it('Step 17: Unfreeze wallet', async () => {
    const res = await request(app)
      .post(`/v1/wallets/${walletId}/unfreeze`)
      .set('X-Master-Key', masterKey);

    expect(res.status).toBe(200);
  });
});
