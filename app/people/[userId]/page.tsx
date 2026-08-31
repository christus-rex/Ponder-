import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { createClient } from "@/lib/supabase/server";
import { requestConnection } from "../actions";

type PersonPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ batch?: string; connected?: string }>;
};

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

export default async function PersonPage({ params, searchParams }: PersonPageProps) {
  const { userId } = await params;
  const query = await searchParams;

  if (!isUuid(userId)) notFound();

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth");
  if (userData.user.id === userId) redirect("/onboarding");

  const [{ data: profile }, { data: outbound }, { data: inbound }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,handle,display_name,bio,current_intent,interests")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("connections")
      .select("status")
      .eq("requester_id", userData.user.id)
      .eq("addressee_id", userId)
      .maybeSingle(),
    supabase
      .from("connections")
      .select("status")
      .eq("requester_id", userId)
      .eq("addressee_id", userData.user.id)
      .maybeSingle(),
  ]);

  if (!profile) notFound();

  const batchId = isUuid(query.batch) ? query.batch : null;
  if (batchId) {
    await supabase.rpc("record_resonance_outcome", {
      p_batch_id: batchId,
      p_candidate_id: userId,
      p_outcome_kind: "profile_opened",
      p_room_id: null,
    });
  }

  const connectionStatus = outbound?.status ?? inbound?.status ?? null;
  const canConnect = connectionStatus !== "pending" && connectionStatus !== "accepted" && connectionStatus !== "blocked";

  return (
    <main className="shell">
      <PresenceHeartbeat />

      <nav className="nav">
        <Link className="brand" href="/discover">
          <span className="brandMark">P+</span>
          <span>Back to discover</span>
        </Link>
        <span className="statusPill">{profile.current_intent?.replaceAll("_", " ")}</span>
      </nav>

      <section className="hero" style={{ minHeight: 320 }}>
        <div className="eyebrow">RESONANCE PROFILE</div>
        <h1 style={{ fontSize: "clamp(44px, 7vw, 76px)" }}>{profile.display_name}</h1>
        <p className="lede">@{profile.handle}</p>
      </section>

      <section className="panel" style={{ marginBottom: 80 }}>
        <p>{profile.bio || "Here to meet people through real conversation."}</p>
        <p className="walletNote" style={{ marginTop: 16 }}>
          {profile.interests?.join(" · ") || "No interests listed yet"}
        </p>

        {query.connected === "1" ? (
          <div className="notice" style={{ marginTop: 20 }}>
            Connection state updated.
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          {canConnect ? (
            <form action={requestConnection}>
              <input type="hidden" name="candidate_id" value={userId} />
              {batchId ? <input type="hidden" name="batch_id" value={batchId} /> : null}
              <button className="primaryButton" type="submit">
                Connect
              </button>
            </form>
          ) : (
            <span className="statusPill">
              {connectionStatus === "accepted"
                ? "Connected"
                : connectionStatus === "blocked"
                  ? "Unavailable"
                  : "Connection pending"}
            </span>
          )}

          <Link className="secondaryButton" href="/discover">
            Keep exploring
          </Link>
        </div>
      </section>
    </main>
  );
}
