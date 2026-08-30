export type RoomBrainTokenRole = 'host' | 'moderator' | 'speaker' | 'viewer';

export interface RoomBrainTokenPayload {
  v: 1;
  roomId: string;
  userId: string;
  role: RoomBrainTokenRole;
  connectionId: string;
  exp: number;
}

const encoder = new TextEncoder();

export async function createRoomBrainToken(
  payload: RoomBrainTokenPayload,
  secret: string
): Promise<string> {
  validateSecret(secret);
  validatePayload(payload, Number.NEGATIVE_INFINITY);

  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(body, secret);
  return `${body}.${base64UrlEncode(signature)}`;
}

export async function verifyRoomBrainToken(
  token: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000)
): Promise<RoomBrainTokenPayload> {
  validateSecret(secret);

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Malformed Room Brain token');
  }

  const [body, encodedSignature] = parts;
  const signature = base64UrlDecode(encodedSignature);
  const key = await importHmacKey(secret);
  const valid = await globalThis.crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    encoder.encode(body)
  );

  if (!valid) throw new Error('Invalid Room Brain token signature');

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
  } catch {
    throw new Error('Invalid Room Brain token payload');
  }

  validatePayload(payload, nowEpochSeconds);
  return payload;
}

function validatePayload(
  value: unknown,
  nowEpochSeconds: number
): asserts value is RoomBrainTokenPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid Room Brain token payload');
  }

  const payload = value as Record<string, unknown>;
  if (payload.v !== 1) throw new Error('Unsupported Room Brain token version');
  if (!validId(payload.roomId)) throw new Error('Invalid Room Brain room ID');
  if (!validId(payload.userId)) throw new Error('Invalid Room Brain user ID');
  if (!validId(payload.connectionId)) throw new Error('Invalid Room Brain connection ID');

  if (
    payload.role !== 'host' &&
    payload.role !== 'moderator' &&
    payload.role !== 'speaker' &&
    payload.role !== 'viewer'
  ) {
    throw new Error('Invalid Room Brain role');
  }

  if (!Number.isSafeInteger(payload.exp) || (payload.exp as number) <= nowEpochSeconds) {
    throw new Error('Expired Room Brain token');
  }
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128;
}

function validateSecret(secret: string): void {
  if (secret.length < 32) {
    throw new Error('Room Brain auth secret must be at least 32 characters');
  }
}

async function sign(body: string, secret: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body)
  );
  return new Uint8Array(signature);
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('Invalid base64url encoding');
  }

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
