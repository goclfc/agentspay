import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';
import * as stripeService from './stripe.service';
import { checkSpendingLimits } from './wallet.service';
import * as webhookService from './webhook.service';

// ──────────────────────────────────────
// Cardholder Management
// ──────────────────────────────────────

export async function ensureCardholder(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  if (user.stripeCardholderId) return user.stripeCardholderId;

  const cardholder = await stripeService.createCardholder({
    name: user.email.split('@')[0],
    email: user.email,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCardholderId: cardholder.id },
  });

  return cardholder.id;
}

// ──────────────────────────────────────
// Card Creation
// ──────────────────────────────────────

export async function createCardForWallet(walletId: string, userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true, issuingCard: true },
  });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();
  if (wallet.status !== 'ACTIVE') throw new BadRequestError('Wallet must be active');
  if (wallet.issuingCard) throw new BadRequestError('Wallet already has a card');

  const cardholderId = await ensureCardholder(userId);

  const stripeCard = await stripeService.createIssuingCard(
    cardholderId,
    wallet.currency.toLowerCase(),
    { wallet_id: walletId, agent_id: wallet.agentId },
  );

  const issuingCard = await prisma.issuingCard.create({
    data: {
      walletId,
      stripeCardId: stripeCard.id,
      stripeCardholderId: cardholderId,
      last4: stripeCard.last4,
      brand: stripeCard.brand || 'Visa',
      expMonth: stripeCard.exp_month,
      expYear: stripeCard.exp_year,
      status: stripeCard.status,
    },
  });

  return {
    card_id: issuingCard.id,
    wallet_id: walletId,
    last4: issuingCard.last4,
    brand: issuingCard.brand,
    exp_month: issuingCard.expMonth,
    exp_year: issuingCard.expYear,
    status: issuingCard.status,
  };
}

// ──────────────────────────────────────
// Card Details
// ──────────────────────────────────────

export async function getCardInfo(walletId: string, userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true, issuingCard: true },
  });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();
  if (!wallet.issuingCard) throw new BadRequestError('Wallet has no card');

  return {
    card_id: wallet.issuingCard.id,
    wallet_id: walletId,
    last4: wallet.issuingCard.last4,
    brand: wallet.issuingCard.brand,
    exp_month: wallet.issuingCard.expMonth,
    exp_year: wallet.issuingCard.expYear,
    status: wallet.issuingCard.status,
  };
}

export async function getCardDetails(walletId: string, agentId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { issuingCard: true },
  });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agentId !== agentId) throw new ForbiddenError();
  if (!wallet.issuingCard) throw new BadRequestError('Wallet has no card');
  if (wallet.status !== 'ACTIVE') throw new BadRequestError('Wallet is not active');

  const stripeCard = await stripeService.getIssuingCardDetails(wallet.issuingCard.stripeCardId);

  return {
    card_id: wallet.issuingCard.id,
    wallet_id: walletId,
    number: (stripeCard as any).number,
    cvc: (stripeCard as any).cvc,
    exp_month: stripeCard.exp_month,
    exp_year: stripeCard.exp_year,
    last4: stripeCard.last4,
    brand: stripeCard.brand,
  };
}

// ──────────────────────────────────────
// Card Status Management
// ──────────────────────────────────────

export async function freezeCard(walletId: string, userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true, issuingCard: true },
  });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();
  if (!wallet.issuingCard) throw new BadRequestError('Wallet has no card');

  await stripeService.updateIssuingCardStatus(wallet.issuingCard.stripeCardId, 'inactive');
  await prisma.issuingCard.update({
    where: { id: wallet.issuingCard.id },
    data: { status: 'inactive' },
  });

  return { card_id: wallet.issuingCard.id, status: 'inactive' };
}

export async function unfreezeCard(walletId: string, userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true, issuingCard: true },
  });
  if (!wallet) throw new NotFoundError('Wallet');
  if (wallet.agent.userId !== userId) throw new ForbiddenError();
  if (!wallet.issuingCard) throw new BadRequestError('Wallet has no card');

  await stripeService.updateIssuingCardStatus(wallet.issuingCard.stripeCardId, 'active');
  await prisma.issuingCard.update({
    where: { id: wallet.issuingCard.id },
    data: { status: 'active' },
  });

  return { card_id: wallet.issuingCard.id, status: 'active' };
}

// ──────────────────────────────────────
// Authorization Webhook Handler
// ──────────────────────────────────────

