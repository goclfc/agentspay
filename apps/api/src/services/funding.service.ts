import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { InsufficientFundsError, NotFoundError } from '../utils/errors';
import * as stripeService from './stripe.service';

export async function deposit(userId: string, amount: number, paymentMethodId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  // Ensure user has a Stripe customer
  let stripeCustomerId = user.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripeService.createCustomer(user.email);
    stripeCustomerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } });
  }

  // Create Checkout Session
  const session = await stripeService.createCheckoutSession(
    stripeCustomerId,
    amount,
    { userId, type: 'deposit' }
  );

  const funding = await prisma.fundingTransaction.create({
    data: {
      userId,
      amount: new Decimal(amount),
      direction: 'IN',
      status: 'PENDING',
      stripePaymentId: session.id,
    },
  });

  return {
    funding_id: funding.id,
    amount: amount.toFixed(2),
    status: 'PENDING',
    checkout_url: session.url,
  };
}

export async function withdraw(userId: string, amount: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  if (user.platformBalance.lessThan(amount)) throw new InsufficientFundsError();

  const funding = await prisma.$transaction(async (tx) => {
    const locked = await tx.user.update({
      where: { id: userId },
      data: { platformBalance: { decrement: amount } },
    });
    if (locked.platformBalance.lessThan(0)) {
      throw new InsufficientFundsError();
    }
    return tx.fundingTransaction.create({
      data: {
        userId,
        amount: new Decimal(amount),
        direction: 'OUT',
        status: 'PENDING',
      },
    });
  });

  return {
    funding_id: funding.id,
    amount: amount.toFixed(2),
    status: 'PENDING',
    estimated_arrival: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function getBalance(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const pendingDeposits = await prisma.fundingTransaction.aggregate({
    where: { userId, direction: 'IN', status: 'PENDING' },
    _sum: { amount: true },
  });

  return {
    available: user.platformBalance.toString(),
    pending: (pendingDeposits._sum.amount || new Decimal(0)).toString(),
  };
}

export async function handleStripeWebhook(eventType: string, data: any) {
  if (eventType === 'checkout.session.completed') {
    const sessionId = data.id;
    const userId = data.metadata?.userId;
    if (!userId) return;

    const funding = await prisma.fundingTransaction.findFirst({
      where: { stripePaymentId: sessionId, status: 'PENDING' },
    });
    if (!funding) return;

    await prisma.$transaction([
      prisma.fundingTransaction.update({
        where: { id: funding.id },
        data: { status: 'COMPLETED' },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { platformBalance: { increment: funding.amount } },
      }),
    ]);
  }
}
