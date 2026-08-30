import { applyRoomBrainCommand, type RoomBrainState } from './room-brain.ts';
import {
  ROOM_BRAIN_PROTOCOL_VERSION,
  type RoomBrainSnapshot
} from './room-brain-protocol.ts';
import type { RoomBrainServerMessage } from './room-brain-transport.ts';

export type RoomBrainClientSyncState =
  | { status: 'awaiting_snapshot'; room: null }
  | { status: 'synchronized'; room: RoomBrainState }
  | { status: 'resync_required'; room: RoomBrainState | null };

export function initialRoomBrainClientSyncState(): RoomBrainClientSyncState {
  return { status: 'awaiting_snapshot', room: null };
}

export function applyRoomBrainServerMessage(
  state: RoomBrainClientSyncState,
  message: RoomBrainServerMessage
): RoomBrainClientSyncState {
  if (message.version !== ROOM_BRAIN_PROTOCOL_VERSION) {
    return { status: 'resync_required', room: state.room };
  }

  switch (message.type) {
    case 'snapshot':
    case 'resync_required':
      return applySnapshot(state, message.snapshot);

    case 'state_changed': {
      if (state.status !== 'synchronized' || !state.room) {
        return { status: 'resync_required', room: state.room };
      }
      if (message.sequence !== state.room.sequence + 1) {
        return { status: 'resync_required', room: state.room };
      }

      try {
        const room = applyRoomBrainCommand(state.room, message.command);
        if (room.sequence !== message.sequence) {
          return { status: 'resync_required', room: state.room };
        }
        return { status: 'synchronized', room };
      } catch {
        return { status: 'resync_required', room: state.room };
      }
    }

    case 'ack':
    case 'duplicate':
    case 'error':
      return state;
  }
}

function applySnapshot(
  state: RoomBrainClientSyncState,
  snapshot: RoomBrainSnapshot
): RoomBrainClientSyncState {
  if (
    snapshot.version !== ROOM_BRAIN_PROTOCOL_VERSION ||
    !Number.isSafeInteger(snapshot.sequence) ||
    snapshot.sequence < 0
  ) {
    return { status: 'resync_required', room: state.room };
  }

  if (state.room && snapshot.sequence < state.room.sequence) {
    return state;
  }

  return {
    status: 'synchronized',
    room: {
      sequence: snapshot.sequence,
      locked: snapshot.locked,
      participants: Object.fromEntries(
        Object.entries(snapshot.participants).map(([id, participant]) => [
          id,
          { ...participant }
        ])
      ),
      speakerQueue: [...snapshot.speakerQueue],
      reactionBuckets: { ...snapshot.reactionBuckets }
    }
  };
}