export async function handleIssuingAuthorization(authorization: any) {
  const stripeCardId = authorization.card?.id;
  if (!stripeCardId) {
    await stripeService.declineAuthorization(authorization.id);
    return;
  }

  const issuingCard = await prisma.issuingCard.findUnique({
    where: { stripeCardId },
    include: { wallet: { include: { agent: true } } },
  });

  if (!issuingCard) {
    await stripeService.declineAuthorization(authorization.id);
    return;
  }

  const wallet = issuingCard.wallet;
  const amountInDollars = authorization.amount / 100; // Stripe sends cents

  // Check wallet is active
  if (wallet.status !== 'ACTIVE') {
    await stripeService.declineAuthorization(authorization.id);
    return;
  }

  // Check card is active
  if (issuingCard.status !== 'active') {
    await stripeService.declineAuthorization(authorization.id);
    return;
  }

  // Check wallet not expired
  if (wallet.expiresAt && wallet.expiresAt < new Date()) {
    await stripeService.declineAuthorization(authorization.id);
    return;
  }

  // Check spending limits
  const limitCheck = await checkSpendingLimits(wallet.id, amountInDollars);
  if (!limitCheck.allowed) {
    await stripeService.declineAuthorization(authorization.id);
    return;
  }

  // Check balance and process (with row locking)
  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<any[]>`
        SELECT * FROM wallets WHERE id = ${wallet.id} FOR UPDATE
      `;
      const lockedWallet = locked[0];
      if (!lockedWallet || new Decimal(lockedWallet.balance).lessThan(amountInDollars)) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // Debit wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amountInDollars } },
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          type: 'CARD_PAYMENT',
          status: 'COMPLETED',
          amount: new Decimal(amountInDollars),
          fee: new Decimal(0),
          walletId: wallet.id,
          senderAgentId: wallet.agentId,
          stripeAuthorizationId: authorization.id,
          description: `Card payment: ${authorization.merchant_data?.name || 'Unknown merchant'}`,
          metadata: {
            stripe_merchant_name: authorization.merchant_data?.name,
            stripe_merchant_category: authorization.merchant_data?.category,
            stripe_merchant_city: authorization.merchant_data?.city,
          } as any,
          completedAt: new Date(),
        },
      });

      // Update spend log
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await tx.spendLog.upsert({
        where: { walletId_date: { walletId: wallet.id, date: today } },
        create: { walletId: wallet.id, date: today, daily: new Decimal(amountInDollars), monthly: new Decimal(amountInDollars) },
        update: { daily: { increment: amountInDollars }, monthly: { increment: amountInDollars } },
      });
    });

    // Approve with Stripe
    await stripeService.approveAuthorization(authorization.id);

    // Fire webhook to user
    webhookService.deliver(wallet.agent.userId, {
      type: 'card.authorization.approved',
      data: {
        type: 'CARD_PAYMENT',
        wallet_id: wallet.id,
        agent_id: wallet.agentId,
        amount: amountInDollars.toString(),
        merchant: authorization.merchant_data?.name || 'Unknown',
        authorization_id: authorization.id,
      },
    });
  } catch (err: any) {
    await stripeService.declineAuthorization(authorization.id);

    webhookService.deliver(wallet.agent.userId, {
      type: 'card.authorization.declined',
      data: {
        wallet_id: wallet.id,
        agent_id: wallet.agentId,
        amount: amountInDollars.toString(),
        reason: err.message === 'INSUFFICIENT_FUNDS' ? 'insufficient_funds' : 'error',
      },
    });
  }
}

// ──────────────────────────────────────
// Authorization Reversal Handler
// ──────────────────────────────────────

export async function handleIssuingAuthorizationUpdate(authorization: any) {
  if (authorization.status !== 'reversed') return;

  const stripeCardId = authorization.card?.id;
  if (!stripeCardId) return;

  const issuingCard = await prisma.issuingCard.findUnique({
    where: { stripeCardId },
  });
  if (!issuingCard) return;

  const amountReversed = authorization.amount / 100;

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { id: issuingCard.walletId },
      data: { balance: { increment: amountReversed } },
    });

    await tx.transaction.create({
      data: {
        type: 'REFUND',
        status: 'COMPLETED',
        amount: new Decimal(amountReversed),
        walletId: issuingCard.walletId,
        stripeAuthorizationId: authorization.id,
        description: `Card reversal: ${authorization.merchant_data?.name || 'Unknown'}`,
        completedAt: new Date(),
      },
    });
  });
}
