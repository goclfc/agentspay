import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { generateApiKey } from '../utils/apiKey';
import { ConflictError, UnauthorizedError, NotFoundError } from '../utils/errors';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

function issueTokens(user: { id: string; email: string; tier: string }) {
  const token = jwt.sign(
    { userId: user.id, email: user.email, tier: user.tier },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY as any }
  );
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  return { token, refresh_token: refreshToken, expires_in: 900 }; // 15min = 900s
}

export async function register(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const { key, hash, prefix } = generateApiKey('MASTER');

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      apiKeys: {
        create: { keyHash: hash, keyPrefix: prefix, label: 'default' },
      },
    },
  });

  return { user_id: user.id, master_api_key: key };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  return issueTokens({ id: user.id, email: user.email, tier: user.tier });
}

export async function refreshToken(_refreshToken: string) {
  // In a production system, refresh tokens would be stored in the DB.
  // For MVP, we'll just re-issue from the JWT embedded info.
  // This is a simplified implementation.
  throw new UnauthorizedError('Refresh token flow requires implementation with stored tokens');
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  return {
    user_id: user.id,
    email: user.email,
    platform_balance: user.platformBalance.toString(),
    tier: user.tier,
    created_at: user.createdAt.toISOString(),
  };
}

export async function createApiKey(userId: string, label?: string) {
  const { key, hash, prefix } = generateApiKey('MASTER');

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      keyHash: hash,
      keyPrefix: prefix,
      label: label || 'default',
    },
  });

  return { key_id: apiKey.id, api_key: key, prefix };
}

export async function revokeApiKey(userId: string, keyId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });
  if (!apiKey) throw new NotFoundError('API key');

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { revoked: true },
  });

  return { revoked: true };
}
