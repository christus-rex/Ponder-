import type { RoomId, UserId } from './models.ts';

export type MediaRole = 'host' | 'moderator' | 'speaker' | 'viewer';

export interface MediaJoinAuthorizationRequest {
  roomId: RoomId;
  userId: UserId;
  role: MediaRole;
  authoritySequence: number;
}

export interface MediaJoinAuthorization extends MediaJoinAuthorizationRequest {
  token: string;
  expiresAt: number;
}

export type RequestMediaJoinAuthorization = (
  request: MediaJoinAuthorizationRequest
) => Promise<MediaJoinAuthorization>;

export interface JoinMediaRoomInput {
  roomId: RoomId;
  userId: UserId;
  role: MediaRole;
  token: string;
  initialMicrophoneEnabled: false;
  initialCameraEnabled: false;
}
export interface MediaParticipant { userId: UserId; role: MediaRole; microphoneEnabled: boolean; cameraEnabled: boolean; }

export interface RealtimeMediaProvider {
  join(input: JoinMediaRoomInput): Promise<void>;
  leave(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  participants(): readonly MediaParticipant[];
}
