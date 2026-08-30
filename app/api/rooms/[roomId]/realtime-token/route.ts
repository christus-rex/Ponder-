import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRoomBrainToken, type RoomBrainTokenRole } from "@/packages/domain/src/room-brain-token";

export const dynamic = "force-dynamic";

const TOKEN_TTL_SECONDS = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await context.params;
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const secret = process.env.ROOM_BRAIN_AUTH_SECRET;
  const websocketUrl = process.env.NEXT_PUBLIC_ROOM_BRAIN_WS_URL;

  if (!secret || secret.length < 32 || !websocketUrl) {
    return NextResponse.json(
      { error: "Room Brain realtime is not configured on this deployment." },
      { status: 503 }
    );
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id,created_by,status")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }
  if (!room || room.status !== "open") {
    return NextResponse.json({ error: "Live room is not available." }, { status: 404 });
  }

  let role: RoomBrainTokenRole = "viewer";

  if (room.created_by === userData.user.id) {
    role = "host";
  } else {
    const { error: membershipError } = await supabase
      .from("room_members")
      .upsert(
        {
          room_id: roomId,
          user_id: userData.user.id,
          left_at: null,
        },
        { onConflict: "room_id,user_id" }
      );

    if (membershipError) {
      return NextResponse.json(
        { error: "Unable to join the room." },
        { status: 403 }
      );
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1 as const,
    roomId,
    userId: userData.user.id,
    role,
    connectionId: randomUUID(),
    exp: now + TOKEN_TTL_SECONDS,
  };

  const token = await createRoomBrainToken(payload, secret);

  return NextResponse.json(
    {
      token,
      protocol: "ponder-v1",
      websocketUrl: `${websocketUrl.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}`,
      expiresAt: payload.exp,
      role,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
