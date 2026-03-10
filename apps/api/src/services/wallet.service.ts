import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { InsufficientFundsError, NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';

export async function createWallet(
  agentId: string,
  name: string,
  opts: {
    fundingAmount?: number;
    requestedAmount?: number;
    limitPerTx?: number;
    dailyLimit?: number;
    monthlyLimit?: number;
    allowedMerchants?: string[];
    expiresAt?: string;
  },
  authType: 'user' | 'agent',
  userId?: string
) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new NotFoundError('Agent');

  if (authType === 'user') {
    // User creates wallet — fund immediately
    if (!userId) throw new BadRequestError('Missing user context');
    if (agent.userId !== userId) throw new ForbiddenError();

    const amount = opts.fundingAmount || 0;

    if (amount > 0) {
      const wallet = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || user.platformBalance.lessThan(amount)) throw new InsufficientFundsError();

        await tx.user.update({
          where: { id: userId },
          data: { platformBalance: { decrement: amount } },
        });

        return tx.wallet.create({
          data: {
            agentId,
            name,
            balance: new Decimal(amount),
            status: 'ACTIVE',
            limitPerTx: opts.limitPerTx ? new Decimal(opts.limitPerTx) : null,
            dailyLimit: opts.dailyLimit ? new Decimal(opts.dailyLimit) : null,
            monthlyLimit: opts.monthlyLimit ? new Decimal(opts.monthlyLimit) : null,
            allowedMerchants: opts.allowedMerchants || [],
            expiresAt: opts.expiresAt ? new Date(opts.expiresAt) : null,
          },
        });
      });

      return formatWallet(wallet);
    }

    const wallet = await prisma.wallet.create({
      data: {
        agentId,
        name,
        status: 'ACTIVE',
        limitPerTx: opts.limitPerTx ? new Decimal(opts.limitPerTx) : null,
        dailyLimit: opts.dailyLimit ? new Decimal(opts.dailyLimit) : null,
        monthlyLimit: opts.monthlyLimit ? new Decimal(opts.monthlyLimit) : null,
        allowedMerchants: opts.allowedMerchants || [],
        expiresAt: opts.expiresAt ? new Date(opts.expiresAt) : null,
      },
    });
    return formatWallet(wallet);
  }

  // Agent creates wallet — PENDING_APPROVAL
  const wallet = await prisma.wallet.create({
    data: {
      agentId,
      name,
      status: 'PENDING_APPROVAL',
      limitPerTx: opts.limitPerTx ? new Decimal(opts.limitPerTx) : null,
      dailyLimit: opts.dailyLimit ? new Decimal(opts.dailyLimit) : null,
      monthlyLimit: opts.monthlyLimit ? new Decimal(opts.monthlyLimit) : null,
      allowedMerchants: opts.allowedMerchants || [],
      expiresAt: opts.expiresAt ? new Date(opts.expiresAt) : null,
    },
  });
  return formatWallet(wallet);
}

export async function approveWallet(walletId: string, userId: string, amount?: number) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId }, include: { agent: true } });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();
  if (wallet.status !== 'PENDING_APPROVAL') throw new BadRequestError('Wallet is not pending approval');

  const fundAmount = amount || 0;

  const updated = await prisma.$transaction(async (tx) => {
    if (fundAmount > 0) {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.platformBalance.lessThan(fundAmount)) throw new InsufficientFundsError();
      await tx.user.update({ where: { id: userId }, data: { platformBalance: { decrement: fundAmount } } });
    }

    return tx.wallet.update({
      where: { id: walletId },
      data: { status: 'ACTIVE', balance: { increment: fundAmount } },
    });
  });

  return formatWallet(updated);
}

export async function rejectWallet(walletId: string, userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId }, include: { agent: true } });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();

  const updated = await prisma.wallet.update({
    where: { id: walletId },
    data: { status: 'CLOSED' },
  });
  return formatWallet(updated);
}

