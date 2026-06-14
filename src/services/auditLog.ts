import { Request } from 'express';
import { prisma } from '../db/prisma';
import { boundedLimit } from '../utils/limits';

type AuditEvent = {
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
};

export function maskSecret(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.length <= 12) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function maskExportToken<T extends { token: string }>(token: T) {
  const {
    token: _token,
    ...rest
  } = token;

  return {
    ...rest,
    tokenPreview: maskSecret(token.token)
  };
}

function actorFromRequest(req: Request) {
  return req.auth?.actor ?? req.requestId ?? req.ip;
}

export async function recordAuditEvent(
  req: Request,
  event: AuditEvent
) {
  try {
    await prisma.auditLog.create({
      data: {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? undefined,
        actor: actorFromRequest(req),
        metadata: event.metadata === undefined
          ? undefined
          : JSON.stringify(event.metadata)
      }
    });
  } catch (error) {
    console.error(`Unable to record audit event ${event.action}:`, error);
  }
}

export async function getAuditEvents(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: {
      createdAt: 'desc'
    },
    take: boundedLimit(limit, {
      defaultValue: 100,
      max: 500
    })
  });
}

export async function clearAuditEvents() {
  return prisma.auditLog.deleteMany();
}
