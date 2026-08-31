import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaRole } from "../../../packages/domain/src/media";

export interface TrackedMediaProviderSession {
  roomId: string;
  userId: string;
  providerParticipantId: string;
  authoritySequence: number;
  role: MediaRole;
  expiresAt: number;
}

export interface RoomMediaProviderSessionStore {
  registerActiveSession(
    session: TrackedMediaProviderSession,
  ): Promise<string[]>;
  isCurrentSession(
    roomId: string,
    userId: string,
    providerParticipantId: string,
  ): Promise<boolean>;
  listActiveRoomSessions(roomId: string): Promise<TrackedMediaProviderSession[]>;
  listActiveUserSessions(
    roomId: string,
    userId: string,
  ): Promise<TrackedMediaProviderSession[]>;
  markRevoked(
    roomId: string,
    userId: string,
    providerParticipantId: string,
  ): Promise<void>;
}

export interface MediaProviderParticipantRevoker {
  revokeParticipant(roomId: string, providerParticipantId: string): Promise<void>;
}

/**
 * Registers a newly-created provider participant as the current session for a
 * room/user and then revokes every previously tracked unrevoked participant.
 *
 * Database registration is serialized per room/user. Historical participant
 * handles remain stored until provider deletion is confirmed, so concurrent
 * exchanges cannot make an older active participant untrackable.
 */
export async function replaceTrackedMediaProviderSession(
  store: RoomMediaProviderSessionStore,
  revoker: MediaProviderParticipantRevoker,
  session: TrackedMediaProviderSession,
): Promise<void> {
  validateSession(session);

  let previousParticipantIds: string[];
  try {
    previousParticipantIds = await store.registerActiveSession(session);
  } catch (error) {
    await compensateUntrackedParticipant(revoker, session);
    throw error;
  }

  for (const previousParticipantId of previousParticipantIds) {
    if (previousParticipantId === session.providerParticipantId) continue;
    try {
      await revoker.revokeParticipant(session.roomId, previousParticipantId);
      await store.markRevoked(
        session.roomId,
        session.userId,
        previousParticipantId,
      );
    } catch (error) {
      await compensateTrackedParticipant(store, revoker, session);
      throw error;
    }
  }

  const isCurrent = await store.isCurrentSession(
    session.roomId,
    session.userId,
    session.providerParticipantId,
  );
  if (!isCurrent) {
    await compensateTrackedParticipant(store, revoker, session);
    throw new Error("Provider media session was superseded before delivery");
  }
}

export async function revokeTrackedMediaSessionsForUser(
  store: RoomMediaProviderSessionStore,
  revoker: MediaProviderParticipantRevoker,
  roomId: string,
  userId: string,
): Promise<number> {
  const normalizedRoomId = normalizeId(roomId, "Room ID");
  const normalizedUserId = normalizeId(userId, "User ID");
  const sessions = await store.listActiveUserSessions(
    normalizedRoomId,
    normalizedUserId,
  );

  let revoked = 0;
  for (const session of sessions) {
    await revoker.revokeParticipant(
      normalizedRoomId,
      session.providerParticipantId,
    );
    await store.markRevoked(
      normalizedRoomId,
      normalizedUserId,
      session.providerParticipantId,
    );
    revoked += 1;
  }

  return revoked;
}

export async function revokeTrackedMediaSessionsForRoom(
  store: RoomMediaProviderSessionStore,
  revoker: MediaProviderParticipantRevoker,
  roomId: string,
): Promise<number> {
  const normalizedRoomId = normalizeId(roomId, "Room ID");
  const sessions = await store.listActiveRoomSessions(normalizedRoomId);

  let revoked = 0;
  for (const session of sessions) {
    await revoker.revokeParticipant(
      normalizedRoomId,
      session.providerParticipantId,
    );
    await store.markRevoked(
      normalizedRoomId,
      session.userId,
      session.providerParticipantId,
    );
    revoked += 1;
  }

  return revoked;
}