export async function fundWallet(walletId: string, userId: string, amount: number) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId }, include: { agent: true } });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();
  if (wallet.status !== 'ACTIVE') throw new BadRequestError('Wallet is not active');

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.platformBalance.lessThan(amount)) throw new InsufficientFundsError();

    await tx.user.update({ where: { id: userId }, data: { platformBalance: { decrement: amount } } });

    const updated = await tx.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: amount } },
    });

    const txRecord = await tx.transaction.create({
      data: {
        type: 'FUND',
        status: 'COMPLETED',
        amount: new Decimal(amount),
        walletId,
        completedAt: new Date(),
      },
    });

    return { wallet: updated, transactionId: txRecord.id };
  });

  return {
    wallet_id: result.wallet.id,
    new_balance: result.wallet.balance.toString(),
    transaction_id: result.transactionId,
  };
}

export async function getBalance(walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw new NotFoundError('Wallet');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const spendLog = await prisma.spendLog.findUnique({
    where: { walletId_date: { walletId, date: today } },
  });

  const dailySpent = spendLog?.daily || new Decimal(0);
  const monthlySpent = spendLog?.monthly || new Decimal(0);

  return {
    wallet_id: wallet.id,
    name: wallet.name,
    balance: wallet.balance.toString(),
    status: wallet.status,
    limits: {
      limit_per_tx: wallet.limitPerTx?.toString() || null,
      daily_limit: wallet.dailyLimit?.toString() || null,
      monthly_limit: wallet.monthlyLimit?.toString() || null,
      allowed_merchants: wallet.allowedMerchants,
    },
    spend_today: dailySpent.toString(),
    spend_this_month: monthlySpent.toString(),
  };
}

export async function freezeWallet(walletId: string, userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId }, include: { agent: true } });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();

  await prisma.wallet.update({ where: { id: walletId }, data: { status: 'FROZEN' } });
  return { wallet_id: walletId, status: 'frozen' };
}

export async function unfreezeWallet(walletId: string, userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId }, include: { agent: true } });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();

  await prisma.wallet.update({ where: { id: walletId }, data: { status: 'ACTIVE' } });
  return { wallet_id: walletId, status: 'active' };
}

export async function closeWallet(walletId: string, userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId }, include: { agent: true } });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();

  const returnedAmount = wallet.balance;

  await prisma.$transaction([
    prisma.wallet.update({ where: { id: walletId }, data: { status: 'CLOSED', balance: 0 } }),
    prisma.user.update({
      where: { id: userId },
      data: { platformBalance: { increment: returnedAmount } },
    }),
  ]);

  return { wallet_id: walletId, status: 'closed', returned_amount: returnedAmount.toString() };
}

export async function listWallets(opts: { agentId?: string; userId?: string }) {
  const where: any = {};
  if (opts.agentId) where.agentId = opts.agentId;
  if (opts.userId) where.agent = { userId: opts.userId };

  const wallets = await prisma.wallet.findMany({ where, orderBy: { createdAt: 'desc' } });
  return wallets.map(formatWallet);
}

export async function checkSpendingLimits(walletId: string, amount: number): Promise<{ allowed: boolean; reason?: string }> {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return { allowed: false, reason: 'Wallet not found' };

  // Per-tx limit
  if (wallet.limitPerTx && new Decimal(amount).greaterThan(wallet.limitPerTx)) {
    return { allowed: false, reason: `per_tx limit of ${wallet.limitPerTx}` };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const spendLog = await prisma.spendLog.findUnique({
    where: { walletId_date: { walletId, date: today } },
  });

  const dailySpent = spendLog?.daily || new Decimal(0);
  const monthlySpent = spendLog?.monthly || new Decimal(0);

  // Daily limit
  if (wallet.dailyLimit && dailySpent.add(amount).greaterThan(wallet.dailyLimit)) {
    return { allowed: false, reason: `daily limit of ${wallet.dailyLimit}` };
  }

  // Monthly limit
  if (wallet.monthlyLimit && monthlySpent.add(amount).greaterThan(wallet.monthlyLimit)) {
    return { allowed: false, reason: `monthly limit of ${wallet.monthlyLimit}` };
  }

  return { allowed: true };
}

function formatWallet(w: any) {
  return {
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
  };
}
