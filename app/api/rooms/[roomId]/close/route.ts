import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { closeBackendOwnedLiveRoom } from "@/lib/realtime/server/liveRoomLifecycle";
import { createLiveRoomServerRuntime } from "@/lib/realtime/server/liveRoomServerRuntime";

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

  const { data: canEnter, error: accessError } = await supabase.rpc(
    "current_user_can_enter",
  );
  if (accessError) {
    return NextResponse.json(
      { error: "Authorization service unavailable." },
      { status: 503 },
    );
  }
  if (!canEnter) {
    return NextResponse.json(
      { error: "Account is not authorized to manage live rooms." },
      { status: 403 },
    );
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id,created_by,status")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) {
    return NextResponse.json(
      { error: "Unable to verify room ownership." },
      { status: 503 },
    );
  }
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }
  if (room.created_by !== userData.user.id) {
    return NextResponse.json(
      { error: "Only the room creator may close this room." },
      { status: 403 },
    );
  }

  const runtime = createLiveRoomServerRuntime();
  if (!runtime) {
    return NextResponse.json(
      { error: "Live room lifecycle is not configured." },
      { status: 503 },
    );
  }

  try {
    const result = await closeBackendOwnedLiveRoom(
      runtime.roomStore,
      runtime.mediaStore,
      runtime.controlPlane,
      runtime.sessionStore,
      runtime.participantRevoker,
      {
        roomId,
        createdBy: userData.user.id,
      },
    );

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Do not claim closure if the database transition itself failed. The
    // lifecycle helper still orders successful closes before provider cleanup.
    return NextResponse.json(
      { error: "Unable to complete room closure; lifecycle reconciliation is required." },
      { status: 503 },
    );
  }
}
