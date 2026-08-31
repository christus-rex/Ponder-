import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { CreateRoomPanel } from "@/components/CreateRoomPanel";
import {
  rankResonance,
  scoreIntentAffinity,
  type SocialIntent,
} from "@/packages/domain/src/matching";

export default async function DiscoverPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth");

  const [{ data: viewer }, { data: people }, { data: rooms }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,current_intent,interests")
      .eq("id", userData.user.id)
      .single(),
    supabase
      .from("profiles")
      .select("id,handle,display_name,bio,current_intent,interests")
      .neq("id", userData.user.id)
      .not("onboarding_completed_at", "is", null)
      .limit(48),
    supabase
      .from("rooms")
      .select("id,title,description,current_intent,max_participants,status")
      .eq("status", "open")
      .limit(24),
  ]);

  const viewerProfile = viewer
    ? {
        id: viewer.id,
        intent: viewer.current_intent as SocialIntent,
        interests: viewer.interests ?? [],
      }
    : null;

  const peoplePool = people ?? [];
  const presenceByUser = new Map<string, boolean>();

  if (peoplePool.length > 0) {
    const { data: presenceRows } = await supabase.rpc("presence_for_candidates", {
      p_candidate_ids: peoplePool.map((person) => person.id),
    });

    for (const row of presenceRows ?? []) {
      if (typeof row?.user_id === "string") {
        presenceByUser.set(row.user_id, row.available_now === true);
      }
    }
  }

  const rankedPeople = viewerProfile
    ? rankResonance(
        viewerProfile,
        peoplePool.map((person) => ({
          ...person,
          intent: person.current_intent as SocialIntent,
          interests: person.interests ?? [],
          availableNow: presenceByUser.get(person.id) ?? false,
        })),
      ).slice(0, 12)
    : [];

  let resonanceBatchId: string | null = null;
  if (rankedPeople.length > 0) {
    const { data: batchId } = await supabase.rpc("record_resonance_impression_batch", {
      p_candidate_ids: rankedPeople.map(({ candidate }) => candidate.id),
      p_scores: rankedPeople.map(({ resonance }) => resonance.score),
      p_reason_codes: rankedPeople.map(
        ({ resonance }) => resonance.reasonCode ?? "compatible_intent",
      ),
    });

    resonanceBatchId = typeof batchId === "string" ? batchId : null;
  }

  const rankedRooms = (rooms ?? [])
    .map((room) => ({
      room,
      intentFit: viewerProfile
        ? Math.round(
            scoreIntentAffinity(
              viewerProfile.intent,
              room.current_intent as SocialIntent,
            ) * 100,
          )
        : null,
    }))
    .sort((a, b) => (b.intentFit ?? 0) - (a.intentFit ?? 0))
    .slice(0, 12);

  return (
    <main className="shell">
      <PresenceHeartbeat />
      <nav className="nav">
        <div className="brand">
          <span className="brandMark">P+</span>
          <span>Discover</span>
        </div>

        <details className="appMenu">
          <summary className="secondaryButton appMenuTrigger">Menu</summary>
          <div className="appMenuPanel">
            <a className="appMenuItem" href="/onboarding">
              <span>Profile & preferences</span>
              <small>Identity, interests, mature-topic settings</small>
            </a>
            <a className="appMenuItem" href="/rooms/lab">
              <span>Translation</span>
              <small>Live room language tools</small>
            </a>
            <form action={signOut}>
              <button className="appMenuItem appMenuSignOut" type="submit">
                <span>Sign out</span>
                <small>End this session</small>
              </button>
            </form>
          </div>
        </details>
      </nav>

      <section className="section">
        <p className="sectionLabel">RESONANCE</p>
        <h2>Find conversation before popularity.</h2>
        <p className="walletNote" style={{ marginTop: 10 }}>
          Ranked by conversational intent and shared interests. Live availability can add at most four points — never gifting or spend.
        </p>
        <div className="roomGrid" style={{ marginTop: 28 }}>
          {rankedPeople.map(({ candidate: person, resonance }) => (
            <article
              className="roomCard"
              data-resonance-batch={resonanceBatchId ?? undefined}
              data-resonance-candidate={person.id}
              key={person.id}
            >
              <span className="roomMeta">
                {person.current_intent?.replaceAll("_", " ")} · {resonance.score} resonance
                {person.availableNow ? " · available now" : ""}
              </span>
              <h3>{person.display_name}</h3>
              <p>@{person.handle}</p>
              <p>{person.bio}</p>
              <p className="walletNote">{person.interests?.join(" · ")}</p>
              <p className="walletNote">{resonance.reasons.join(" · ")}</p>
              <a
                className="secondaryButton"
                href={`/people/${person.id}${resonanceBatchId ? `?batch=${encodeURIComponent(resonanceBatchId)}` : ""}`}
                style={{ marginTop: 16, display: "inline-flex" }}
              >
                View profile
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="section" style={{ paddingBottom: 90 }}>
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">ROOMS</p>
            <h2>Small spaces with an explicit purpose.</h2>
          </div>
          <CreateRoomPanel />
        </div>
        <div className="roomGrid" style={{ marginTop: 28 }}>
          {rankedRooms.map(({ room, intentFit }) => (
            <article className="roomCard" key={room.id}>
              <span className="roomMeta">
                {room.current_intent?.replaceAll("_", " ")} · up to {room.max_participants}
                {intentFit !== null ? ` · ${intentFit} intent fit` : ""}
              </span>
              <h3>{room.title}</h3>
              <p>{room.description}</p>
              <a className="roomButton" href={`/rooms/${room.id}`}>
                Enter room
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
