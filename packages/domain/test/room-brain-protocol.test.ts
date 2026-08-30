import assert from 'node:assert/strict';
import test from 'node:test';
import { initialRoomBrainState } from '../src/room-brain.ts';
import {
  applyRoomBrainEnvelope,
  buildRoomBrainSnapshot,
  initialRoomBrainProtocolState,
  type RoomBrainClientEnvelope
} from '../src/room-brain-protocol.ts';

function envelope(
  commandId: string,
  command: RoomBrainClientEnvelope['command'],
  expectedSequence: number
): RoomBrainClientEnvelope {
  return {
    version: 1,
    commandId,
    expectedSequence,
    command
  };
}

test('retrying the same command ID does not apply the command twice', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());

  const join = applyRoomBrainEnvelope(
    protocol,
    envelope('cmd_join_0001', { type: 'join', userId: 'viewer', role: 'viewer' }, 0)
  );
  assert.equal(join.accepted, true);
  protocol = join.protocol;

  const firstReaction = applyRoomBrainEnvelope(
    protocol,
    envelope('cmd_react_001', { type: 'react', userId: 'viewer', reaction: '🔥' }, 1)
  );
  assert.equal(firstReaction.accepted, true);
  protocol = firstReaction.protocol;

  const retry = applyRoomBrainEnvelope(
    protocol,
    envelope('cmd_react_001', { type: 'react', userId: 'viewer', reaction: '🔥' }, 1)
  );

  assert.equal(retry.accepted, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.protocol.room.sequence, 2);
  assert.equal(retry.protocol.room.reactionBuckets['🔥'], 1);
});

test('stale optimistic sequence is rejected without mutating room state', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const joined = applyRoomBrainEnvelope(
    protocol,
    envelope('cmd_join_0002', { type: 'join', userId: 'host', role: 'host' }, 0)
  );
  protocol = joined.protocol;

  const stale = applyRoomBrainEnvelope(
    protocol,
    envelope('cmd_lock_0001', { type: 'set_room_lock', actorUserId: 'host', locked: true }, 0)
  );

  assert.equal(stale.accepted, false);
  assert.equal(stale.duplicate, false);
  if (!stale.accepted) assert.equal(stale.reason, 'sequence_mismatch');
  assert.equal(stale.protocol.room.locked, false);
  assert.equal(stale.protocol.room.sequence, 1);
});

test('recent command memory is bounded', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  for (let index = 0; index < 4; index += 1) {
    const result = applyRoomBrainEnvelope(
      protocol,
      envelope(
        `cmd_join_00${index + 10}`,
        { type: 'join', userId: `user-${index}`, role: 'viewer' },
        index
      ),
      3
    );
    assert.equal(result.accepted, true);
    protocol = result.protocol;
  }

  assert.equal(protocol.recentCommandIds.length, 3);
  assert.deepEqual(protocol.recentCommandIds, ['cmd_join_0011', 'cmd_join_0012', 'cmd_join_0013']);
});

test('evicted command ID still cannot be replayed because its sequence guard is stale', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const original = envelope('cmd_join_0100', { type: 'join', userId: 'user-0', role: 'viewer' }, 0);

  protocol = applyRoomBrainEnvelope(protocol, original, 2).protocol;
  protocol = applyRoomBrainEnvelope(
    protocol,
    envelope('cmd_join_0101', { type: 'join', userId: 'user-1', role: 'viewer' }, 1),
    2
  ).protocol;
  protocol = applyRoomBrainEnvelope(
    protocol,
    envelope('cmd_join_0102', { type: 'join', userId: 'user-2', role: 'viewer' }, 2),
    2
  ).protocol;

  assert.equal(protocol.recentCommandIds.includes(original.commandId), false);

  const replay = applyRoomBrainEnvelope(protocol, original, 2);
  assert.equal(replay.accepted, false);
  assert.equal(replay.duplicate, false);
  if (!replay.accepted) assert.equal(replay.reason, 'sequence_mismatch');
  assert.equal(replay.protocol.room.sequence, 3);
});

test('invalid command IDs are rejected before state mutation', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  assert.throws(
    () => applyRoomBrainEnvelope(protocol, envelope('bad', { type: 'join', userId: 'viewer', role: 'viewer' }, 0)),
    /Invalid Room Brain command ID/
  );
  assert.equal(protocol.room.sequence, 0);
});

test('snapshot is detached from mutable collections', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const joined = applyRoomBrainEnvelope(
    protocol,
    envelope('cmd_join_0099', { type: 'join', userId: 'host', role: 'host' }, 0)
  );
  protocol = joined.protocol;

  const snapshot = buildRoomBrainSnapshot(protocol.room);
  snapshot.speakerQueue.push('fake-user');
  snapshot.reactionBuckets['🔥'] = 999;

  assert.deepEqual(protocol.room.speakerQueue, []);
  assert.equal(protocol.room.reactionBuckets['🔥'], undefined);
});
