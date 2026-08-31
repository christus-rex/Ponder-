import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeRoomBrainClientMessage } from '../src/room-brain-codec.ts';

test('valid JSON command decodes to a typed envelope', () => {
  const result = decodeRoomBrainClientMessage(
    JSON.stringify({
      version: 1,
      commandId: 'cmd_join_2001',
      expectedSequence: 0,
      command: { type: 'join', userId: 'viewer-1', role: 'viewer' }
    })
  );

  assert.equal(result.command.type, 'join');
  assert.equal(result.expectedSequence, 0);
});

test('missing expected sequence is rejected', () => {
  assert.throws(
    () =>
      decodeRoomBrainClientMessage(
        JSON.stringify({
          version: 1,
          commandId: 'cmd_join_2000',
          command: { type: 'join', userId: 'viewer-1', role: 'viewer' }
        })
      ),
    /Expected sequence must be a number/
  );
});

test('unknown commands are rejected', () => {
  assert.throws(
    () =>
      decodeRoomBrainClientMessage(
        JSON.stringify({
          version: 1,
          commandId: 'cmd_nope_2001',
          expectedSequence: 0,
          command: { type: 'become_admin', userId: 'viewer-1' }
        })
      ),
    /Unknown Room Brain command type/
  );
});

test('role escalation payload with invalid role is rejected', () => {
  assert.throws(
    () =>
      decodeRoomBrainClientMessage(
        JSON.stringify({
          version: 1,
          commandId: 'cmd_join_2002',
          expectedSequence: 0,
          command: { type: 'join', userId: 'viewer-1', role: 'owner' }
        })
      ),
    /Invalid Room Brain role/
  );
});

test('invalid JSON is rejected', () => {
  assert.throws(() => decodeRoomBrainClientMessage('{nope'), /not valid JSON/);
});

test('oversized messages are rejected before parsing', () => {
  const huge = JSON.stringify({
    version: 1,
    commandId: 'cmd_react_2001',
    expectedSequence: 0,
    command: { type: 'react', userId: 'viewer-1', reaction: 'x'.repeat(5000) }
  });
  assert.throws(() => decodeRoomBrainClientMessage(huge), /exceeds size limit/);
});

test('non-numeric expected sequence is rejected', () => {
  assert.throws(
    () =>
      decodeRoomBrainClientMessage(
        JSON.stringify({
          version: 1,
          commandId: 'cmd_join_2003',
          expectedSequence: '0',
          command: { type: 'join', userId: 'viewer-1', role: 'viewer' }
        })
      ),
    /Expected sequence must be a number/
  );
});


test('backend-only speaker demotion is rejected on the client websocket codec', () => {
  assert.throws(
    () =>
      decodeRoomBrainClientMessage(
        JSON.stringify({
          version: 1,
          commandId: 'cmd_demote_2001',
          expectedSequence: 0,
          command: {
            type: 'demote_speaker',
            actorUserId: 'host-1',
            targetUserId: 'speaker-1'
          }
        })
      ),
    /Unknown Room Brain command type/
  );
});
