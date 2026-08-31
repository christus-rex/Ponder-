import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createBackendOwnedLiveRoom,
  type SocialIntent,
} from "@/lib/realtime/server/liveRoomLifecycle";
import { createLiveRoomServerRuntime } from "@/lib/realtime/server/liveRoomServerRuntime";

export const dynamic = "force-dynamic";

type CreateRoomRequest = {
  title: string;
  description?: string;
  currentIntent?: SocialIntent;
  maxParticipants?: number;
};

export async function POST(request: Request) {
  const input = await readRequest(request);
  if (!input) {
    return NextResponse.json(
      { error: "A valid room title and room settings are required." },
      { status: 400 },
    );
  }

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
      { error: "Account is not authorized to create live rooms." },
      { status: 403 },
    );
  }

  const runtime = createLiveRoomServerRuntime();
  if (!runtime) {
    return NextResponse.json(
      { error: "Live room provisioning is not configured." },
      { status: 503 },
    );
  }

  try {
    const result = await createBackendOwnedLiveRoom(
      runtime.roomStore,
      runtime.mediaStore,
      runtime.controlPlane,
      {
        createdBy: userData.user.id,
        title: input.title,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.currentIntent !== undefined
          ? { currentIntent: input.currentIntent }
          : {}),
        ...(input.maxParticipants !== undefined
          ? { maxParticipants: input.maxParticipants }
          : {}),
      },
    );

    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Provider, service-role, and lifecycle internals are intentionally hidden.
    return NextResponse.json(
      { error: "Unable to provision a live room." },
      { status: 503 },
    );
  }
}

async function readRequest(request: Request): Promise<CreateRoomRequest | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;

  const record = body as Record<string, unknown>;
  if (
    typeof record.title !== "string" ||
    record.title.trim().length < 3 ||
    record.title.trim().length > 100
  ) {
    return null;
  }
  if (
    record.description !== undefined &&
    (typeof record.description !== "string" ||
      record.description.trim().length > 2000)
  ) {
    return null;
  }
  if (
    record.currentIntent !== undefined &&
    (typeof record.currentIntent !== "string" ||
      !SOCIAL_INTENTS.has(record.currentIntent as SocialIntent))
  ) {
    return null;
  }
  if (
    record.maxParticipants !== undefined &&
    (!Number.isSafeInteger(record.maxParticipants) ||
      (record.maxParticipants as number) < 2 ||
      (record.maxParticipants as number) > 24)
  ) {
    return null;
  }

  return {
    title: record.title,
    ...(record.description !== undefined
      ? { description: record.description as string }
      : {}),
    ...(record.currentIntent !== undefined
      ? { currentIntent: record.currentIntent as SocialIntent }
      : {}),
    ...(record.maxParticipants !== undefined
      ? { maxParticipants: record.maxParticipants as number }
      : {}),
  };
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
