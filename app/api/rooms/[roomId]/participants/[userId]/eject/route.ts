import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  requestAuthoritativeParticipantEjection,
  RoomBrainServerRequestError,
} from "@/lib/realtime/server/roomBrainServerClient";
import { createRoomMembershipAdminStoreFromEnv } from "@/lib/realtime/server/roomMembership";
import { createLiveRoomServerRuntime } from "@/lib/realtime/server/liveRoomServerRuntime";
import { revokeTrackedMediaSessionsForUser } from "@/lib/realtime/server/roomMediaProviderSession";

export const dynamic = "force-dynamic";

type EjectionRequest = {
  expectedSequence: number;
  reason: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string; userId: string }> },
) {
  const input = await readRequest(request);
  if (!input) {
    return NextResponse.json(
      { error: "A valid Room Brain sequence and ejection reason are required." },
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
      { error: "Unable to verify room authority." },
      { status: 503 },
    );
  }
  if (!room || room.status !== "open") {
    return NextResponse.json({ error: "Live room is not available." }, { status: 404 });
  }
  if (room.created_by !== userData.user.id) {
    return NextResponse.json(
      { error: "Only the room host may remove a participant." },
      { status: 403 },
    );
  }
  if (targetUserId === userData.user.id) {
    return NextResponse.json(
      { error: "The room host cannot remove themselves." },
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

  let actionId: number;
  try {
    actionId = await membershipStore.hostEjectMember({
      roomId,
      targetUserId,
      actorUserId: userData.user.id,
      reason: input.reason,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to persist authoritative room removal." },
      { status: 409 },
    );
  }

  let roomBrainSequence: number | null = null;
  let roomBrainCleanupFailed = false;
  const roomBrainSecret = process.env.ROOM_BRAIN_AUTH_SECRET;
  const websocketUrl = process.env.NEXT_PUBLIC_ROOM_BRAIN_WS_URL;

  if (!roomBrainSecret || roomBrainSecret.length < 32 || !websocketUrl) {
    roomBrainCleanupFailed = true;
  } else {
    try {
      const ejection = await requestAuthoritativeParticipantEjection(
        {
          websocketUrl,
          roomBrainSecret,
          allowedHosts: (process.env.ROOM_BRAIN_ALLOWED_HOSTS ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        },
        {
          roomId,
          actorUserId: userData.user.id,
          actorRole: "host",
          targetUserId,
          expectedSequence: input.expectedSequence,
        },
      );
      roomBrainSequence = ejection.sequence;
    } catch (error) {
      // The database ejection remains authoritative even if realtime cleanup
      // cannot complete. A retry of this endpoint converges idempotently.
      roomBrainCleanupFailed = true;
      if (
        error instanceof RoomBrainServerRequestError &&
        (error.status === 401 || error.status === 403)
      ) {
        // Preserve the same fail-closed response; do not leak bearer/token
        // configuration details to the client.
      }
    }
  }

  let revokedSessions: number | null = null;
  let mediaCleanupFailed = false;
  const runtime = createLiveRoomServerRuntime();
  if (!runtime) {
    mediaCleanupFailed = true;
  } else {
    try {
      revokedSessions = await revokeTrackedMediaSessionsForUser(
        runtime.sessionStore,
        runtime.participantRevoker,
        roomId,
        targetUserId,
      );
    } catch {
      // The revocation subsystem schedules durable reconciliation for unresolved
      // handles. The membership ejection is not rolled back.
      mediaCleanupFailed = true;
    }
  }

  if (roomBrainCleanupFailed || mediaCleanupFailed) {
    return NextResponse.json(
      {
        error:
          "Participant is removed, but realtime cleanup still requires reconciliation.",
        ejected: true,
        actionId,
        sequence: roomBrainSequence,
        cleanupPending: true,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      roomId,
      targetUserId,
      ejected: true,
      actionId,
      sequence: roomBrainSequence,
      revokedSessions,
      cleanupPending: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function readRequest(request: Request): Promise<EjectionRequest | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const expectedSequence = record.expectedSequence;
  const reason = record.reason;

  if (
    !Number.isSafeInteger(expectedSequence) ||
    (expectedSequence as number) < 0 ||
    typeof reason !== "string" ||
    reason.trim().length < 3 ||
    reason.trim().length > 500
  ) {
    return null;
  }

  return {
    expectedSequence: expectedSequence as number,
    reason: reason.trim(),
  };
}
