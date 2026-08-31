import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRoomMembershipAdminStoreFromEnv } from "@/lib/realtime/server/roomMembership";
import { createLiveRoomServerRuntime } from "@/lib/realtime/server/liveRoomServerRuntime";
import { revokeTrackedMediaSessionsForUser } from "@/lib/realtime/server/roomMediaProviderSession";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id,created_by,status")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) {
    return NextResponse.json(
      { error: "Unable to verify room state." },
      { status: 503 },
    );
  }
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }
  if (room.created_by === userData.user.id) {
    return NextResponse.json(
      { error: "Room hosts disconnect without relinquishing ownership." },
      { status: 400 },
    );
  }

  const membershipStore = createRoomMembershipAdminStoreFromEnv();
  if (!membershipStore) {
    return NextResponse.json(
      { error: "Room membership service is not configured." },
      { status: 503 },
    );
  }

  let membershipState;
  try {
    membershipState = await membershipStore.markMembershipLeft(
      roomId,
      userData.user.id,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to leave room membership." },
      { status: 503 },
    );
  }

  // An already-ejected row stays ejected. Normal leave must never turn an
  // enforcement state back into ordinary membership.
  const left = membershipState === "active" || membershipState === "ejected";
  if (!left) {
    return NextResponse.json({ left: true, cleanupPending: false });
  }

  let cleanupPending = false;
  const runtime = createLiveRoomServerRuntime();
  if (runtime) {
    try {
      await revokeTrackedMediaSessionsForUser(
        runtime.sessionStore,
        runtime.participantRevoker,
        roomId,
        userData.user.id,
      );
    } catch {
      cleanupPending = true;
    }
  } else {
    cleanupPending = true;
  }

  return NextResponse.json(
    {
      left: true,
      ejected: membershipState === "ejected",
      cleanupPending,
    },
    {
      status: cleanupPending ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
