import { applyRoomBrainCommand, type RoomBrainCommand, type RoomBrainState } from './room-brain.ts';

export const ROOM_BRAIN_PROTOCOL_VERSION = 1 as const;
export const DEFAULT_RECENT_COMMAND_LIMIT = 256;

export interface RoomBrainClientEnvelope {
  version: typeof ROOM_BRAIN_PROTOCOL_VERSION;
  commandId: string;
  expectedSequence?: number;
  command: RoomBrainCommand;
}

export interface RoomBrainSnapshot {
  version: typeof ROOM_BRAIN_PROTOCOL_VERSION;
  sequence: number;
  locked: boolean;
  participants: RoomBrainState['participants'];
  speakerQueue: string[];
  reactionBuckets: Record<string, number>;
}

export interface RoomBrainProtocolState {
  room: RoomBrainState;
  recentCommandIds: string[];
}

export type RoomBrainApplyResult =
  | {
      accepted: true;
      duplicate: false;
      protocol: RoomBrainProtocolState;
    }
  | {
      accepted: false;
      duplicate: true;
      reason: 'duplicate_command';
      protocol: RoomBrainProtocolState;
    }
  | {
      accepted: false;
      duplicate: false;
      reason: 'sequence_mismatch';
      protocol: RoomBrainProtocolState;
    };

export function initialRoomBrainProtocolState(room: RoomBrainState): RoomBrainProtocolState {
  return {
    room,
    recentCommandIds: []
  };
}

export function applyRoomBrainEnvelope(
  protocol: RoomBrainProtocolState,
  envelope: RoomBrainClientEnvelope,
  recentCommandLimit = DEFAULT_RECENT_COMMAND_LIMIT
): RoomBrainApplyResult {
  validateEnvelope(envelope);
  if (!Number.isSafeInteger(recentCommandLimit) || recentCommandLimit < 1) {
    throw new Error('recentCommandLimit must be a positive safe integer');
  }

  if (protocol.recentCommandIds.includes(envelope.commandId)) {
    return {
      accepted: false,
      duplicate: true,
      reason: 'duplicate_command',
      protocol
    };
  }

  if (envelope.expectedSequence !== undefined && envelope.expectedSequence !== protocol.room.sequence) {
    return {
      accepted: false,
      duplicate: false,
      reason: 'sequence_mismatch',
      protocol
    };
  }

  const room = applyRoomBrainCommand(protocol.room, envelope.command);
  const recentCommandIds = [...protocol.recentCommandIds, envelope.commandId].slice(-recentCommandLimit);

  return {
    accepted: true,
    duplicate: false,
    protocol: {
      room,
      recentCommandIds
    }
  };
}

export function buildRoomBrainSnapshot(state: RoomBrainState): RoomBrainSnapshot {
  return {
    version: ROOM_BRAIN_PROTOCOL_VERSION,
    sequence: state.sequence,
    locked: state.locked,
    participants: Object.fromEntries(
      Object.entries(state.participants).map(([id, participant]) => [id, { ...participant }])
    ),
    speakerQueue: [...state.speakerQueue],
    reactionBuckets: { ...state.reactionBuckets }
  };
}

export function validateEnvelope(envelope: RoomBrainClientEnvelope): void {
  if (envelope.version !== ROOM_BRAIN_PROTOCOL_VERSION) {
    throw new Error('Unsupported Room Brain protocol version');
  }
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(envelope.commandId)) {
    throw new Error('Invalid Room Brain command ID');
  }
  if (
    envelope.expectedSequence !== undefined &&
    (!Number.isSafeInteger(envelope.expectedSequence) || envelope.expectedSequence < 0)
  ) {
    throw new Error('Invalid expected sequence');
  }
}
