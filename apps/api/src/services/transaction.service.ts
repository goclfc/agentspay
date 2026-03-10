import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { PLATFORM_FEE_PERCENT } from '@usectl/shared';
import {
  BadRequestError,
  InsufficientFundsError,
  SpendingLimitError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors';
import { checkSpendingLimits } from './wallet.service';

export async function pay(
  agentId: string,
  walletId: string,
  merchantId: string,
  amount: number,
  description?: string,
  metadata?: Record<string, unknown>,
  idempotencyKey?: string
) {
  // Check idempotency
  if (idempotencyKey) {
    const existing = await prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return formatPayResponse(existing);
    }
  }

  // Validate wallet
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agentId !== agentId) throw new ForbiddenError('Wallet does not belong to this agent');
  if (wallet.status !== 'ACTIVE') throw new BadRequestError('Wallet is not active');
  if (wallet.expiresAt && wallet.expiresAt < new Date()) throw new BadRequestError('Wallet is expired');

  // Validate merchant
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new NotFoundError('Merchant');
  if (merchant.status !== 'ACTIVE') throw new BadRequestError('Merchant is not active');

  // Check allowed merchants
  if (wallet.allowedMerchants.length > 0 && !wallet.allowedMerchants.includes(merchantId)) {
    throw new BadRequestError('Merchant not in allowed merchants list');
  }

  // Check spending limits
  const limitCheck = await checkSpendingLimits(walletId, amount);
  if (!limitCheck.allowed) throw new SpendingLimitError(limitCheck.reason!);

  // Calculate fee
  const fee = Number((amount * PLATFORM_FEE_PERCENT / 100).toFixed(2));
  const merchantCredit = Number((amount - fee).toFixed(2));

  // Execute transaction
  const tx = await prisma.$transaction(async (ptx) => {
    // Lock wallet row
    const locked = await ptx.$queryRaw<any[]>`
      SELECT * FROM wallets WHERE id = ${walletId} FOR UPDATE
    `;
    const lockedWallet = locked[0];
    if (!lockedWallet || new Decimal(lockedWallet.balance).lessThan(amount)) {
      throw new InsufficientFundsError();
    }

    // Debit wallet
    await ptx.wallet.update({
      where: { id: walletId },
      data: { balance: { decrement: amount } },
    });

    // Credit merchant
    await ptx.merchant.update({
      where: { id: merchantId },
      data: { balance: { increment: merchantCredit } },
    });

    // Create transaction record
    const transaction = await ptx.transaction.create({
      data: {
        type: 'PAYMENT',
        status: 'COMPLETED',
        amount: new Decimal(amount),
        fee: new Decimal(fee),
        walletId,
        senderAgentId: agentId,
        merchantId,
        description,
        metadata: (metadata as any) || undefined,
        idempotencyKey,
        completedAt: new Date(),
      },
    });

    // Update spend log
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await ptx.spendLog.upsert({
      where: { walletId_date: { walletId, date: today } },
      create: { walletId, date: today, daily: new Decimal(amount), monthly: new Decimal(amount) },
      update: { daily: { increment: amount }, monthly: { increment: amount } },
    });

    return transaction;
  });

  // Get updated wallet balance
  const updatedWallet = await prisma.wallet.findUnique({ where: { id: walletId } });

  return {
    transaction_id: tx.id,
    status: 'completed' as const,
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    wallet_balance_after: updatedWallet?.balance.toString() || '0',
    created_at: tx.createdAt.toISOString(),
  };
}

