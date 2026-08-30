import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimRoomBrainPresence,
  releaseRoomBrainPresence,
  type RoomBrainPresenceRegistry
} from '../src/room-brain-presence.ts';

test('claim tracks multiple active connections for one user', () => {
  let registry: RoomBrainPresenceRegistry = {};
  registry = claimRoomBrainPresence(registry, 'user-1', 'connection-0001').registry;
  registry = claimRoomBrainPresence(registry, 'user-1', 'connection-0002').registry;

  assert.deepEqual(registry['user-1'], ['connection-0001', 'connection-0002']);
});

test('releasing an older connection preserves presence while a replacement is active', () => {
  let registry: RoomBrainPresenceRegistry = {};
  registry = claimRoomBrainPresence(registry, 'user-1', 'connection-0001').registry;
  registry = claimRoomBrainPresence(registry, 'user-1', 'connection-0002').registry;

  const release = releaseRoomBrainPresence(registry, 'user-1', 'connection-0001');

  assert.equal(release.released, true);
  assert.equal(release.hasActiveConnections, true);
  assert.deepEqual(release.registry['user-1'], ['connection-0002']);
});

test('releasing the final connection clears presence ownership', () => {
  const claimed = claimRoomBrainPresence({}, 'user-1', 'connection-0001');
  const release = releaseRoomBrainPresence(
    claimed.registry,
    'user-1',
    'connection-0001'
  );

  assert.equal(release.released, true);
  assert.equal(release.hasActiveConnections, false);
  assert.equal(release.registry['user-1'], undefined);
});

test('duplicate close/error cleanup is idempotent', () => {
  const claimed = claimRoomBrainPresence({}, 'user-1', 'connection-0001');
  const first = releaseRoomBrainPresence(
    claimed.registry,
    'user-1',
    'connection-0001'
  );
  const second = releaseRoomBrainPresence(
    first.registry,
    'user-1',
    'connection-0001'
  );

  assert.equal(second.released, false);
  assert.equal(second.hasActiveConnections, false);
});

test('connection limit bounds per-user presence state', () => {
  let registry: RoomBrainPresenceRegistry = {};
  registry = claimRoomBrainPresence(registry, 'user-1', 'connection-0001', 2).registry;
  registry = claimRoomBrainPresence(registry, 'user-1', 'connection-0002', 2).registry;

  assert.throws(
    () => claimRoomBrainPresence(registry, 'user-1', 'connection-0003', 2),
    /connection limit exceeded/
  );
});
