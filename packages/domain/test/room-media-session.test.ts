import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveRoomMediaSessionDecision,
  initialRoomBrainClientSyncState,
  type MediaRole,
  type RoomBrainClientSyncState
} from '../src/index.ts';

const publishRoles: MediaRole[] = ['host', 'moderator', 'speaker'];

for (const role of publishRoles) {
  test(`${role} may publish audio from authoritative Room Brain state`, () => {
    const decision = deriveRoomMediaSessionDecision(synchronized(role), 'user-1');

    assert.equal(decision.shouldJoinSfu, true);
    assert.equal(decision.mayPublishAudio, true);
    assert.equal(decision.mustUnpublish, false);
    assert.equal(decision.role, role);
  });
}

test('viewer joins subscribe-only and cannot publish audio', () => {
  const decision = deriveRoomMediaSessionDecision(synchronized('viewer'), 'user-1');

  assert.equal(decision.shouldJoinSfu, true);
  assert.equal(decision.mayPublishAudio, false);
  assert.equal(decision.mustUnpublish, true);
});

test('missing participant fails closed despite a synchronized snapshot', () => {
  const decision = deriveRoomMediaSessionDecision(synchronized(null), 'user-1');

  assert.equal(decision.shouldJoinSfu, false);
  assert.equal(decision.shouldLeaveSfu, true);
  assert.equal(decision.authoritySequence, 1);
});

test('awaiting and resync states fail closed even when stale room data had a speaker', () => {
  const staleRoom = synchronized('speaker').room;
  const states: RoomBrainClientSyncState[] = [
    initialRoomBrainClientSyncState(),
    { status: 'resync_required', room: staleRoom }
  ];

  for (const state of states) {
    const decision = deriveRoomMediaSessionDecision(state, 'user-1');
    assert.equal(decision.shouldJoinSfu, false);
    assert.equal(decision.shouldLeaveSfu, true);
    assert.equal(decision.mayPublishAudio, false);
    assert.equal(decision.mustUnpublish, true);
    assert.equal(decision.authoritySequence, null);
  }
});

function synchronized(role: MediaRole | null): Extract<RoomBrainClientSyncState, { status: 'synchronized' }> {
  return {
    status: 'synchronized',
    room: {
      sequence: 1,
      locked: false,
      participants: role
        ? { 'user-1': { userId: 'user-1', role } }
        : {},
      speakerQueue: [],
      reactionBuckets: {}
    }
  };
}
