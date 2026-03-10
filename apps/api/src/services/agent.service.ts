import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { generateApiKey, generateAccountNumber } from '../utils/apiKey';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors';

export async function createAgent(userId: string, name: string, description?: string, metadata?: Record<string, unknown>) {
  const { key, hash, prefix } = generateApiKey('AGENT');
  const accountNumber = generateAccountNumber();

  const agent = await prisma.agent.create({
    data: {
      userId,
      name,
      accountNumber,
      description: description || null,
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      metadata: (metadata as any) || undefined,
    },
  });

  return { agent_id: agent.id, account_number: agent.accountNumber, api_key: key };
}

export async function selfRegister(masterKeyUserId: string, name: string, description?: string, capabilities?: string[]) {
  const user = await prisma.user.findUnique({ where: { id: masterKeyUserId } });
  if (!user) throw new NotFoundError('User');
  if (!user.allowAgentSelfRegister) throw new ForbiddenError('Agent self-registration is disabled');

  return createAgent(masterKeyUserId, name, description, capabilities ? { capabilities } : undefined);
}

export async function listAgents(userId: string) {
  const agents = await prisma.agent.findMany({
    where: { userId },
    include: {
      wallets: { select: { balance: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return agents.map((a) => ({
    agent_id: a.id,
    name: a.name,
    account_number: a.accountNumber,
    status: a.status,
    wallet_count: a.wallets.length,
    total_balance: a.wallets.reduce((sum, w) => sum.add(w.balance), new Decimal(0)).toString(),
    last_active_at: a.lastActiveAt?.toISOString() || null,
  }));
}

export async function getAgent(agentId: string, requesterId: string, requesterType: 'user' | 'agent') {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      wallets: true,
    },
  });
  if (!agent) throw new NotFoundError('Agent');

  // Check ownership
  if (requesterType === 'user' && agent.userId !== requesterId) throw new ForbiddenError();
  if (requesterType === 'agent' && agent.id !== requesterId) throw new ForbiddenError();

  return {
    agent_id: agent.id,
    name: agent.name,
    account_number: agent.accountNumber,
    status: agent.status,
    description: agent.description,
    metadata: agent.metadata as Record<string, unknown> | null,
    wallets: agent.wallets.map((w) => ({
      wallet_id: w.id,
      name: w.name,
      balance: w.balance.toString(),
      status: w.status,
      limits: {
        limit_per_tx: w.limitPerTx?.toString() || null,
        daily_limit: w.dailyLimit?.toString() || null,
        monthly_limit: w.monthlyLimit?.toString() || null,
        allowed_merchants: w.allowedMerchants,
      },
      agent_id: w.agentId,
    })),
    created_at: agent.createdAt.toISOString(),
  };
}

export async function revokeAgent(agentId: string, userId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new NotFoundError('Agent');

  await prisma.agent.update({ where: { id: agentId }, data: { status: 'REVOKED' } });
  return { status: 'revoked' };
}

export async function rotateKey(agentId: string, userId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new NotFoundError('Agent');

  const { key, hash, prefix } = generateApiKey('AGENT');
  await prisma.agent.update({
    where: { id: agentId },
    data: { apiKeyHash: hash, apiKeyPrefix: prefix },
  });

  return { new_api_key: key };
}

export async function lookupByAccount(accountNumber: string) {
  const agent = await prisma.agent.findUnique({
    where: { accountNumber },
    include: {
      wallets: {
        where: { status: 'ACTIVE', allowTransfersIn: true },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!agent) throw new NotFoundError('Agent');

  return {
    agent_id: agent.id,
    name: agent.name,
    account_number: agent.accountNumber,
    accepts_transfers: agent.wallets.length > 0,
  };
}
