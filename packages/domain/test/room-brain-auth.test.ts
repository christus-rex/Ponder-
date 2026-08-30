import assert from 'node:assert/strict';
import test from 'node:test';
import { initialRoomBrainState } from '../src/room-brain.ts';
import { applyAuthorizedRoomBrainEnvelope } from '../src/room-brain-auth.ts';
import { initialRoomBrainProtocolState, type RoomBrainClientEnvelope } from '../src/room-brain-protocol.ts';

function envelope(commandId: string, command: RoomBrainClientEnvelope['command']): RoomBrainClientEnvelope {
  return { version: 1, commandId, command };
}

test('authenticated viewer cannot join as host', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  assert.throws(
    () =>
      applyAuthorizedRoomBrainEnvelope(
        protocol,
        { userId: 'viewer-1', role: 'viewer' },
        envelope('cmd_join_1001', { type: 'join', userId: 'viewer-1', role: 'host' })
      ),
    /Join role does not match/
  );
});

test('authenticated user cannot issue commands as another user', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  assert.throws(
    () =>
      applyAuthorizedRoomBrainEnvelope(
        protocol,
        { userId: 'viewer-1', role: 'viewer' },
        envelope('cmd_join_1002', { type: 'join', userId: 'viewer-2', role: 'viewer' })
      ),
    /does not match authenticated connection/
  );
});

test('viewer connection cannot use moderator commands', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const joined = applyAuthorizedRoomBrainEnvelope(
    protocol,
    { userId: 'viewer-1', role: 'viewer' },
    envelope('cmd_join_1003', { type: 'join', userId: 'viewer-1', role: 'viewer' })
  );
  protocol = joined.protocol;

  assert.throws(
    () =>
      applyAuthorizedRoomBrainEnvelope(
        protocol,
        { userId: 'viewer-1', role: 'viewer' },
        envelope('cmd_lock_1001', { type: 'set_room_lock', actorUserId: 'viewer-1', locked: true })
      ),
    /Authenticated moderator privilege required/
  );
});

test('authenticated host can issue host command after joining', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const identity = { userId: 'host-1', role: 'host' } as const;

  const joined = applyAuthorizedRoomBrainEnvelope(
    protocol,
    identity,
    envelope('cmd_join_1004', { type: 'join', userId: 'host-1', role: 'host' })
  );
  protocol = joined.protocol;

  const locked = applyAuthorizedRoomBrainEnvelope(
    protocol,
    identity,
    envelope('cmd_lock_1002', { type: 'set_room_lock', actorUserId: 'host-1', locked: true })
  );

  assert.equal(locked.accepted, true);
  assert.equal(locked.protocol.room.locked, true);
});
