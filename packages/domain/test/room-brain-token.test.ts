import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRoomBrainToken,
  verifyRoomBrainToken,
  type RoomBrainTokenPayload
} from '../src/room-brain-token.ts';

const secret = 'ponder-room-brain-test-secret-32-bytes-minimum';
const payload: RoomBrainTokenPayload = {
  v: 1,
  roomId: 'room-123',
  userId: 'user-456',
  role: 'viewer',
  connectionId: 'connection-789',
  exp: 2_000_000_000
};

test('signed Room Brain token verifies to the original payload', async () => {
  const token = await createRoomBrainToken(payload, secret);
  const verified = await verifyRoomBrainToken(token, secret, 1_900_000_000);
  assert.deepEqual(verified, payload);
});

test('tampered token body is rejected', async () => {
  const token = await createRoomBrainToken(payload, secret);
  const [body, signature] = token.split('.');
  const replacement = body!.endsWith('A') ? 'B' : 'A';
  const tampered = body!.slice(0, -1) + replacement + '.' + signature;

  await assert.rejects(
    () => verifyRoomBrainToken(tampered, secret, 1_900_000_000),
    /signature/
  );
});

test('expired token is rejected', async () => {
  const token = await createRoomBrainToken(
    { ...payload, exp: 1_900_000_000 },
    secret
  );

  await assert.rejects(
    () => verifyRoomBrainToken(token, secret, 1_900_000_001),
    /Expired/
  );
});

test('short signing secret is rejected', async () => {
  await assert.rejects(
    () => createRoomBrainToken(payload, 'too-short'),
    /at least 32/
  );
});

test('malformed token is rejected', async () => {
  await assert.rejects(
    () => verifyRoomBrainToken('not-a-token', secret),
    /Malformed/
  );
});
