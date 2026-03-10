import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import type { WebhookEventType } from '@usectl/shared';

export async function registerEndpoint(userId: string, url: string, events: string[]) {
  const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;

  const endpoint = await prisma.webhookEndpoint.create({
    data: { userId, url, secret, events, active: true },
  });

  return {
    webhook_id: endpoint.id,
    url: endpoint.url,
    secret: endpoint.secret,
    events: endpoint.events,
  };
}

export async function listEndpoints(userId: string) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return endpoints.map((e) => ({
    webhook_id: e.id,
    url: e.url,
    events: e.events,
    active: e.active,
  }));
}

export async function deleteEndpoint(userId: string, endpointId: string) {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, userId },
  });
  if (!endpoint) throw new NotFoundError('Webhook endpoint');

  await prisma.webhookEndpoint.delete({ where: { id: endpointId } });
  return { deleted: true };
}

export async function deliver(userId: string, event: { type: WebhookEventType; data: Record<string, unknown> }) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      userId,
      active: true,
      events: { has: event.type },
    },
  });

  const payload = {
    id: `evt_${crypto.randomBytes(12).toString('base64url')}`,
    type: event.type,
    created_at: new Date().toISOString(),
    data: event.data,
  };

  const payloadStr = JSON.stringify(payload);

  for (const endpoint of endpoints) {
    deliverToEndpoint(endpoint.url, endpoint.secret, payloadStr).catch(() => {
      // Silently fail — webhook delivery is best-effort with retries
    });
  }
}

async function deliverToEndpoint(url: string, secret: string, payload: string, attempt = 1): Promise<void> {
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AgentsPay-Signature': `sha256=${signature}`,
      },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok && attempt < 4) {
      const delay = Math.pow(5, attempt) * 1000; // 5s, 25s, 125s
      await new Promise((r) => setTimeout(r, delay));
      return deliverToEndpoint(url, secret, payload, attempt + 1);
    }
  } catch {
    if (attempt < 4) {
      const delay = Math.pow(5, attempt) * 1000;
      await new Promise((r) => setTimeout(r, delay));
      return deliverToEndpoint(url, secret, payload, attempt + 1);
    }
  }
}
