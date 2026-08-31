import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveRealtimeKitMeetingId(
  adminClient: SupabaseClient,
  roomId: string,
): Promise<string> {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) throw new Error("Room ID is required for media provider mapping");

  const { data, error } = await adminClient
    .from("room_media_provider_mappings")
    .select("provider_meeting_id")
    .eq("room_id", normalizedRoomId)
    .eq("provider", "realtimekit")
    .maybeSingle();

  if (error) {
    throw new Error("Unable to resolve backend media provider mapping");
  }

  const meetingId = data?.provider_meeting_id;
  if (typeof meetingId !== "string" || !meetingId.trim()) {
    throw new Error("RealtimeKit meeting mapping is missing");
  }

  return meetingId.trim();
}
