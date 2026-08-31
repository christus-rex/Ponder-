import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deactivateRealtimeKitMeetingForRoom,
  ensureRealtimeKitMeetingProvisioned,
  type RealtimeKitMeetingControlPlane,
  type RoomMediaProvisioningStore,
} from "./roomMediaProvisioning";
import {
  revokeTrackedMediaSessionsForRoom,
  type MediaProviderParticipantRevoker,
  type RoomMediaProviderSessionStore,
} from "./roomMediaProviderSession";

export type SocialIntent =
  | "talk"
  | "meet"
  | "deep_conversation"
  | "create"
  | "debate"
  | "listen"
  | "hang_out";

export type ModerationRole = "moderator" | "admin";

export interface LiveRoomLifecycleStore {
  createClosedRoom(input: {
    createdBy: string;
    title: string;
    description: string;
    currentIntent: SocialIntent;
    maxParticipants: number;
  }): Promise<{ id: string; title: string }>;
  markRoomOpen(roomId: string, createdBy: string): Promise<void>;
  markRoomClosed(roomId: string, createdBy: string): Promise<void>;
  moderationCloseRoom(input: {
    roomId: string;
    actorId: string;
    actorRole: ModerationRole;
    reason: string;
  }): Promise<{ actionId: number }>;
}

export async function createBackendOwnedLiveRoom(
  store: LiveRoomLifecycleStore,
  mediaStore: RoomMediaProvisioningStore,
  controlPlane: RealtimeKitMeetingControlPlane,
  input: {
    createdBy: string;
    title: string;
    description?: string;
    currentIntent?: SocialIntent;
    maxParticipants?: number;
  },
): Promise<{ roomId: string; status: "open" }> {
  const normalized = normalizeCreateInput(input);
  const room = await store.createClosedRoom(normalized);

  await ensureRealtimeKitMeetingProvisioned(mediaStore, controlPlane, {
    roomId: room.id,
    title: room.title,
  });

  try {
    await store.markRoomOpen(room.id, normalized.createdBy);
  } catch (error) {
    try {
      await deactivateRealtimeKitMeetingForRoom(mediaStore, controlPlane, room.id);
    } catch {
      throw new Error(
        "Room activation compensation failed; room remains closed and provider cleanup is required",
      );
    }
    throw error;
  }

  return { roomId: room.id, status: "open" };
}

export async function closeBackendOwnedLiveRoom(
  store: LiveRoomLifecycleStore,
  mediaStore: RoomMediaProvisioningStore,
  controlPlane: RealtimeKitMeetingControlPlane,
  sessionStore: RoomMediaProviderSessionStore,
  participantRevoker: MediaProviderParticipantRevoker,
  input: { roomId: string; createdBy: string },
): Promise<{ roomId: string; status: "closed" }> {
  const roomId = normalizeId(input.roomId, "Room ID");
  const createdBy = normalizeId(input.createdBy, "Creator ID");

  await store.markRoomClosed(roomId, createdBy);
  await cleanupClosedRoomMedia(
    mediaStore,
    controlPlane,
    sessionStore,
    participantRevoker,
    roomId,
  );

  return { roomId, status: "closed" };
}

export async function moderationCloseBackendOwnedLiveRoom(
  store: LiveRoomLifecycleStore,
  mediaStore: RoomMediaProvisioningStore,
  controlPlane: RealtimeKitMeetingControlPlane,
  sessionStore: RoomMediaProviderSessionStore,
  participantRevoker: MediaProviderParticipantRevoker,
  input: {
    roomId: string;
    actorId: string;
    actorRole: ModerationRole;
    reason: string;
  },
): Promise<{ roomId: string; status: "closed"; actionId: number }> {
  const roomId = normalizeId(input.roomId, "Room ID");
  const actorId = normalizeId(input.actorId, "Moderator ID");
  const reason = input.reason.trim();

  if (input.actorRole !== "moderator" && input.actorRole !== "admin") {
    throw new Error("A moderator or admin role is required");
  }
  if (reason.length < 3 || reason.length > 500) {
    throw new Error("Moderation reason must be between 3 and 500 characters");
  }

  // The store operation atomically closes Ponder authority and writes the
  // durable moderation audit entry. Provider cleanup happens only afterward.
  const { actionId } = await store.moderationCloseRoom({
    roomId,
    actorId,
    actorRole: input.actorRole,
    reason,
  });

  await cleanupClosedRoomMedia(
    mediaStore,
    controlPlane,
    sessionStore,
    participantRevoker,
    roomId,
  );

  return { roomId, status: "closed", actionId };
}

