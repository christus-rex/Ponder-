import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMediaSessionToken,
  verifyMediaSessionToken,
  type MediaSessionTokenPayload
} from '../src/media-session-token.ts';

const secret = 'media-session-test-secret-at-least-32-characters';

function payload(overrides: Partial<MediaSessionTokenPayload> = {}): MediaSessionTokenPayload {
  return {
    v: 1,
    kind: 'ponder-media-session',
    roomId: 'room-1',
    userId: 'user-1',
    role: 'speaker',
    authoritySequence: 17,
    exp: 2_000,
    ...overrides
  };
}

test('media session token preserves authoritative room binding', async () => {
  const token = await createMediaSessionToken(payload(), secret);
  const verified = await verifyMediaSessionToken(token, secret, 1_000);

  assert.deepEqual(verified, payload());
});

test('media session token rejects tampering', async () => {
  const token = await createMediaSessionToken(payload(), secret);
  const [body, signature] = token.split('.');
  const tamperedBody = `${body!.slice(0, -1)}${body!.endsWith('A') ? 'B' : 'A'}`;

  await assert.rejects(
    verifyMediaSessionToken(`${tamperedBody}.${signature}`, secret, 1_000),
    /signature|payload/
  );
});

test('media session token rejects expiry at the boundary', async () => {
  const token = await createMediaSessionToken(payload({ exp: 1_001 }), secret);

  await assert.rejects(
    verifyMediaSessionToken(token, secret, 1_001),
    /Expired media session token/
  );
});

test('media session token rejects invalid authority sequence', async () => {
  await assert.rejects(
    createMediaSessionToken(payload({ authoritySequence: -1 }), secret),
    /Invalid media authority sequence/
  );
});

test('media session token requires a separate strong secret', async () => {
  await assert.rejects(
    createMediaSessionToken(payload(), 'too-short'),
    /at least 32 characters/
  );
});
