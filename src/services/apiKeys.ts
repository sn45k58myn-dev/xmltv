import crypto from 'node:crypto';
import { prisma } from '../db/prisma';

export type ApiKeyRole = 'admin' | 'operator' | 'viewer';

const validRoles = new Set<ApiKeyRole>(['admin', 'operator', 'viewer']);

export function normalizeApiKeyRole(value: unknown): ApiKeyRole {
  return validRoles.has(value as ApiKeyRole)
    ? value as ApiKeyRole
    : 'viewer';
}

export function hashApiKey(apiKey: string) {
  return crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex');
}

function createRawApiKey() {
  return `ak_${crypto.randomBytes(32).toString('base64url')}`;
}

export function maskApiKeyPrefix(prefix: string) {
  return `${prefix}...`;
}

export async function createApiKey(input: {
  name: string;
  role?: ApiKeyRole;
}) {
  const key = createRawApiKey();
  const prefix = key.slice(0, 12);
  const apiKey = await prisma.apiKey.create({
    data: {
      name: input.name,
      role: input.role ?? 'viewer',
      prefix,
      hash: hashApiKey(key)
    }
  });

  return {
    key,
    apiKey
  };
}

export async function validateApiKey(apiKey: string) {
  const hash = hashApiKey(apiKey);
  const updated = await prisma.apiKey.updateMany({
    where: {
      hash,
      active: true
    },
    data: {
      requests: {
        increment: 1
      },
      lastUsedAt: new Date()
    }
  });

  if (updated.count !== 1) {
    return null;
  }

  const stored = await prisma.apiKey.findUnique({
    where: {
      hash
    }
  });

  if (!stored?.active) {
    return null;
  }

  return {
    id: stored.id,
    name: stored.name,
    role: normalizeApiKeyRole(stored.role)
  };
}

export function maskApiKey<T extends {
  hash: string;
  prefix: string;
}>(apiKey: T) {
  const {
    hash: _hash,
    ...rest
  } = apiKey;

  return {
    ...rest,
    keyPreview: maskApiKeyPrefix(apiKey.prefix)
  };
}
