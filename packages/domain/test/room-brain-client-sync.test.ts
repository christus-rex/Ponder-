import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRoomBrainServerMessage,
  initialRoomBrainClientSyncState
} from '../src/room-brain-client-sync.ts';
import { buildRoomBrainSnapshot } from '../src/room-brain-protocol.ts';
import { applyRoomBrainCommand, initialRoomBrainState } from '../src/room-brain.ts';

test('initial authoritative snapshot synchronizes a reconnecting client', () => {
  let room = initialRoomBrainState();
  room = applyRoomBrainCommand(room, {
    type: 'join',
    userId: 'host-1',
    role: 'host'
  });

  const state = applyRoomBrainServerMessage(initialRoomBrainClientSyncState(), {
    version: 1,
    type: 'snapshot',
    snapshot: buildRoomBrainSnapshot(room)
  });

  assert.equal(state.status, 'synchronized');
  assert.equal(state.room?.sequence, 1);
  assert.equal(state.room?.participants['host-1']?.role, 'host');
});

test('contiguous state changes advance synchronized state', () => {
  let state = applyRoomBrainServerMessage(initialRoomBrainClientSyncState(), {
    version: 1,
    type: 'snapshot',
    snapshot: buildRoomBrainSnapshot(initialRoomBrainState())
  });

  state = applyRoomBrainServerMessage(state, {
    version: 1,
    type: 'state_changed',
    sequence: 1,
    command: { type: 'join', userId: 'viewer-1', role: 'viewer' }
  });

  assert.equal(state.status, 'synchronized');
  assert.equal(state.room?.sequence, 1);
  assert.equal(state.room?.participants['viewer-1']?.role, 'viewer');
});

test('sequence gaps force resync instead of applying partial state', () => {
  let state = applyRoomBrainServerMessage(initialRoomBrainClientSyncState(), {
    version: 1,
    type: 'snapshot',
    snapshot: buildRoomBrainSnapshot(initialRoomBrainState())
  });

  state = applyRoomBrainServerMessage(state, {
    version: 1,
    type: 'state_changed',
    sequence: 2,
    command: { type: 'join', userId: 'viewer-1', role: 'viewer' }
  });

  assert.equal(state.status, 'resync_required');
  assert.equal(state.room?.sequence, 0);
  assert.equal(state.room?.participants['viewer-1'], undefined);
});

test('stale snapshots never regress an already synchronized client', () => {
  let room = initialRoomBrainState();
  const stale = buildRoomBrainSnapshot(room);
  room = applyRoomBrainCommand(room, {
    type: 'join',
    userId: 'host-1',
    role: 'host'
  });

  let state = applyRoomBrainServerMessage(initialRoomBrainClientSyncState(), {
    version: 1,
    type: 'snapshot',
    snapshot: buildRoomBrainSnapshot(room)
  });
  state = applyRoomBrainServerMessage(state, {
    version: 1,
    type: 'snapshot',
    snapshot: stale
  });

  assert.equal(state.status, 'synchronized');
  assert.equal(state.room?.sequence, 1);
  assert.equal(state.room?.participants['host-1']?.role, 'host');
});

test('resync_required snapshot recovers a client after a detected gap', () => {
  let state = applyRoomBrainServerMessage(initialRoomBrainClientSyncState(), {
    version: 1,
    type: 'snapshot',
    snapshot: buildRoomBrainSnapshot(initialRoomBrainState())
  });
  state = applyRoomBrainServerMessage(state, {
    version: 1,
    type: 'state_changed',
    sequence: 3,
    command: { type: 'join', userId: 'viewer-1', role: 'viewer' }
  });
  assert.equal(state.status, 'resync_required');

  let authoritative = initialRoomBrainState();
  authoritative = applyRoomBrainCommand(authoritative, {
    type: 'join',
    userId: 'host-1',
    role: 'host'
  });
  authoritative = applyRoomBrainCommand(authoritative, {
    type: 'join',
    userId: 'viewer-1',
    role: 'viewer'
  });

  state = applyRoomBrainServerMessage(state, {
    version: 1,
    type: 'resync_required',
    commandId: 'cmd_resync_1',
    snapshot: buildRoomBrainSnapshot(authoritative)
  });

  assert.equal(state.status, 'synchronized');
  assert.equal(state.room?.sequence, 2);
  assert.equal(state.room?.participants['viewer-1']?.role, 'viewer');
});
