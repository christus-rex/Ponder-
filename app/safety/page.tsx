export default function SafetyPage() {
  return (
    <main className="shell">
      <section className="hero" style={{ minHeight: 260 }}>
        <div className="eyebrow">COMMUNITY SAFETY</div>
        <h1 style={{ fontSize: "clamp(42px, 7vw, 72px)" }}>Adults can be open without being unsafe.</h1>
        <p className="lede">Ponder+ is mature social space, not a permission slip for abuse.</p>
      </section>

      <section className="panel" style={{ marginBottom: 80 }}>
        <h2>Hard boundaries</h2>
        <ul>
          <li>No minors or attempts to involve minors in adult spaces.</li>
          <li>No explicit sexual exploitation, coercion, or non-consensual sexual content.</li>
          <li>No threats, targeted harassment, hate, stalking, or doxxing.</li>
          <li>No impersonation, fraud, spam, or attempts to manipulate payments or account privileges.</li>
          <li>No evasion of room moderation, bans, safety controls, or age restrictions.</li>
        </ul>

        <h2>Room controls</h2>
        <p>
          Hosts and moderators are expected to remove disruptive participants, respond to reports,
          and end a room when safety cannot be maintained.
        </p>

        <h2>Report and block</h2>
        <p>
          Reports should capture enough context for review. Blocking is designed to create immediate
          separation between users and should be respected across room and messaging surfaces.
        </p>

        <h2>Underage concern</h2>
        <p>
          If a participant may be under 18, use the underage-concern report path. Access should be limited
          while the concern is reviewed rather than treating age uncertainty as ordinary room conflict.
        </p>
      </section>
    </main>
  );
}
