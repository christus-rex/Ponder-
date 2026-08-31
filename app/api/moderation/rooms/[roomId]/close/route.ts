import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  moderationCloseBackendOwnedLiveRoom,
  type ModerationRole,
} from "@/lib/realtime/server/liveRoomLifecycle";
import { createLiveRoomServerRuntime } from "@/lib/realtime/server/liveRoomServerRuntime";

export const dynamic = "force-dynamic";

type RequestBody = { reason: string };

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const input = await readRequest(request);
  if (!input) {
    return NextResponse.json(
      { error: "A moderation reason between 3 and 500 characters is required." },
      { status: 400 },
    );
  }

  const { roomId } = await context.params;
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: hasRole, error: roleError } = await supabase.rpc(
    "current_user_has_role",
    { required_roles: ["moderator", "admin"] },
  );
  if (roleError) {
    return NextResponse.json(
      { error: "Authorization service unavailable." },
      { status: 503 },
    );
  }
  if (!hasRole) {
    return NextResponse.json(
      { error: "Moderator or admin authorization required." },
      { status: 403 },
    );
  }

  const { data: access, error: accessError } = await supabase
    .from("user_access")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (accessError || !isModerationRole(access?.role)) {
    return NextResponse.json(
      { error: "Unable to resolve moderation authority." },
      { status: 503 },
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
    const result = await moderationCloseBackendOwnedLiveRoom(
      runtime.roomStore,
      runtime.mediaStore,
      runtime.controlPlane,
      runtime.sessionStore,
      runtime.participantRevoker,
      {
        roomId,
        actorId: userData.user.id,
        actorRole: access.role,
        reason: input.reason,
      },
    );

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // The database close and audit insert are atomic. Provider cleanup runs
    // afterward, so failures remain fail-closed and can be reconciled safely.
    return NextResponse.json(
      { error: "Unable to complete audited room moderation closure." },
      { status: 503 },
    );
  }
}

async function readRequest(request: Request): Promise<RequestBody | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;

  const reason = (body as Record<string, unknown>).reason;
  if (typeof reason !== "string") return null;
  const normalized = reason.trim();
  if (normalized.length < 3 || normalized.length > 500) return null;
  return { reason: normalized };
}

function isModerationRole(value: unknown): value is ModerationRole {
  return value === "moderator" || value === "admin";
}
