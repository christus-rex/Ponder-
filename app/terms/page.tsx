export default function TermsPage() {
  return (
    <main className="shell">
      <section className="hero" style={{ minHeight: 260 }}>
        <div className="eyebrow">ALPHA PARTICIPATION TERMS</div>
        <h1 style={{ fontSize: "clamp(42px, 7vw, 72px)" }}>Ponder+ Alpha Terms</h1>
        <p className="lede">
          Development draft for private alpha testing. Final public-launch terms will require legal review.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 80 }}>
        <h2>Adults only</h2>
        <p>Ponder+ is currently limited to people age 18 and older. Do not create or use an account if you are under 18.</p>

        <h2>What this alpha is for</h2>
        <p>
          The alpha is for testing live social conversation, creator communities, safety controls,
          translation, and experimental demo/testnet value features.
        </p>

        <h2>Content boundaries</h2>
        <p>
          Mature conversation, relationships, nightlife, dating, and adult wellness topics may be
          discussed within policy. Explicit sexual content, sexual exploitation, sexual content involving
          minors, non-consensual sexual content, threats, harassment, hate, illegal activity, and attempts
          to evade moderation are prohibited.
        </p>

        <h2>Safety and moderation</h2>
        <p>
          Ponder+ may restrict, remove, or preserve content and account activity for abuse prevention,
          moderation, security testing, and incident review. Use report and block tools when needed.
        </p>

        <h2>Experimental value features</h2>
        <p>
          Demo Ponder Coins and Base Sepolia assets used in the alpha have no promised cash value.
          Production purchases, payouts, and real-money settlement are not enabled by these alpha terms.
        </p>

        <h2>No production guarantee</h2>
        <p>
          Features may change, reset, or be unavailable during development. Do not rely on the alpha for
          emergency, financial, legal, medical, or other high-stakes services.
        </p>
      </section>
    </main>
  );
}
