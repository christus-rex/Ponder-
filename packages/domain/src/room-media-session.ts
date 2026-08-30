import type { UserId } from './models.ts';
import type { RoomBrainClientSyncState } from './room-brain-client-sync.ts';
import type { RoomBrainRole } from './room-brain.ts';

export type RoomMediaSessionAction =
  | { type: 'none' }
  | { type: 'join_sfu' }
  | { type: 'leave_sfu' }
  | { type: 'publish_audio' }
  | { type: 'unpublish_audio'; reason: 'desynchronized' | 'not_authorized' | 'not_desired' };

export interface RoomMediaSessionState {
  joinedSfu: boolean;
  publishingAudio: boolean;
  wantsToPublishAudio: boolean;
}

export interface RoomMediaAuthority {
  synchronized: boolean;
  presentInRoom: boolean;
  role: RoomBrainRole | null;
  mayPublishAudio: boolean;
}

export function deriveRoomMediaAuthority(
  sync: RoomBrainClientSyncState,
  localUserId: UserId
): RoomMediaAuthority {
  if (sync.status !== 'synchronized' || !sync.room) {
    return {
      synchronized: false,
      presentInRoom: false,
      role: null,
      mayPublishAudio: false
    };
  }

  const participant = sync.room.participants[localUserId];
  if (!participant) {
    return {
      synchronized: true,
      presentInRoom: false,
      role: null,
      mayPublishAudio: false
    };
  }

  return {
    synchronized: true,
    presentInRoom: true,
    role: participant.role,
    mayPublishAudio: canRolePublishAudio(participant.role)
  };
}

export function reconcileRoomMediaSession(
  sync: RoomBrainClientSyncState,
  localUserId: UserId,
  media: RoomMediaSessionState
): RoomMediaSessionAction {
  const authority = deriveRoomMediaAuthority(sync, localUserId);

  // Fail closed while Room Brain is not authoritative. Preserve the SFU
  // transport session to avoid reconnect churn, but never continue publishing.
  if (!authority.synchronized) {
    if (media.publishingAudio) {
      return { type: 'unpublish_audio', reason: 'desynchronized' };
    }
    return { type: 'none' };
  }

  if (!authority.presentInRoom) {
    if (media.publishingAudio) {
      return { type: 'unpublish_audio', reason: 'not_authorized' };
    }
    if (media.joinedSfu) return { type: 'leave_sfu' };
    return { type: 'none' };
  }

  if (!media.joinedSfu) return { type: 'join_sfu' };

  if (!authority.mayPublishAudio && media.publishingAudio) {
    return { type: 'unpublish_audio', reason: 'not_authorized' };
  }

  if (!media.wantsToPublishAudio && media.publishingAudio) {
    return { type: 'unpublish_audio', reason: 'not_desired' };
  }

  if (
    authority.mayPublishAudio &&
    media.wantsToPublishAudio &&
    !media.publishingAudio
  ) {
    return { type: 'publish_audio' };
  }

  return { type: 'none' };
}

export function canRolePublishAudio(role: RoomBrainRole): boolean {
  return role === 'host' || role === 'moderator' || role === 'speaker';
}
