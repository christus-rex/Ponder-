import assert from 'node:assert/strict';
import test from 'node:test';
import { initialRoomBrainState } from '../src/room-brain.ts';
import { initialRoomBrainProtocolState } from '../src/room-brain-protocol.ts';
import { handleRoomBrainClientMessage } from '../src/room-brain-transport.ts';

const host = { userId: 'host-1', role: 'host' } as const;
const viewer = { userId: 'viewer-1', role: 'viewer' } as const;

function raw(commandId: string, command: object, expectedSequence: number) {
  return JSON.stringify({
    version: 1,
    commandId,
    expectedSequence,
    command
  });
}

test('accepted command produces sender ack and room broadcast', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const result = handleRoomBrainClientMessage(
    protocol,
    host,
    raw('cmd_join_3001', { type: 'join', userId: 'host-1', role: 'host' }, 0)
  );

  assert.equal(result.reply.type, 'ack');
  assert.equal(result.broadcast?.type, 'state_changed');
  assert.equal(result.protocol.room.sequence, 1);
});

test('duplicate retry is acknowledged without rebroadcasting', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const first = handleRoomBrainClientMessage(
    protocol,
    viewer,
    raw('cmd_join_3002', { type: 'join', userId: 'viewer-1', role: 'viewer' }, 0)
  );
  protocol = first.protocol;

  const retry = handleRoomBrainClientMessage(
    protocol,
    viewer,
    raw('cmd_join_3002', { type: 'join', userId: 'viewer-1', role: 'viewer' }, 0)
  );

  assert.equal(retry.reply.type, 'duplicate');
  assert.equal(retry.broadcast, undefined);
  assert.equal(retry.protocol.room.sequence, 1);
});

test('stale expected sequence returns a snapshot for resync', () => {
  let protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  protocol = handleRoomBrainClientMessage(
    protocol,
    host,
    raw('cmd_join_3003', { type: 'join', userId: 'host-1', role: 'host' }, 0)
  ).protocol;

  const stale = handleRoomBrainClientMessage(
    protocol,
    host,
    raw('cmd_lock_3001', { type: 'set_room_lock', actorUserId: 'host-1', locked: true }, 0)
  );

  assert.equal(stale.reply.type, 'resync_required');
  if (stale.reply.type === 'resync_required') {
    assert.equal(stale.reply.snapshot.sequence, 1);
    assert.equal(stale.reply.snapshot.locked, false);
  }
});

test('unsequenced command is rejected as an invalid message', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const result = handleRoomBrainClientMessage(
    protocol,
    viewer,
    JSON.stringify({
      version: 1,
      commandId: 'cmd_join_3999',
      command: { type: 'join', userId: 'viewer-1', role: 'viewer' }
    })
  );

  assert.equal(result.reply.type, 'error');
  if (result.reply.type === 'error') assert.equal(result.reply.code, 'invalid_message');
  assert.equal(result.protocol.room.sequence, 0);
});

test('spoofed user command returns forbidden without state change', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const result = handleRoomBrainClientMessage(
    protocol,
    viewer,
    raw('cmd_join_3004', { type: 'join', userId: 'other-user', role: 'viewer' }, 0)
  );

  assert.equal(result.reply.type, 'error');
  if (result.reply.type === 'error') assert.equal(result.reply.code, 'forbidden');
  assert.equal(result.protocol.room.sequence, 0);
});

test('malformed message returns safe invalid-message response', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const result = handleRoomBrainClientMessage(protocol, viewer, '{bad-json');

  assert.equal(result.reply.type, 'error');
  if (result.reply.type === 'error') {
    assert.equal(result.reply.code, 'invalid_message');
    assert.equal(result.reply.message, 'Message could not be decoded');
  }
});

test('valid but impossible room-state command is rejected without leaking internals', () => {
  const protocol = initialRoomBrainProtocolState(initialRoomBrainState());
  const result = handleRoomBrainClientMessage(
    protocol,
    viewer,
    raw('cmd_seat_3001', { type: 'request_seat', userId: 'viewer-1' }, 0)
  );

  assert.equal(result.reply.type, 'error');
  if (result.reply.type === 'error') {
    assert.equal(result.reply.code, 'rejected');
    assert.equal(result.reply.message, 'Command is not valid for the current room state');
  }
});
