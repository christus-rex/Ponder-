import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deactivateRealtimeKitMeetingForRoom,
  ensureRealtimeKitMeetingProvisioned,
  type RealtimeKitMeetingControlPlane,
  type RoomMediaProvisioningStore,
} from "./roomMediaProvisioning";

export type SocialIntent =
  | "talk"
  | "meet"
  | "deep_conversation"
  | "create"
  | "debate"
  | "listen"
  | "hang_out";

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
      await deactivateRealtimeKitMeetingForRoom(
        mediaStore,
        controlPlane,
        room.id,
      );
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
  input: { roomId: string; createdBy: string },
): Promise<{ roomId: string; status: "closed" }> {
  const roomId = normalizeId(input.roomId, "Room ID");
  const createdBy = normalizeId(input.createdBy, "Creator ID");

  // Close Ponder authority first. Even if provider deactivation fails, the
  // media authorization/session routes reject closed rooms.
  await store.markRoomClosed(roomId, createdBy);
  await deactivateRealtimeKitMeetingForRoom(mediaStore, controlPlane, roomId);

  return { roomId, status: "closed" };
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

      if (error || !data?.id) {
        throw new Error("Unable to activate provisioned room");
      }
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

      if (error || !data?.id) {
        throw new Error("Unable to close owned live room");
      }
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
  if (!SOCIAL_INTENTS.has(currentIntent)) {
    throw new Error("Room intent is invalid");
  }
  if (
    !Number.isSafeInteger(maxParticipants) ||
    maxParticipants < 2 ||
    maxParticipants > 24
  ) {
    throw new Error("Room capacity must be between 2 and 24");
  }

  return {
    createdBy,
    title,
    description,
    currentIntent,
    maxParticipants,
  };
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
