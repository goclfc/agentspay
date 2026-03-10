import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { generateApiKey } from '../utils/apiKey';
import { ConflictError, NotFoundError, BadRequestError, InsufficientFundsError } from '../utils/errors';
import * as stripeService from './stripe.service';

export async function register(name: string, email: string, password: string, category?: string) {
  const existing = await prisma.merchant.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Email already registered as merchant');

  const { key, hash, prefix } = generateApiKey('MERCHANT');

  // Create Stripe Connected Account
  const stripeAccount = await stripeService.createConnectedAccount(email);
  const accountLink = await stripeService.createAccountLink(stripeAccount.id);

  const merchant = await prisma.merchant.create({
    data: {
      name,
      email,
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      stripeAccountId: stripeAccount.id,
      category,
      status: 'ACTIVE',
    },
  });

  return {
    merchant_id: merchant.id,
    api_key: key,
    onboarding_url: accountLink.url,
  };
}

export async function getProfile(merchantId: string) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new NotFoundError('Merchant');

  return {
    merchant_id: merchant.id,
    name: merchant.name,
    balance: merchant.balance.toString(),
    status: merchant.status,
    onboarding_complete: merchant.onboardingComplete,
  };
}

export async function getBalance(merchantId: string) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new NotFoundError('Merchant');

  return {
    available: merchant.balance.toString(),
    pending: '0.00',
  };
}

export async function withdraw(merchantId: string, amount?: number) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new NotFoundError('Merchant');
  if (!merchant.onboardingComplete) throw new BadRequestError('Complete Stripe onboarding before withdrawing');
  if (!merchant.stripeAccountId) throw new BadRequestError('No Stripe account linked');

  const withdrawAmount = amount || Number(merchant.balance);
  if (merchant.balance.lessThan(withdrawAmount)) throw new InsufficientFundsError();

  // Create Stripe transfer
  const transfer = await stripeService.createTransfer(
    withdrawAmount,
    merchant.stripeAccountId,
    { merchantId }
  );

  await prisma.merchant.update({
    where: { id: merchantId },
    data: { balance: { decrement: withdrawAmount } },
  });

  return {
    payout_id: transfer.id,
    amount: withdrawAmount.toFixed(2),
    estimated_arrival: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function listTransactions(merchantId: string, opts: { from?: string; to?: string; limit: number; cursor?: string }) {
  const where: any = { merchantId };
  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) where.createdAt.gte = new Date(opts.from);
    if (opts.to) where.createdAt.lte = new Date(opts.to);
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
      created_at: t.createdAt.toISOString(),
    })),
    cursor: hasMore ? data[data.length - 1].id : null,
    has_more: hasMore,
  };
}

export async function getOnboardingLink(merchantId: string) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant || !merchant.stripeAccountId) throw new NotFoundError('Merchant');

  const link = await stripeService.createAccountLink(merchant.stripeAccountId);
  return { onboarding_url: link.url };
}
