import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildRealtimeTranslationSession } from "@/lib/translation/config";

export const dynamic = "force-dynamic";

function safetyIdentifier(userId: string) {
  return createHash("sha256").update(userId).digest("hex");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
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
      { error: "Complete onboarding before using live translation." },
      { status: 403 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Realtime translation is not configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { targetLanguage?: unknown };
    const session = buildRealtimeTranslationSession(body.targetLanguage);

    const response = await fetch(
      "https://api.openai.com/v1/realtime/translations/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifier(data.user.id),
        },
        body: JSON.stringify(session),
        cache: "no-store",
      },
    );

    const payload = await response.json().catch(() => ({
      error: { message: "OpenAI returned a non-JSON response." },
    }));

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error?.message ??
            "Unable to create a realtime translation session.",
        },
        { status: response.status },
      );
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof RangeError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown translation error." },
      { status },
    );
  }
}
