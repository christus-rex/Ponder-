import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createLiveRoomServerRuntime } from "@/lib/realtime/server/liveRoomServerRuntime";
import { reconcileTrackedMediaSessions } from "@/lib/realtime/server/roomMediaProviderSession";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configuredSecret = process.env.MEDIA_RECONCILIATION_SECRET?.trim();
  if (!configuredSecret || configuredSecret.length < 32) {
    return NextResponse.json(
      { error: "Media reconciliation is not configured." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const providedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!secretsEqual(configuredSecret, providedSecret)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const runtime = createLiveRoomServerRuntime();
  if (!runtime) {
    return NextResponse.json(
      { error: "Media reconciliation runtime is unavailable." },
      { status: 503 },
    );
  }

  try {
    const result = await reconcileTrackedMediaSessions(
      runtime.sessionStore,
      runtime.participantRevoker,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Media reconciliation pass failed." },
      { status: 503 },
    );
  }
}

function secretsEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  if (expectedBytes.length !== actualBytes.length) return false;
  return timingSafeEqual(expectedBytes, actualBytes);
}
