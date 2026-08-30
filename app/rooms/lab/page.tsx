import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveTranslationLab } from "@/components/LiveTranslationLab";

const participants = [
  { name: "Maya", detail: "English · speaking" },
  { name: "Alejandro", detail: "Spanish · listening" },
  { name: "Nadia", detail: "Arabic · listening" },
];

export default async function RoomLabPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/auth");

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/discover">
          <span className="brandMark">P+</span>
          <span>Live room lab</span>
        </a>
        <span className="statusPill">room-native translator · v0.3</span>
      </nav>

      <section className="roomLabHero">
        <p className="sectionLabel">LIVE ROOM ENGINEERING</p>
        <h1>One room.<br />Many languages.</h1>
        <p className="heroCopy">
          Translation is a listener preference, not a room-wide rewrite.
          Original audio remains available while translated audio and captions
          run as an optional sidecar.
        </p>
      </section>

      <section className="participantStrip">
        {participants.map((participant) => (
          <article className="participantTile" key={participant.name}>
            <div className="participantAvatar">{participant.name.slice(0, 1)}</div>
            <div>
              <strong>{participant.name}</strong>
              <span>{participant.detail}</span>
            </div>
          </article>
        ))}
      </section>

      <LiveTranslationLab />

      <section className="panel roomArchitecture">
        <p className="sectionLabel">PRODUCTION FLOW</p>
        <div className="architectureSteps">
          <div><strong>01</strong><span>RealtimeKit emits participant audioTrack</span></div>
          <div><strong>02</strong><span>Ponder+ starts sidecar only when requested</span></div>
          <div><strong>03</strong><span>OpenAI streams translated audio + captions</span></div>
          <div><strong>04</strong><span>Listener can stop or change language anytime</span></div>
        </div>
      </section>
    </main>
  );
}
