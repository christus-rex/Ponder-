import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  requestAuthoritativeSpeakerDemotion,
  RoomBrainServerRequestError,
} from "@/lib/realtime/server/roomBrainServerClient";
import { createLiveRoomServerRuntime } from "@/lib/realtime/server/liveRoomServerRuntime";
import { revokeTrackedMediaSessionsForUser } from "@/lib/realtime/server/roomMediaProviderSession";
import { createRoomMembershipAdminStoreFromEnv } from "@/lib/realtime/server/roomMembership";

export const dynamic = "force-dynamic";

type DemotionRequest = {
  expectedSequence: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string; userId: string }> },
) {
  const input = await readRequest(request);
  if (!input) {
    return NextResponse.json(
      { error: "A valid Room Brain expected sequence is required." },
      { status: 400 },
    );
  }

  const { roomId, userId: targetUserId } = await context.params;
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
      { error: "Unable to verify live room authority." },
      { status: 503 },
    );
  }
  if (!room || room.status !== "open") {
    return NextResponse.json({ error: "Live room is not available." }, { status: 404 });
  }
  if (room.created_by !== userData.user.id) {
    return NextResponse.json(
      { error: "Only the room host may demote a speaker." },
      { status: 403 },
    );
  }
  if (targetUserId === userData.user.id) {
    return NextResponse.json(
      { error: "The room host cannot demote themselves." },
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

  let membership;
  try {
    membership = await membershipStore.getMembership(roomId, targetUserId);
  } catch {
    return NextResponse.json(
      { error: "Unable to verify target room membership." },
      { status: 503 },
    );
  }
  if (
    !membership ||
    membership.entryState !== "active" ||
    membership.leftAt !== null
  ) {
    return NextResponse.json(
      { error: "Target is not an active room member." },
      { status: 404 },
    );
  }

  const roomBrainSecret = process.env.ROOM_BRAIN_AUTH_SECRET;
  const websocketUrl = process.env.NEXT_PUBLIC_ROOM_BRAIN_WS_URL;
  if (!roomBrainSecret || roomBrainSecret.length < 32 || !websocketUrl) {
    return NextResponse.json(
      { error: "Room Brain moderation is not configured." },
      { status: 503 },
    );
  }

  let demotion;
  try {
    demotion = await requestAuthoritativeSpeakerDemotion(
      {
        websocketUrl,
        roomBrainSecret,
        allowedHosts: (process.env.ROOM_BRAIN_ALLOWED_HOSTS ?? "").split(","),
      },
      {
        roomId,
        actorUserId: userData.user.id,
        actorRole: "host",
        targetUserId,
        expectedSequence: input.expectedSequence,
        commandId: `srv_demote_${randomUUID().replaceAll("-", "")}`,
      },
    );
  } catch (error) {
    if (error instanceof RoomBrainServerRequestError) {
      if (error.status === 409) {
        return NextResponse.json(
          { error: "Room state changed. Resync before demoting the speaker." },
          { status: 409 },
        );
      }
      if (error.status === 422) {
        return NextResponse.json(
          { error: "Target is no longer an authoritative speaker." },
          { status: 409 },
        );
      }
      if (error.status === 401 || error.status === 403) {
        return NextResponse.json(
          { error: "Room Brain rejected host moderation authority." },
          { status: 403 },
        );
      }
    }
    return NextResponse.json(
      { error: "Unable to apply authoritative speaker demotion." },
      { status: 503 },
    );
  }

  const runtime = createLiveRoomServerRuntime();
  if (!runtime) {
    return NextResponse.json(
      {
        error:
          "Speaker was demoted, but media revocation is not configured and requires reconciliation.",
        sequence: demotion.sequence,
      },
      { status: 503 },
    );
  }

  try {
    const revokedSessions = await revokeTrackedMediaSessionsForUser(
      runtime.sessionStore,
      runtime.participantRevoker,
      roomId,
      targetUserId,
    );

    return NextResponse.json(
      {
        roomId,
        targetUserId,
        role: "viewer",
        sequence: demotion.sequence,
        revokedSessions,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Speaker was demoted, but active media cleanup requires reconciliation.",
        sequence: demotion.sequence,
      },
      { status: 503 },
    );
  }
}

async function readRequest(request: Request): Promise<DemotionRequest | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const expectedSequence = (body as Record<string, unknown>).expectedSequence;
  if (
    !Number.isSafeInteger(expectedSequence) ||
    (expectedSequence as number) < 0
  ) {
    return null;
  }

  return { expectedSequence: expectedSequence as number };
}