export async function transfer(
  agentId: string,
  fromWalletId: string,
  toAgentAccount: string,
  amount: number,
  reason?: string,
  metadata?: Record<string, unknown>,
  idempotencyKey?: string
) {
  // Check idempotency
  if (idempotencyKey) {
    const existing = await prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      const receiverAgent = existing.receiverAgentId
        ? await prisma.agent.findUnique({ where: { id: existing.receiverAgentId } })
        : null;
      return formatTransferResponse(existing, receiverAgent);
    }
  }

  // Validate sender wallet
  const senderWallet = await prisma.wallet.findUnique({ where: { id: fromWalletId } });
  if (!senderWallet) throw new NotFoundError('Sender wallet');
  if (senderWallet.agentId !== agentId) throw new ForbiddenError('Wallet does not belong to this agent');
  if (senderWallet.status !== 'ACTIVE') throw new BadRequestError('Sender wallet is not active');
  if (!senderWallet.allowTransfersOut) throw new BadRequestError('Wallet does not allow outgoing transfers');

  // Check spending limits
  const limitCheck = await checkSpendingLimits(fromWalletId, amount);
  if (!limitCheck.allowed) throw new SpendingLimitError(limitCheck.reason!);

  // Look up receiver
  const receiverAgent = await prisma.agent.findUnique({
    where: { accountNumber: toAgentAccount },
    include: {
      wallets: {
        where: { status: 'ACTIVE', allowTransfersIn: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!receiverAgent) throw new NotFoundError('Recipient agent');
  if (receiverAgent.status !== 'ACTIVE') throw new BadRequestError('Recipient agent is not active');
  if (receiverAgent.wallets.length === 0) throw new BadRequestError('Recipient has no wallet accepting transfers');

  const receiverWallet = receiverAgent.wallets[0];
  const fee = Number((amount * PLATFORM_FEE_PERCENT / 100).toFixed(2));
  const netAmount = Number((amount - fee).toFixed(2));

  // Lock wallets in consistent order to prevent deadlocks
  const [firstId, secondId] = [fromWalletId, receiverWallet.id].sort();

  const tx = await prisma.$transaction(async (ptx) => {
    // Lock both wallets in consistent order
    await ptx.$queryRaw`SELECT * FROM wallets WHERE id = ${firstId} FOR UPDATE`;
    await ptx.$queryRaw`SELECT * FROM wallets WHERE id = ${secondId} FOR UPDATE`;

    // Re-check sender balance
    const sender = await ptx.wallet.findUnique({ where: { id: fromWalletId } });
    if (!sender || sender.balance.lessThan(amount)) throw new InsufficientFundsError();

    // Debit sender
    await ptx.wallet.update({
      where: { id: fromWalletId },
      data: { balance: { decrement: amount } },
    });

    // Credit receiver
    await ptx.wallet.update({
      where: { id: receiverWallet.id },
      data: { balance: { increment: netAmount } },
    });

    // Create transaction record
    const transaction = await ptx.transaction.create({
      data: {
        type: 'TRANSFER',
        status: 'COMPLETED',
        amount: new Decimal(amount),
        fee: new Decimal(fee),
        walletId: fromWalletId,
        senderAgentId: agentId,
        receiverAgentId: receiverAgent.id,
        description: reason,
        metadata: (metadata as any) || undefined,
        idempotencyKey,
        completedAt: new Date(),
      },
    });

    // Update spend log
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await ptx.spendLog.upsert({
      where: { walletId_date: { walletId: fromWalletId, date: today } },
      create: { walletId: fromWalletId, date: today, daily: new Decimal(amount), monthly: new Decimal(amount) },
      update: { daily: { increment: amount }, monthly: { increment: amount } },
    });

    return transaction;
  });

  const updatedWallet = await prisma.wallet.findUnique({ where: { id: fromWalletId } });

  return {
    transaction_id: tx.id,
    status: 'completed' as const,
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    wallet_balance_after: updatedWallet?.balance.toString() || '0',
    recipient_agent: { account_number: receiverAgent.accountNumber, name: receiverAgent.name },
    created_at: tx.createdAt.toISOString(),
  };
}

export async function listTransactions(opts: {
  userId?: string;
  agentId?: string;
  walletId?: string;
  type?: string;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
}) {
  const where: any = {};

  if (opts.walletId) where.walletId = opts.walletId;
  if (opts.type) where.type = opts.type;
  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) where.createdAt.gte = new Date(opts.from);
    if (opts.to) where.createdAt.lte = new Date(opts.to);
  }

  if (opts.agentId) {
    where.OR = [{ senderAgentId: opts.agentId }, { receiverAgentId: opts.agentId }];
  }

  if (opts.userId && !opts.agentId) {
    const agents = await prisma.agent.findMany({ where: { userId: opts.userId }, select: { id: true } });
    const agentIds = agents.map((a) => a.id);
    where.OR = [{ senderAgentId: { in: agentIds } }, { receiverAgentId: { in: agentIds } }];
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = transactions.length > opts.limit;
  const data = transactions.slice(0, opts.limit);

  return {
    data: data.map((t) => ({
      transaction_id: t.id,
      type: t.type,
      status: t.status,
      amount: t.amount.toString(),
      fee: t.fee.toString(),
      description: t.description,
      wallet_id: t.walletId,
      merchant_id: t.merchantId,
      sender_agent_id: t.senderAgentId,
      receiver_agent_id: t.receiverAgentId,
      created_at: t.createdAt.toISOString(),
    })),
    cursor: hasMore ? data[data.length - 1].id : null,
    has_more: hasMore,
  };
}

export async function getTransaction(txId: string, requesterId: string, requesterType: 'user' | 'agent') {
  const tx = await prisma.transaction.findUnique({
    where: { id: txId },
    include: { wallet: { include: { agent: true } } },
  });
  if (!tx) throw new NotFoundError('Transaction');

  if (requesterType === 'user' && tx.wallet.agent.userId !== requesterId) throw new ForbiddenError();
  if (requesterType === 'agent' && tx.senderAgentId !== requesterId && tx.receiverAgentId !== requesterId) throw new ForbiddenError();

  return {
    transaction_id: tx.id,
    type: tx.type,
    status: tx.status,
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    description: tx.description,
    metadata: tx.metadata,
    wallet_id: tx.walletId,
    merchant_id: tx.merchantId,
    sender_agent_id: tx.senderAgentId,
    receiver_agent_id: tx.receiverAgentId,
    created_at: tx.createdAt.toISOString(),
    completed_at: tx.completedAt?.toISOString() || null,
  };
}

function formatPayResponse(tx: any) {
  return {
    transaction_id: tx.id,
    status: 'completed' as const,
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    wallet_balance_after: '0', // Can't know without querying
    created_at: tx.createdAt.toISOString(),
  };
}

function formatTransferResponse(tx: any, receiverAgent: any) {
  return {
    transaction_id: tx.id,
    status: 'completed' as const,
    amount: tx.amount.toString(),
    fee: tx.fee.toString(),
    wallet_balance_after: '0',
    recipient_agent: receiverAgent
      ? { account_number: receiverAgent.accountNumber, name: receiverAgent.name }
      : { account_number: 'unknown', name: 'unknown' },
    created_at: tx.createdAt.toISOString(),
  };
}
