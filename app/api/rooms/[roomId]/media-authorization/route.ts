import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { roomBrainMediaGrantUrl } from "@/lib/realtime/server/roomBrainServerHostPolicy";
import {
  createRoomBrainToken,
  type MediaJoinAuthorization,
  type RoomBrainTokenRole,
} from "@/packages/domain/src/index";

export const dynamic = "force-dynamic";

const ROOM_BRAIN_TOKEN_TTL_SECONDS = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await context.params;
  const authoritySequence = await readAuthoritySequence(request);
  if (authoritySequence === null) {
    return NextResponse.json(
      { error: "A valid Room Brain authority sequence is required." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: canEnter, error: accessError } = await supabase.rpc(
    "current_user_can_enter"
  );
  if (accessError) {
    return NextResponse.json(
      { error: "Authorization service unavailable." },
      { status: 503 }
    );
  }
  if (!canEnter) {
    return NextResponse.json(
      { error: "Account is not authorized to enter live rooms." },
      { status: 403 }
    );
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id,created_by,status")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) {
    return NextResponse.json({ error: "Unable to authorize media." }, { status: 503 });
  }
  if (!room || room.status !== "open") {
    return NextResponse.json({ error: "Live room is not available." }, { status: 404 });
  }

  let baselineRole: RoomBrainTokenRole = "viewer";
  if (room.created_by === userData.user.id) {
    baselineRole = "host";
  } else {
    const { data: membership, error: membershipError } = await supabase
      .from("room_members")
      .select("room_id")
      .eq("room_id", roomId)
      .eq("user_id", userData.user.id)
      .is("left_at", null)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { error: "Unable to verify room membership." },
        { status: 503 }
      );
    }
    if (!membership) {
      return NextResponse.json(
        { error: "Active room membership is required." },
        { status: 403 }
      );
    }
  }

  const roomBrainSecret = process.env.ROOM_BRAIN_AUTH_SECRET;
  const websocketUrl = process.env.NEXT_PUBLIC_ROOM_BRAIN_WS_URL;
  if (!roomBrainSecret || roomBrainSecret.length < 32 || !websocketUrl) {
    return NextResponse.json(
      { error: "Room media authorization is not configured." },
      { status: 503 }
    );
  }

  let grantUrl: string;
  try {
    grantUrl = roomBrainMediaGrantUrl(
      websocketUrl,
      roomId,
      (process.env.ROOM_BRAIN_ALLOWED_HOSTS ?? "").split(","),
    );
  } catch {
    return NextResponse.json(
      { error: "Room media authorization is not configured." },
      { status: 503 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const roomBrainToken = await createRoomBrainToken(
    {
      v: 1,
      roomId,
      userId: userData.user.id,
      role: baselineRole,
      connectionId: randomUUID(),
      exp: now + ROOM_BRAIN_TOKEN_TTL_SECONDS,
    },
    roomBrainSecret
  );

  let workerResponse: Response;
  try {
    workerResponse = await fetch(grantUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${roomBrainToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ authoritySequence }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Room Brain media authorization is unavailable." },
      { status: 503 }
    );
  }

  if (!workerResponse.ok) {
    if (workerResponse.status === 409) {
      return NextResponse.json(
        { error: "Room state changed. Resync before publishing media." },
        { status: 409 }
      );
    }
    if (workerResponse.status === 401 || workerResponse.status === 403) {
      return NextResponse.json(
        { error: "Room Brain did not authorize this media session." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Unable to authorize the media session." },
      { status: workerResponse.status === 503 ? 503 : 502 }
    );
  }

  let authorization: MediaJoinAuthorization;
  try {
    authorization = (await workerResponse.json()) as MediaJoinAuthorization;
  } catch {
    return NextResponse.json(
      { error: "Invalid media authorization response." },
      { status: 502 }
    );
  }

  return NextResponse.json(authorization, {
    headers: { "Cache-Control": "no-store" },
  });
}

async function readAuthoritySequence(request: Request): Promise<number | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>).authoritySequence;
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}