export function createSupabaseRoomMediaProviderSessionStore(
  adminClient: SupabaseClient,
): RoomMediaProviderSessionStore {
  return {
    async registerActiveSession(session) {
      const { data, error } = await adminClient.rpc(
        "register_room_media_provider_session",
        {
          p_room_id: session.roomId,
          p_user_id: session.userId,
          p_provider_participant_id: session.providerParticipantId,
          p_authority_sequence: session.authoritySequence,
          p_role: session.role,
          p_expires_at: new Date(session.expiresAt * 1000).toISOString(),
        },
      );

      if (error) {
        throw new Error("Unable to persist provider media revocation handle");
      }
      if (
        !Array.isArray(data) ||
        data.some((value) => typeof value !== "string" || !value.trim())
      ) {
        throw new Error("Provider media session registration returned invalid data");
      }
      return data as string[];
    },

    async isCurrentSession(roomId, userId, providerParticipantId) {
      const { data, error } = await adminClient
        .from("room_media_provider_sessions")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("provider_participant_id", providerParticipantId)
        .eq("is_current", true)
        .is("revoked_at", null)
        .maybeSingle();

      if (error) {
        throw new Error("Unable to verify current provider media session");
      }
      return Boolean(data?.id);
    },

    async listActiveRoomSessions(roomId) {
      const { data, error } = await adminClient
        .from("room_media_provider_sessions")
        .select(
          "room_id,user_id,provider_participant_id,authority_sequence,role,expires_at",
        )
        .eq("room_id", roomId)
        .is("revoked_at", null)
        .limit(97);

      if (error) {
        throw new Error("Unable to list active provider media sessions");
      }

      const sessions = (data ?? []).map(decodeSession);
      if (sessions.length > 96) {
        // 24 room participants × the Room Brain four-connection bound. More
        // unrevoked handles indicate invariant drift that requires repair.
        throw new Error("Provider media session registry exceeded room bound");
      }
      return sessions;
    },

    async listActiveUserSessions(roomId, userId) {
      const { data, error } = await adminClient
        .from("room_media_provider_sessions")
        .select(
          "room_id,user_id,provider_participant_id,authority_sequence,role,expires_at",
        )
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .is("revoked_at", null)
        .limit(5);

      if (error) {
        throw new Error("Unable to list active user provider media sessions");
      }

      const sessions = (data ?? []).map(decodeSession);
      if (sessions.length > 4) {
        throw new Error("Provider media session registry exceeded user bound");
      }
      return sessions;
    },

    async markRevoked(roomId, userId, providerParticipantId) {
      const { data, error } = await adminClient
        .from("room_media_provider_sessions")
        .update({
          revoked_at: new Date().toISOString(),
          is_current: false,
        })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("provider_participant_id", providerParticipantId)
        .is("revoked_at", null)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new Error("Unable to mark provider media session revoked");
      }
      if (data?.id) return;

      const { data: existing, error: existingError } = await adminClient
        .from("room_media_provider_sessions")
        .select("revoked_at")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("provider_participant_id", providerParticipantId)
        .maybeSingle();

      if (existingError) {
        throw new Error("Unable to verify provider media revocation state");
      }
      if (existing && existing.revoked_at === null) {
        throw new Error("Provider media session remained active after revocation");
      }
    },
  };
}

async function compensateUntrackedParticipant(
  revoker: MediaProviderParticipantRevoker,
  session: TrackedMediaProviderSession,
): Promise<void> {
  try {
    await revoker.revokeParticipant(
      session.roomId,
      session.providerParticipantId,
    );
  } catch {
    throw new Error(
      "Provider media session compensation failed; manual cleanup required",
    );
  }
}

async function compensateTrackedParticipant(
  store: RoomMediaProviderSessionStore,
  revoker: MediaProviderParticipantRevoker,
  session: TrackedMediaProviderSession,
): Promise<void> {
  try {
    await revoker.revokeParticipant(
      session.roomId,
      session.providerParticipantId,
    );
    await store.markRevoked(
      session.roomId,
      session.userId,
      session.providerParticipantId,
    );
  } catch {
    throw new Error(
      "Provider media session compensation failed; manual cleanup required",
    );
  }
}

function decodeSession(data: Record<string, unknown>): TrackedMediaProviderSession {
  const roomId = data.room_id;
  const userId = data.user_id;
  const providerParticipantId = data.provider_participant_id;
  const authoritySequence = Number(data.authority_sequence);
  const role = data.role;
  const expiresAtRaw = data.expires_at;

  if (
    typeof roomId !== "string" ||
    typeof userId !== "string" ||
    typeof providerParticipantId !== "string" ||
    !Number.isSafeInteger(authoritySequence) ||
    !isMediaRole(role) ||
    typeof expiresAtRaw !== "string"
  ) {
    throw new Error("Provider media session registry contains invalid data");
  }

  const expiresAt = Math.floor(new Date(expiresAtRaw).getTime() / 1000);
  if (!Number.isSafeInteger(expiresAt)) {
    throw new Error("Provider media session registry expiry is invalid");
  }

  return {
    roomId,
    userId,
    providerParticipantId,
    authoritySequence,
    role,
    expiresAt,
  };
}

function validateSession(session: TrackedMediaProviderSession): void {
  normalizeId(session.roomId, "Room ID");
  normalizeId(session.userId, "User ID");
  const participantId = session.providerParticipantId.trim();
  if (!participantId || participantId.length > 200) {
    throw new Error("Provider participant ID is invalid");
  }
  if (!Number.isSafeInteger(session.authoritySequence) || session.authoritySequence < 0) {
    throw new Error("Provider media authority sequence is invalid");
  }
  if (!isMediaRole(session.role)) {
    throw new Error("Provider media role is invalid");
  }
  if (!Number.isSafeInteger(session.expiresAt) || session.expiresAt <= 0) {
    throw new Error("Provider media session expiry is invalid");
  }
}

function normalizeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > 128) throw new Error(`${label} is too long`);
  return normalized;
}

function isMediaRole(value: unknown): value is MediaRole {
  return (
    value === "host" ||
    value === "moderator" ||
    value === "speaker" ||
    value === "viewer"
  );
}
