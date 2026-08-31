import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeTrustedMediaCapability,
  verifyTrustedMediaCapability,
} from "@/lib/realtime/server/mediaProviderExchange";
import {
  requestAuthoritativeMediaGrant,
  RoomBrainServerRequestError,
} from "@/lib/realtime/server/roomBrainServerClient";
import { RealtimeKitMediaProviderAdapter } from "@/lib/realtime/server/realtimeKitMediaProviderAdapter";
import { resolveRealtimeKitMeetingId } from "@/lib/realtime/server/roomMediaProviderMapping";
import {
  createSupabaseRoomMediaProviderSessionStore,
  replaceTrackedMediaProviderSession,
} from "@/lib/realtime/server/roomMediaProviderSession";
import { CloudflareRealtimeKitParticipantRevoker } from "@/lib/realtime/server/cloudflareRealtimeKitParticipantRevoker";

export const dynamic = "force-dynamic";

type MediaSessionRequest = {
  capabilityToken: string;
  authoritySequence: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const input = await readRequest(request);
  if (!input) {
    return NextResponse.json(
      { error: "A valid media capability and authority sequence are required." },
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
      { error: "Account is not authorized to enter live rooms." },
      { status: 403 },
    );
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id,status,created_by")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) {
    return NextResponse.json(
      { error: "Unable to verify live room state." },
      { status: 503 },
    );
  }
  if (!room || room.status !== "open") {
    return NextResponse.json({ error: "Live room is not available." }, { status: 404 });
  }

  const config = readServerConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Room media provider exchange is not configured." },
      { status: 503 },
    );
  }

  let verifiedCapability;
  try {
    verifiedCapability = await verifyTrustedMediaCapability(
      {
        capabilityToken: freshAuthorization.token,
        expectedRoomId: roomId,
        expectedUserId: userData.user.id,
        expectedAuthoritySequence: input.authoritySequence,
      },
      config.mediaSessionSecret,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to establish an authorized media session." },
      { status: 403 },
    );
  }

  let freshAuthorization;
  try {
    freshAuthorization = await requestAuthoritativeMediaGrant(
      {
        websocketUrl: config.roomBrainWebsocketUrl,
        roomBrainSecret: config.roomBrainSecret,
        allowedHosts: config.roomBrainAllowedHosts,
      },
      {
        roomId,
        userId: userData.user.id,
        baselineRole:
          room.created_by === userData.user.id ? "host" : "viewer",
        authoritySequence: input.authoritySequence,
      },
    );
  } catch (error) {
    if (error instanceof RoomBrainServerRequestError) {
      if (error.status === 409) {
        return NextResponse.json(
          { error: "Room state changed. Resync before establishing media." },
          { status: 409 },
        );
      }
      if (error.status === 401 || error.status === 403) {
        return NextResponse.json(
          { error: "Room Brain no longer authorizes this media session." },
          { status: 403 },
        );
      }
    }
    return NextResponse.json(
      { error: "Room Brain media authority is unavailable." },
      { status: 503 },
    );
  }

  if (freshAuthorization.role !== verifiedCapability.role) {
    return NextResponse.json(
      { error: "Room media authority changed. Resync before establishing media." },
      { status: 409 },
    );
  }

  const admin = createAdminClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resolveMeetingId = (authorizedRoomId: string) =>
    resolveRealtimeKitMeetingId(admin, authorizedRoomId);

  const adapter = new RealtimeKitMediaProviderAdapter({
    accountId: config.accountId,
    appId: config.appId,
    apiToken: config.apiToken,
    subscribeOnlyPreset: config.subscribeOnlyPreset,
    publisherPreset: config.publisherPreset,
    resolveMeetingId,
    ...(config.apiBase ? { apiBase: config.apiBase } : {}),
    ...(config.allowedApiHosts.length > 0
      ? { allowedApiHosts: config.allowedApiHosts }
      : {}),
  });

  const sessionStore = createSupabaseRoomMediaProviderSessionStore(admin);
  const participantRevoker = new CloudflareRealtimeKitParticipantRevoker({
    accountId: config.accountId,
    appId: config.appId,
    apiToken: config.apiToken,
    resolveMeetingId,
    ...(config.apiBase ? { apiBase: config.apiBase } : {}),
    ...(config.allowedApiHosts.length > 0
      ? { allowedApiHosts: config.allowedApiHosts }
      : {}),
  });

  try {
    const credentials = await exchangeTrustedMediaCapability(
      {
        capabilityToken: input.capabilityToken,
        expectedRoomId: roomId,
        expectedUserId: userData.user.id,
        expectedAuthoritySequence: input.authoritySequence,
      },
      adapter,
      config.mediaSessionSecret,
    );

    await replaceTrackedMediaProviderSession(
      sessionStore,
      participantRevoker,
      {
        roomId,
        userId: userData.user.id,
        providerParticipantId: credentials.providerParticipantId,
        authoritySequence: credentials.authoritySequence,
        role: credentials.verifiedRole,
        expiresAt: credentials.expiresAt,
      },
    );

    const publicCredentials = {
      provider: credentials.provider,
      participantToken: credentials.participantToken,
      expiresAt: credentials.expiresAt,
    };

    return NextResponse.json(publicCredentials, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Do not expose capability, provider, database, or credential-validation details.
    return NextResponse.json(
      { error: "Unable to establish an authorized media session." },
      { status: 403 },
    );
  }
}

async function readRequest(request: Request): Promise<MediaSessionRequest | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;

  const record = body as Record<string, unknown>;
  const capabilityToken = record.capabilityToken;
  const authoritySequence = record.authoritySequence;
  if (
    typeof capabilityToken !== "string" ||
    capabilityToken.length < 16 ||
    capabilityToken.length > 4096 ||
    !Number.isSafeInteger(authoritySequence) ||
    (authoritySequence as number) < 0
  ) {
    return null;
  }

  return {
    capabilityToken,
    authoritySequence: authoritySequence as number,
  };
}

function readServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mediaSessionSecret = process.env.MEDIA_SESSION_AUTH_SECRET;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const appId = process.env.REALTIMEKIT_APP_ID;
  const apiToken = process.env.CLOUDFLARE_REALTIME_API_TOKEN;
  const subscribeOnlyPreset = process.env.REALTIMEKIT_SUBSCRIBE_ONLY_PRESET;
  const publisherPreset = process.env.REALTIMEKIT_PUBLISHER_PRESET;
  const roomBrainSecret = process.env.ROOM_BRAIN_AUTH_SECRET;
  const roomBrainWebsocketUrl = process.env.NEXT_PUBLIC_ROOM_BRAIN_WS_URL;

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !mediaSessionSecret ||
    mediaSessionSecret.length < 32 ||
    !accountId ||
    !appId ||
    !apiToken ||
    !subscribeOnlyPreset ||
    !publisherPreset ||
    !roomBrainSecret ||
    roomBrainSecret.length < 32 ||
    !roomBrainWebsocketUrl
  ) {
    return null;
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    mediaSessionSecret,
    accountId,
    appId,
    apiToken,
    subscribeOnlyPreset,
    publisherPreset,
    roomBrainSecret,
    roomBrainWebsocketUrl,
    roomBrainAllowedHosts: (process.env.ROOM_BRAIN_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    apiBase: process.env.REALTIMEKIT_API_BASE?.trim() || undefined,
    allowedApiHosts: (process.env.REALTIMEKIT_ALLOWED_API_HOSTS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}
