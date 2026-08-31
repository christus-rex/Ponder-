import type { UserId } from './models.ts';

export type RoomBrainRole = 'host' | 'moderator' | 'speaker' | 'viewer';

export interface RoomBrainParticipant {
  userId: UserId;
  role: RoomBrainRole;
}

export interface RoomBrainState {
  sequence: number;
  locked: boolean;
  participants: Record<UserId, RoomBrainParticipant>;
  speakerQueue: UserId[];
  reactionBuckets: Record<string, number>;
}

export type RoomBrainCommand =
  | { type: 'join'; userId: UserId; role: RoomBrainRole }
  | { type: 'leave'; userId: UserId }
  | { type: 'request_seat'; userId: UserId }
  | { type: 'cancel_seat'; userId: UserId }
  | { type: 'grant_seat'; actorUserId: UserId; targetUserId: UserId }
  | { type: 'demote_speaker'; actorUserId: UserId; targetUserId: UserId }
  | { type: 'set_room_lock'; actorUserId: UserId; locked: boolean }
  | { type: 'react'; userId: UserId; reaction: string };

export function initialRoomBrainState(): RoomBrainState {
  return {
    sequence: 0,
    locked: false,
    participants: {},
    speakerQueue: [],
    reactionBuckets: {}
  };
}

export function applyRoomBrainCommand(state: RoomBrainState, command: RoomBrainCommand): RoomBrainState {
  const next = clone(state);

  switch (command.type) {
    case 'join': {
      if (next.locked && command.role === 'viewer') throw new Error('Room is locked');
      next.participants[command.userId] = { userId: command.userId, role: command.role };
      break;
    }
    case 'leave': {
      delete next.participants[command.userId];
      next.speakerQueue = next.speakerQueue.filter((id) => id !== command.userId);
      break;
    }
    case 'request_seat': {
      const participant = requireParticipant(next, command.userId);
      if (participant.role !== 'viewer') throw new Error('Only viewers can request a seat');
      if (!next.speakerQueue.includes(command.userId)) next.speakerQueue.push(command.userId);
      break;
    }
    case 'cancel_seat': {
      next.speakerQueue = next.speakerQueue.filter((id) => id !== command.userId);
      break;
    }
    case 'grant_seat': {
      requireModerator(next, command.actorUserId);
      const target = requireParticipant(next, command.targetUserId);
      target.role = 'speaker';
      next.speakerQueue = next.speakerQueue.filter((id) => id !== command.targetUserId);
      break;
    }
    case 'demote_speaker': {
      requireModerator(next, command.actorUserId);
      if (command.actorUserId === command.targetUserId) {
        throw new Error('Moderator cannot demote self');
      }
      const target = requireParticipant(next, command.targetUserId);
      if (target.role !== 'speaker') {
        throw new Error('Only speakers can be demoted');
      }
      target.role = 'viewer';
      next.speakerQueue = next.speakerQueue.filter((id) => id !== command.targetUserId);
      break;
    }
    case 'set_room_lock': {
      requireModerator(next, command.actorUserId);
      next.locked = command.locked;
      break;
    }
    case 'react': {
      requireParticipant(next, command.userId);
      const reaction = command.reaction.trim();
      if (reaction.length === 0 || reaction.length > 32) throw new Error('Invalid reaction');
      next.reactionBuckets[reaction] = (next.reactionBuckets[reaction] ?? 0) + 1;
      break;
    }
  }

  next.sequence += 1;
  return next;
}

function requireParticipant(state: RoomBrainState, userId: UserId): RoomBrainParticipant {
  const participant = state.participants[userId];
  if (!participant) throw new Error('Participant is not in the room');
  return participant;
}

function requireModerator(state: RoomBrainState, userId: UserId): RoomBrainParticipant {
  const participant = requireParticipant(state, userId);
  if (participant.role !== 'host' && participant.role !== 'moderator') {
    throw new Error('Moderator privilege required');
  }
  return participant;
}

function clone(state: RoomBrainState): RoomBrainState {
  return {
    sequence: state.sequence,
    locked: state.locked,
    participants: Object.fromEntries(
      Object.entries(state.participants).map(([id, participant]) => [id, { ...participant }])
    ),
    speakerQueue: [...state.speakerQueue],
    reactionBuckets: { ...state.reactionBuckets }
  };
}
