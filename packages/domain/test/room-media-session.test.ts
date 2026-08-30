import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveRoomMediaAuthority,
  reconcileRoomMediaSession
} from '../src/room-media-session.ts';
import type { RoomBrainClientSyncState } from '../src/room-brain-client-sync.ts';
import { initialRoomBrainState } from '../src/room-brain.ts';

function synchronized(role: 'host' | 'moderator' | 'speaker' | 'viewer'): RoomBrainClientSyncState {
  const room = initialRoomBrainState();
  room.participants['user-1'] = { userId: 'user-1', role };
  return { status: 'synchronized', room };
}

test('viewer is present but cannot publish audio', () => {
  const authority = deriveRoomMediaAuthority(synchronized('viewer'), 'user-1');

  assert.equal(authority.synchronized, true);
  assert.equal(authority.presentInRoom, true);
  assert.equal(authority.mayPublishAudio, false);
  assert.equal(
    reconcileRoomMediaSession(synchronized('viewer'), 'user-1', {
      joinedSfu: true,
      publishingAudio: false,
      wantsToPublishAudio: true
    }).type,
    'none'
  );
});

test('authoritative speaker promotion enables publication', () => {
  assert.deepEqual(
    reconcileRoomMediaSession(synchronized('speaker'), 'user-1', {
      joinedSfu: true,
      publishingAudio: false,
      wantsToPublishAudio: true
    }),
    { type: 'publish_audio' }
  );
});

test('authoritative demotion forces existing publication off', () => {
  assert.deepEqual(
    reconcileRoomMediaSession(synchronized('viewer'), 'user-1', {
      joinedSfu: true,
      publishingAudio: true,
      wantsToPublishAudio: true
    }),
    { type: 'unpublish_audio', reason: 'not_authorized' }
  );
});

test('Room Brain desync fails closed by unpublishing but preserves transport', () => {
  const sync: RoomBrainClientSyncState = {
    status: 'resync_required',
    room: synchronized('speaker').room
  };

  assert.deepEqual(
    reconcileRoomMediaSession(sync, 'user-1', {
      joinedSfu: true,
      publishingAudio: true,
      wantsToPublishAudio: true
    }),
    { type: 'unpublish_audio', reason: 'desynchronized' }
  );

  assert.deepEqual(
    reconcileRoomMediaSession(sync, 'user-1', {
      joinedSfu: true,
      publishingAudio: false,
      wantsToPublishAudio: true
    }),
    { type: 'none' }
  );
});

test('synchronized room absence unwinds publication before leaving SFU', () => {
  const sync: RoomBrainClientSyncState = {
    status: 'synchronized',
    room: initialRoomBrainState()
  };

  assert.deepEqual(
    reconcileRoomMediaSession(sync, 'user-1', {
      joinedSfu: true,
      publishingAudio: true,
      wantsToPublishAudio: true
    }),
    { type: 'unpublish_audio', reason: 'not_authorized' }
  );

  assert.deepEqual(
    reconcileRoomMediaSession(sync, 'user-1', {
      joinedSfu: true,
      publishingAudio: false,
      wantsToPublishAudio: true
    }),
    { type: 'leave_sfu' }
  );
});

test('presence joins SFU once and settled state is idempotent', () => {
  const sync = synchronized('host');

  assert.deepEqual(
    reconcileRoomMediaSession(sync, 'user-1', {
      joinedSfu: false,
      publishingAudio: false,
      wantsToPublishAudio: false
    }),
    { type: 'join_sfu' }
  );

  assert.deepEqual(
    reconcileRoomMediaSession(sync, 'user-1', {
      joinedSfu: true,
      publishingAudio: false,
      wantsToPublishAudio: false
    }),
    { type: 'none' }
  );
});

test('local mute request unpublishes an authorized speaker', () => {
  assert.deepEqual(
    reconcileRoomMediaSession(synchronized('speaker'), 'user-1', {
      joinedSfu: true,
      publishingAudio: true,
      wantsToPublishAudio: false
    }),
    { type: 'unpublish_audio', reason: 'not_desired' }
  );
});
