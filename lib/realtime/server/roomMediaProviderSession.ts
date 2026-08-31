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
  getActiveUserSession(
    roomId: string,
    userId: string,
  ): Promise<TrackedMediaProviderSession | null>;
  upsertActiveSession(session: TrackedMediaProviderSession): Promise<void>;
  listActiveRoomSessions(roomId: string): Promise<TrackedMediaProviderSession[]>;
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
 * Replaces the one server-tracked provider participant for a room/user.
 *
 * The new provider participant already exists when this function is called.
 * Any previous participant is revoked before the new handle is committed.
 * If persistence fails, the new participant is revoked so an untracked active
 * provider session is never returned to the browser.
 */
export async function replaceTrackedMediaProviderSession(
  store: RoomMediaProviderSessionStore,
  revoker: MediaProviderParticipantRevoker,
  session: TrackedMediaProviderSession,
): Promise<void> {
  validateSession(session);

  const previous = await store.getActiveUserSession(session.roomId, session.userId);
  if (
    previous &&
    previous.providerParticipantId !== session.providerParticipantId
  ) {
    try {
      await revoker.revokeParticipant(
        previous.roomId,
        previous.providerParticipantId,
      );
    } catch (error) {
      await compensateNewParticipant(revoker, session);
      throw error;
    }
  }

  try {
    await store.upsertActiveSession(session);
  } catch (error) {
    await compensateNewParticipant(revoker, session);
    throw error;
  }
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
    async getActiveUserSession(roomId, userId) {
      return readActiveUserSession(adminClient, roomId, userId);
    },

    async upsertActiveSession(session) {
      const { error } = await adminClient
        .from("room_media_provider_sessions")
        .upsert(
          {
            room_id: session.roomId,
            user_id: session.userId,
            provider: "realtimekit",
            provider_participant_id: session.providerParticipantId,
            authority_sequence: session.authoritySequence,
            role: session.role,
            expires_at: new Date(session.expiresAt * 1000).toISOString(),
            revoked_at: null,
          },
          { onConflict: "room_id,user_id" },
        );

      if (error) {
        throw new Error("Unable to persist provider media revocation handle");
      }
    },

    async listActiveRoomSessions(roomId) {
      const { data, error } = await adminClient
        .from("room_media_provider_sessions")
        .select(
          "room_id,user_id,provider_participant_id,authority_sequence,role,expires_at",
        )
        .eq("room_id", roomId)
        .is("revoked_at", null)
        .limit(64);

      if (error) {
        throw new Error("Unable to list active provider media sessions");
      }

      const sessions = (data ?? []).map(decodeSession);
      if (sessions.length > 24) {
        // Ponder rooms cap at 24 users and the table tracks one participant per
        // room/user. More rows indicate invariant drift that must not be hidden.
        throw new Error("Provider media session registry exceeded room bound");
      }
      return sessions;
    },

    async markRevoked(roomId, userId, providerParticipantId) {
      const { data, error } = await adminClient
        .from("room_media_provider_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("provider_participant_id", providerParticipantId)
        .is("revoked_at", null)
        .select("room_id")
        .maybeSingle();

      if (error) {
        throw new Error("Unable to mark provider media session revoked");
      }
      if (!data?.room_id) {
        // A repeated cleanup may encounter an already-revoked row. Re-read the
        // active session so stale cleanup cannot mark a newer replacement.
        const active = await readActiveUserSession(adminClient, roomId, userId);
        if (
          active &&
          active.providerParticipantId !== providerParticipantId
        ) {
          throw new Error("Provider media session changed during revocation");
        }
      }
    },
  };
}

async function readActiveUserSession(
  adminClient: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<TrackedMediaProviderSession | null> {
  const { data, error } = await adminClient
    .from("room_media_provider_sessions")
    .select(
      "room_id,user_id,provider_participant_id,authority_sequence,role,expires_at",
    )
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to read active provider media session");
  }
  return data ? decodeSession(data) : null;
}

async function compensateNewParticipant(
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
