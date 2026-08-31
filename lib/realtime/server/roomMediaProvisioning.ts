import type { SupabaseClient } from "@supabase/supabase-js";

export type MediaProviderMeetingStatus = "ACTIVE" | "INACTIVE";

export interface RealtimeKitMeetingControlPlane {
  createMeeting(input: {
    roomId: string;
    title: string;
  }): Promise<{ meetingId: string }>;
  setMeetingStatus(
    meetingId: string,
    status: MediaProviderMeetingStatus,
  ): Promise<void>;
}

export interface RoomMediaProvisioningStore {
  findMeetingId(roomId: string): Promise<string | null>;
  tryCreateMapping(
    roomId: string,
    meetingId: string,
  ): Promise<"created" | "conflict">;
}

export type RoomMediaProvisioningResult = {
  meetingId: string;
  created: boolean;
};

/**
 * Converges a Ponder room onto exactly one backend-owned RealtimeKit meeting.
 *
 * The provider meeting is created before the database mapping because the
 * provider supplies the meeting ID. If another request wins the mapping race,
 * the losing meeting is immediately disabled. A compensation failure is
 * surfaced instead of silently leaving an active orphan meeting.
 */
export async function ensureRealtimeKitMeetingProvisioned(
  store: RoomMediaProvisioningStore,
  controlPlane: RealtimeKitMeetingControlPlane,
  input: { roomId: string; title: string },
): Promise<RoomMediaProvisioningResult> {
  const roomId = normalizeRoomId(input.roomId);
  const title = normalizeTitle(input.title);

  const existingMeetingId = await store.findMeetingId(roomId);
  if (existingMeetingId) {
    await controlPlane.setMeetingStatus(existingMeetingId, "ACTIVE");
    return { meetingId: existingMeetingId, created: false };
  }

  const created = await controlPlane.createMeeting({ roomId, title });
  const createdMeetingId = normalizeMeetingId(created.meetingId);

  let mappingResult: "created" | "conflict";
  try {
    mappingResult = await store.tryCreateMapping(roomId, createdMeetingId);
  } catch (error) {
    await compensateCreatedMeeting(controlPlane, createdMeetingId);
    throw error;
  }

  if (mappingResult === "created") {
    return { meetingId: createdMeetingId, created: true };
  }

  const winnerMeetingId = await store.findMeetingId(roomId);
  if (!winnerMeetingId) {
    // A uniqueness failure without a same-room winner is ambiguous: it may
    // represent a provider-meeting ID collision with another room. Do not
    // mutate that provider meeting because doing so could disrupt another
    // room. Surface the condition for operator reconciliation instead.
    throw new Error(
      "Media provider mapping conflict requires manual reconciliation",
    );
  }

  if (winnerMeetingId !== createdMeetingId) {
    await compensateCreatedMeeting(controlPlane, createdMeetingId);
  }

  await controlPlane.setMeetingStatus(winnerMeetingId, "ACTIVE");
  return { meetingId: winnerMeetingId, created: false };
}

export async function deactivateRealtimeKitMeetingForRoom(
  store: RoomMediaProvisioningStore,
  controlPlane: RealtimeKitMeetingControlPlane,
  roomId: string,
): Promise<boolean> {
  const normalizedRoomId = normalizeRoomId(roomId);
  const meetingId = await store.findMeetingId(normalizedRoomId);
  if (!meetingId) return false;

  await controlPlane.setMeetingStatus(meetingId, "INACTIVE");
  return true;
}

export function createSupabaseRoomMediaProvisioningStore(
  adminClient: SupabaseClient,
): RoomMediaProvisioningStore {
  return {
    async findMeetingId(roomId) {
      const { data, error } = await adminClient
        .from("room_media_provider_mappings")
        .select("provider_meeting_id")
        .eq("room_id", roomId)
        .eq("provider", "realtimekit")
        .maybeSingle();

      if (error) {
        throw new Error("Unable to read media provider provisioning state");
      }

      const meetingId = data?.provider_meeting_id;
      return typeof meetingId === "string" && meetingId.trim()
        ? meetingId.trim()
        : null;
    },

    async tryCreateMapping(roomId, meetingId) {
      const { error } = await adminClient
        .from("room_media_provider_mappings")
        .insert({
          room_id: roomId,
          provider: "realtimekit",
          provider_meeting_id: meetingId,
        });

      if (!error) return "created";
      if (readErrorCode(error) === "23505") return "conflict";

      throw new Error("Unable to persist media provider provisioning state");
    },
  };
}

async function compensateCreatedMeeting(
  controlPlane: RealtimeKitMeetingControlPlane,
  meetingId: string,
): Promise<void> {
  try {
    await controlPlane.setMeetingStatus(meetingId, "INACTIVE");
  } catch {
    throw new Error(
      "Media provider provisioning compensation failed; manual cleanup required",
    );
  }
}

function normalizeRoomId(value: string): string {
  const roomId = value.trim();
  if (!roomId) throw new Error("Room ID is required for media provisioning");
  if (roomId.length > 128) throw new Error("Room ID is too long");
  return roomId;
}

function normalizeTitle(value: string): string {
  const title = value.trim();
  if (title.length < 3 || title.length > 100) {
    throw new Error("Room title must be between 3 and 100 characters");
  }
  return title;
}

function normalizeMeetingId(value: string): string {
  const meetingId = value.trim();
  if (!meetingId || meetingId.length > 200) {
    throw new Error("RealtimeKit returned an invalid meeting ID");
  }
  return meetingId;
}

function readErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
