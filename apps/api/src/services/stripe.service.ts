import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2023-10-16' as any,
});

export { stripe };

export async function createCustomer(email: string): Promise<Stripe.Customer> {
  return stripe.customers.create({ email });
}

export async function createCheckoutSession(
  customerId: string,
  amount: number,
  metadata: Record<string, string>
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'AgentsPay Platform Deposit' },
        unit_amount: Math.round(amount * 100), // cents
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${process.env.API_URL || 'http://localhost:80'}/v1/funding/success`,
    cancel_url: `${process.env.API_URL || 'http://localhost:80'}/v1/funding/cancel`,
    metadata,
  });
}

export async function createConnectedAccount(email: string): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: 'express',
    email,
    capabilities: {
      transfers: { requested: true },
    },
  });
}

export async function createAccountLink(accountId: string): Promise<Stripe.AccountLink> {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.API_URL || 'http://localhost:80'}/v1/merchants/onboarding-refresh`,
    return_url: `${process.env.API_URL || 'http://localhost:80'}/v1/merchants/onboarding-complete`,
    type: 'account_onboarding',
  });
}

export async function createTransfer(
  amount: number,
  destinationAccountId: string,
  metadata?: Record<string, string>
): Promise<Stripe.Transfer> {
  return stripe.transfers.create({
    amount: Math.round(amount * 100),
    currency: 'usd',
    destination: destinationAccountId,
    metadata,
  });
}

export function constructWebhookEvent(body: Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder';
  return stripe.webhooks.constructEvent(body, signature, secret);
}

// ──────────────────────────────────────
// STRIPE ISSUING (virtual cards)
// ──────────────────────────────────────

export async function createCardholder(opts: {
  name: string;
  email: string;
}): Promise<Stripe.Issuing.Cardholder> {
  return stripe.issuing.cardholders.create({
    name: opts.name,
    email: opts.email,
    type: 'individual',
    billing: {
      address: {
        line1: '123 Test Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
        country: 'US',
      },
    },
    status: 'active',
  } as any);
}

export async function createIssuingCard(
  cardholderId: string,
  currency: string = 'usd',
  metadata?: Record<string, string>
): Promise<Stripe.Issuing.Card> {
  return stripe.issuing.cards.create({
    cardholder: cardholderId,
    type: 'virtual',
    currency,
    status: 'active',
    metadata,
  } as any);
}

export async function getIssuingCardDetails(
  cardId: string
): Promise<Stripe.Issuing.Card> {
  return stripe.issuing.cards.retrieve(cardId, {
    expand: ['number', 'cvc'],
  } as any);
}

export async function updateIssuingCardStatus(
  cardId: string,
  status: 'active' | 'inactive' | 'canceled'
): Promise<Stripe.Issuing.Card> {
  return stripe.issuing.cards.update(cardId, { status } as any);
}

export async function approveAuthorization(
  authorizationId: string,
  amount?: number
): Promise<Stripe.Issuing.Authorization> {
  return stripe.issuing.authorizations.approve(authorizationId, {
    ...(amount !== undefined ? { amount } : {}),
  } as any);
}

export async function declineAuthorization(
  authorizationId: string
): Promise<Stripe.Issuing.Authorization> {
  return stripe.issuing.authorizations.decline(authorizationId);
}
