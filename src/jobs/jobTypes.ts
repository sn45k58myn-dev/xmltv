export type JobType = 'manual-imports';

const KNOWN_JOB_TYPES = new Set<string>([
  'manual-imports'
]);
export const MAX_JOB_PAYLOAD_BYTES = 64 * 1024;

export function assertKnownJobType(type: string): asserts type is JobType {
  if (!KNOWN_JOB_TYPES.has(type)) {
    throw new Error(`Unknown queued job type: ${type}`);
  }
}

export function serializeJobPayload(payload: unknown) {
  if (payload == null) {
    return undefined;
  }

  const serialized = JSON.stringify(payload);

  if (Buffer.byteLength(
    serialized,
    'utf8'
  ) > MAX_JOB_PAYLOAD_BYTES) {
    throw new Error(`Queued job payload exceeds ${MAX_JOB_PAYLOAD_BYTES} bytes.`);
  }

  return serialized;
}

export function assertJobPayloadSize(payload: unknown) {
  serializeJobPayload(payload ?? {});
}
