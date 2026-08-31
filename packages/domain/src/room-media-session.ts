import type { MediaRole } from './media.ts';
import type { UserId } from './models.ts';
import type { RoomBrainClientSyncState } from './room-brain-client-sync.ts';

export interface RoomMediaSessionDecision {
  authorityStatus: RoomBrainClientSyncState['status'];
  authoritySequence: number | null;
  role: MediaRole | null;
  shouldJoinSfu: boolean;
  shouldLeaveSfu: boolean;
  mayPublishAudio: boolean;
  mayPublishVideo: boolean;
  mustUnpublishAudio: boolean;
  mustUnpublishVideo: boolean;
  mustUnpublish: boolean;
}

export function mayMediaRolePublishAudio(role: MediaRole): boolean {
  return role === 'host' || role === 'moderator' || role === 'speaker';
}

export function mayMediaRolePublishVideo(role: MediaRole): boolean {
  return role === 'host' || role === 'moderator' || role === 'speaker';
}

/**
 * Converts authoritative Room Brain state into provider-neutral media policy.
 * Unsynchronized or absent participants always fail closed.
 */
export function deriveRoomMediaSessionDecision(
  state: RoomBrainClientSyncState,
  userId: UserId
): RoomMediaSessionDecision {
  if (state.status !== 'synchronized' || !state.room) {
    return failClosedDecision(state.status);
  }

  const participant = state.room.participants[userId];
  if (!participant) {
    return {
      ...failClosedDecision(state.status),
      authoritySequence: state.room.sequence
    };
  }

  const mayPublishAudio = mayMediaRolePublishAudio(participant.role);
  const mayPublishVideo = mayMediaRolePublishVideo(participant.role);
  return {
    authorityStatus: state.status,
    authoritySequence: state.room.sequence,
    role: participant.role,
    shouldJoinSfu: true,
    shouldLeaveSfu: false,
    mayPublishAudio,
    mayPublishVideo,
    mustUnpublishAudio: !mayPublishAudio,
    mustUnpublishVideo: !mayPublishVideo,
    mustUnpublish: !mayPublishAudio || !mayPublishVideo
  };
}

function failClosedDecision(
  authorityStatus: RoomBrainClientSyncState['status']
): RoomMediaSessionDecision {
  return {
    authorityStatus,
    authoritySequence: null,
    role: null,
    shouldJoinSfu: false,
    shouldLeaveSfu: true,
    mayPublishAudio: false,
    mayPublishVideo: false,
    mustUnpublishAudio: true,
    mustUnpublishVideo: true,
    mustUnpublish: true
  };
}
