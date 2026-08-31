import type { RoomBrainCommand } from './room-brain.ts';
import {
  applyRoomBrainEnvelope,
  type RoomBrainApplyResult,
  type RoomBrainClientEnvelope,
  type RoomBrainProtocolState
} from './room-brain-protocol.ts';

export type RoomBrainConnectionRole = 'host' | 'moderator' | 'speaker' | 'viewer';

export interface RoomBrainConnectionIdentity {
  userId: string;
  role: RoomBrainConnectionRole;
}

export function assertRoomBrainCommandAuthorized(
  identity: RoomBrainConnectionIdentity,
  command: RoomBrainCommand
): void {
  switch (command.type) {
    case 'join':
      assertSameUser(identity, command.userId);
      if (command.role !== identity.role) {
        throw new Error('Join role does not match authenticated connection role');
      }
      return;
    case 'leave':
    case 'request_seat':
    case 'cancel_seat':
    case 'react':
      assertSameUser(identity, command.userId);
      return;
    case 'demote_speaker':
      throw new Error('Speaker demotion requires trusted backend moderation');
    case 'grant_seat':
    case 'set_room_lock':
      assertSameUser(identity, command.actorUserId);
      if (identity.role !== 'host' && identity.role !== 'moderator') {
        throw new Error('Authenticated moderator privilege required');
      }
      return;
  }
}

export function applyAuthorizedRoomBrainEnvelope(
  protocol: RoomBrainProtocolState,
  identity: RoomBrainConnectionIdentity,
  envelope: RoomBrainClientEnvelope,
  recentCommandLimit?: number
): RoomBrainApplyResult {
  assertRoomBrainCommandAuthorized(identity, envelope.command);
  return applyRoomBrainEnvelope(protocol, envelope, recentCommandLimit);
}

function assertSameUser(identity: RoomBrainConnectionIdentity, commandUserId: string): void {
  if (identity.userId !== commandUserId) {
    throw new Error('Command actor does not match authenticated connection');
  }
}