async function cleanupClosedRoomMedia(
  mediaStore: RoomMediaProvisioningStore,
  controlPlane: RealtimeKitMeetingControlPlane,
  sessionStore: RoomMediaProviderSessionStore,
  participantRevoker: MediaProviderParticipantRevoker,
  roomId: string,
): Promise<void> {
  let participantError: unknown = null;
  let meetingError: unknown = null;

  try {
    await revokeTrackedMediaSessionsForRoom(
      sessionStore,
      participantRevoker,
      roomId,
    );
  } catch (error) {
    participantError = error;
  }

  try {
    await deactivateRealtimeKitMeetingForRoom(mediaStore, controlPlane, roomId);
  } catch (error) {
    meetingError = error;
  }

  if (participantError || meetingError) {
    throw new Error(
      "Provider media cleanup failed after authoritative room closure",
    );
  }
}

export function createSupabaseLiveRoomLifecycleStore(
  adminClient: SupabaseClient,
): LiveRoomLifecycleStore {
  return {
    async createClosedRoom(input) {
      const { data, error } = await adminClient
        .from("rooms")
        .insert({
          created_by: input.createdBy,
          title: input.title,
          description: input.description,
          current_intent: input.currentIntent,
          max_participants: input.maxParticipants,
          status: "closed",
        })
        .select("id,title")
        .single();

      if (error || !data?.id || !data?.title) {
        throw new Error("Unable to create closed room lifecycle record");
      }
      return { id: String(data.id), title: String(data.title) };
    },

    async markRoomOpen(roomId, createdBy) {
      const { data, error } = await adminClient
        .from("rooms")
        .update({ status: "open" })
        .eq("id", roomId)
        .eq("created_by", createdBy)
        .eq("status", "closed")
        .select("id")
        .maybeSingle();

      if (error || !data?.id) throw new Error("Unable to activate provisioned room");
    },

    async markRoomClosed(roomId, createdBy) {
      const { data, error } = await adminClient
        .from("rooms")
        .update({ status: "closed" })
        .eq("id", roomId)
        .eq("created_by", createdBy)
        .neq("status", "archived")
        .select("id")
        .maybeSingle();

      if (error || !data?.id) throw new Error("Unable to close owned live room");
    },

    async moderationCloseRoom(input) {
      const { data, error } = await adminClient.rpc("moderation_close_live_room", {
        p_room_id: input.roomId,
        p_actor_id: input.actorId,
        p_actor_role: input.actorRole,
        p_reason: input.reason,
      });

      if (error || !Number.isSafeInteger(data)) {
        throw new Error("Unable to apply audited room moderation closure");
      }
      return { actionId: data as number };
    },
  };
}

function normalizeCreateInput(input: {
  createdBy: string;
  title: string;
  description?: string;
  currentIntent?: SocialIntent;
  maxParticipants?: number;
}) {
  const createdBy = normalizeId(input.createdBy, "Creator ID");
  const title = input.title.trim();
  const description = (input.description ?? "").trim();
  const currentIntent = input.currentIntent ?? "talk";
  const maxParticipants = input.maxParticipants ?? 8;

  if (title.length < 3 || title.length > 100) {
    throw new Error("Room title must be between 3 and 100 characters");
  }
  if (description.length > 2000) {
    throw new Error("Room description must be at most 2000 characters");
  }
  if (!SOCIAL_INTENTS.has(currentIntent)) throw new Error("Room intent is invalid");
  if (!Number.isSafeInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 24) {
    throw new Error("Room capacity must be between 2 and 24");
  }

  return { createdBy, title, description, currentIntent, maxParticipants };
}

function normalizeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > 128) throw new Error(`${label} is too long`);
  return normalized;
}

const SOCIAL_INTENTS = new Set<SocialIntent>([
  "talk",
  "meet",
  "deep_conversation",
  "create",
  "debate",
  "listen",
  "hang_out",
]);
