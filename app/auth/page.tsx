import { signIn, signUp } from "./actions";

export default function AuthPage() {
  return (
    <main className="shell">
      <section className="hero" style={{ minHeight: 320 }}>
        <div className="eyebrow">PONDER+ IDENTITY</div>
        <h1 style={{ fontSize: "clamp(46px, 8vw, 82px)" }}>Enter as yourself.</h1>
        <p className="heroCopy">
          Authentication is the continuity layer for conversations, reconnects,
          reputation, and eventually portable wallet identity.
        </p>
      </section>

      <section className="roomGrid" style={{ paddingBottom: 80 }}>
        <form className="roomCard" action={signUp}>
          <span className="roomMeta">CREATE ACCOUNT · 18+</span>
          <h3>Join Ponder+</h3>
          <label>Email<input name="email" type="email" required /></label>
          <label>Password<input name="password" type="password" minLength={8} required /></label>
          <label>Date of birth<input name="date_of_birth" type="date" required /></label>
          <p className="walletNote">Age is self-attested in v0.2. Stronger verification is a later safety milestone.</p>
          <button className="roomButton" type="submit">Create account</button>
        </form>

        <form className="roomCard" action={signIn}>
          <span className="roomMeta">RETURN</span>
          <h3>Sign in</h3>
          <label>Email<input name="email" type="email" required /></label>
          <label>Password<input name="password" type="password" required /></label>
          <button className="roomButton" type="submit">Continue</button>
        </form>
      </section>
    </main>
  );
}
