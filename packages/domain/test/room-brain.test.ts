import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRoomBrainCommand, initialRoomBrainState } from '../src/room-brain.ts';

function withPeople() {
  let state = initialRoomBrainState();
  state = applyRoomBrainCommand(state, { type: 'join', userId: 'host', role: 'host' });
  state = applyRoomBrainCommand(state, { type: 'join', userId: 'viewer', role: 'viewer' });
  return state;
}

test('seat requests are unique and ordered', () => {
  let state = withPeople();
  state = applyRoomBrainCommand(state, { type: 'request_seat', userId: 'viewer' });
  state = applyRoomBrainCommand(state, { type: 'request_seat', userId: 'viewer' });
  assert.deepEqual(state.speakerQueue, ['viewer']);
});

test('host can grant a speaker seat', () => {
  let state = withPeople();
  state = applyRoomBrainCommand(state, { type: 'request_seat', userId: 'viewer' });
  state = applyRoomBrainCommand(state, { type: 'grant_seat', actorUserId: 'host', targetUserId: 'viewer' });
  assert.equal(state.participants.viewer?.role, 'speaker');
  assert.deepEqual(state.speakerQueue, []);
});

test('viewer cannot grant another participant a seat', () => {
  const state = withPeople();
  assert.throws(
    () => applyRoomBrainCommand(state, { type: 'grant_seat', actorUserId: 'viewer', targetUserId: 'host' }),
    /Moderator privilege/
  );
});

test('leaving removes stale speaker queue entries', () => {
  let state = withPeople();
  state = applyRoomBrainCommand(state, { type: 'request_seat', userId: 'viewer' });
  state = applyRoomBrainCommand(state, { type: 'leave', userId: 'viewer' });
  assert.deepEqual(state.speakerQueue, []);
  assert.equal(state.participants.viewer, undefined);
});

test('reactions aggregate without durable per-reaction rows', () => {
  let state = withPeople();
  state = applyRoomBrainCommand(state, { type: 'react', userId: 'viewer', reaction: '🔥' });
  state = applyRoomBrainCommand(state, { type: 'react', userId: 'viewer', reaction: '🔥' });
  assert.equal(state.reactionBuckets['🔥'], 2);
});

test('room event sequence increases monotonically', () => {
  let state = initialRoomBrainState();
  const start = state.sequence;
  state = applyRoomBrainCommand(state, { type: 'join', userId: 'host', role: 'host' });
  state = applyRoomBrainCommand(state, { type: 'set_room_lock', actorUserId: 'host', locked: true });
  assert.equal(state.sequence, start + 2);
});
