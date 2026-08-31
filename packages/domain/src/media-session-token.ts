import type { MediaRole } from './media.ts';

export interface MediaSessionTokenPayload {
  v: 1;
  kind: 'ponder-media-session';
  roomId: string;
  userId: string;
  role: MediaRole;
  authoritySequence: number;
  exp: number;
}

const encoder = new TextEncoder();

export async function createMediaSessionToken(
  payload: MediaSessionTokenPayload,
  secret: string
): Promise<string> {
  validateSecret(secret);
  validatePayload(payload, Number.NEGATIVE_INFINITY);

  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(body, secret);
  return `${body}.${base64UrlEncode(signature)}`;
}

export async function verifyMediaSessionToken(
  token: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000)
): Promise<MediaSessionTokenPayload> {
  validateSecret(secret);

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Malformed media session token');
  }

  const [body, encodedSignature] = parts;
  const signature = base64UrlDecode(encodedSignature);
  const key = await importHmacKey(secret);
  const valid = await globalThis.crypto.subtle.verify(
    'HMAC',
    key,
    toArrayBuffer(signature),
    toArrayBuffer(encoder.encode(body))
  );

  if (!valid) throw new Error('Invalid media session token signature');

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
  } catch {
    throw new Error('Invalid media session token payload');
  }

  validatePayload(payload, nowEpochSeconds);
  return payload;
}

function validatePayload(
  value: unknown,
  nowEpochSeconds: number
): asserts value is MediaSessionTokenPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid media session token payload');
  }

  const payload = value as Record<string, unknown>;
  if (payload.v !== 1 || payload.kind !== 'ponder-media-session') {
    throw new Error('Unsupported media session token');
  }
  if (!validId(payload.roomId)) throw new Error('Invalid media session room ID');
  if (!validId(payload.userId)) throw new Error('Invalid media session user ID');
  if (!validRole(payload.role)) throw new Error('Invalid media session role');
  if (
    !Number.isSafeInteger(payload.authoritySequence) ||
    (payload.authoritySequence as number) < 0
  ) {
    throw new Error('Invalid media authority sequence');
  }
  if (!Number.isSafeInteger(payload.exp) || (payload.exp as number) <= 0) {
    throw new Error('Invalid media session token expiry');
  }
  if ((payload.exp as number) <= nowEpochSeconds) {
    throw new Error('Expired media session token');
  }
}

function validRole(value: unknown): value is MediaRole {
  return (
    value === 'host' ||
    value === 'moderator' ||
    value === 'speaker' ||
    value === 'viewer'
  );
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128;
}

function validateSecret(secret: string): void {
  if (secret.length < 32) {
    throw new Error('Media session auth secret must be at least 32 characters');
  }
}

async function sign(body: string, secret: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    toArrayBuffer(encoder.encode(body))
  );
  return new Uint8Array(signature);
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(encoder.encode(secret)),
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
