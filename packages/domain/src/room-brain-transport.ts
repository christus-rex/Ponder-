import {
  assertRoomBrainCommandAuthorized,
  type RoomBrainConnectionIdentity
} from './room-brain-auth.ts';
import { decodeRoomBrainClientMessage } from './room-brain-codec.ts';
import {
  applyRoomBrainEnvelope,
  buildRoomBrainSnapshot,
  ROOM_BRAIN_PROTOCOL_VERSION,
  type RoomBrainClientEnvelope,
  type RoomBrainProtocolState,
  type RoomBrainSnapshot
} from './room-brain-protocol.ts';

export type RoomBrainServerMessage =
  | {
      version: typeof ROOM_BRAIN_PROTOCOL_VERSION;
      type: 'ack';
      commandId: string;
      sequence: number;
    }
  | {
      version: typeof ROOM_BRAIN_PROTOCOL_VERSION;
      type: 'duplicate';
      commandId: string;
      sequence: number;
    }
  | {
      version: typeof ROOM_BRAIN_PROTOCOL_VERSION;
      type: 'resync_required';
      commandId: string;
      snapshot: RoomBrainSnapshot;
    }
  | {
      version: typeof ROOM_BRAIN_PROTOCOL_VERSION;
      type: 'state_changed';
      sequence: number;
      command: RoomBrainClientEnvelope['command'];
    }
  | {
      version: typeof ROOM_BRAIN_PROTOCOL_VERSION;
      type: 'error';
      code: 'invalid_message' | 'forbidden' | 'rejected';
      message: string;
    };

export interface RoomBrainTransportResult {
  protocol: RoomBrainProtocolState;
  reply: RoomBrainServerMessage;
  broadcast?: RoomBrainServerMessage;
}

export function handleRoomBrainClientMessage(
  protocol: RoomBrainProtocolState,
  identity: RoomBrainConnectionIdentity,
  rawMessage: string
): RoomBrainTransportResult {
  let envelope: RoomBrainClientEnvelope;
  try {
    envelope = decodeRoomBrainClientMessage(rawMessage);
  } catch {
    return {
      protocol,
      reply: errorMessage('invalid_message', 'Message could not be decoded')
    };
  }

  try {
    assertRoomBrainCommandAuthorized(identity, envelope.command);
  } catch {
    return {
      protocol,
      reply: errorMessage('forbidden', 'Command is not authorized for this connection')
    };
  }

  let applied;
  try {
    applied = applyRoomBrainEnvelope(protocol, envelope);
  } catch {
    return {
      protocol,
      reply: errorMessage('rejected', 'Command is not valid for the current room state')
    };
  }

  if (applied.accepted) {
    return {
      protocol: applied.protocol,
      reply: {
        version: ROOM_BRAIN_PROTOCOL_VERSION,
        type: 'ack',
        commandId: envelope.commandId,
        sequence: applied.protocol.room.sequence
      },
      broadcast: {
        version: ROOM_BRAIN_PROTOCOL_VERSION,
        type: 'state_changed',
        sequence: applied.protocol.room.sequence,
        command: envelope.command
      }
    };
  }

  if (applied.duplicate) {
    return {
      protocol: applied.protocol,
      reply: {
        version: ROOM_BRAIN_PROTOCOL_VERSION,
        type: 'duplicate',
        commandId: envelope.commandId,
        sequence: applied.protocol.room.sequence
      }
    };
  }

  return {
    protocol: applied.protocol,
    reply: {
      version: ROOM_BRAIN_PROTOCOL_VERSION,
      type: 'resync_required',
      commandId: envelope.commandId,
      snapshot: buildRoomBrainSnapshot(applied.protocol.room)
    }
  };
}

function errorMessage(
  code: Extract<RoomBrainServerMessage, { type: 'error' }>['code'],
  message: string
): Extract<RoomBrainServerMessage, { type: 'error' }> {
  return {
    version: ROOM_BRAIN_PROTOCOL_VERSION,
    type: 'error',
    code,
    message
  };
}
