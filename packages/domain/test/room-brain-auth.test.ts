import assert from 'node:assert/strict';
import test from 'node:test';
import { initialRoomBrainState } from '../src/room-brain.ts';
import { applyAuthorizedRoomBrainEnvelope } from '../src/room-brain-auth.ts';
import { initialRoomBrainProtocolState, type RoomBrainClientEnvelope } from '../src/room-brain-protocol.ts';

function envelope(
  commandId: string,
  command: RoomBrainClientEnvelope['command'],
  expectedSequence: number
): RoomBrainClientEnvelope {
  return { version: 1, commandId, expectedSequence, command };
}

test('authenticated viewer cannot join as host', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  assert.throws(
    () =>
      applyAuthorizedRoomBrainEnvelope(
        protocol,
        { userId: 'viewer-1', role: 'viewer' },
        envelope('cmd_join_1001', { type: 'join', userId: 'viewer-1', role: 'host' }, 0)
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
        envelope('cmd_join_1002', { type: 'join', userId: 'viewer-2', role: 'viewer' }, 0)
      ),
    /does not match authenticated connection/
  );
});

test('viewer connection cannot use moderator commands', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const joined = applyAuthorizedRoomBrainEnvelope(
    protocol,
    { userId: 'viewer-1', role: 'viewer' },
    envelope('cmd_join_1003', { type: 'join', userId: 'viewer-1', role: 'viewer' }, 0)
  );
  protocol = joined.protocol;

  assert.throws(
    () =>
      applyAuthorizedRoomBrainEnvelope(
        protocol,
        { userId: 'viewer-1', role: 'viewer' },
        envelope('cmd_lock_1001', { type: 'set_room_lock', actorUserId: 'viewer-1', locked: true }, 1)
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
    envelope('cmd_join_1004', { type: 'join', userId: 'host-1', role: 'host' }, 0)
  );
  protocol = joined.protocol;

  const locked = applyAuthorizedRoomBrainEnvelope(
    protocol,
    identity,
    envelope('cmd_lock_1002', { type: 'set_room_lock', actorUserId: 'host-1', locked: true }, 1)
  );

  assert.equal(locked.accepted, true);
  assert.equal(locked.protocol.room.locked, true);
});


test('speaker demotion cannot be issued through the ordinary client command path', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  assert.throws(
    () =>
      applyAuthorizedRoomBrainEnvelope(
        protocol,
        { userId: 'host-1', role: 'host' },
        envelope(
          'cmd_demote_1001',
          {
            type: 'demote_speaker',
            actorUserId: 'host-1',
            targetUserId: 'speaker-1'
          },
          0
        )
      ),
    /trusted backend moderation/
  );
});
