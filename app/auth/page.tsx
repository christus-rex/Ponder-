import { signIn, signUp } from "./actions";
import styles from "./auth.module.css";

export default function AuthPage() {
  return (
    <main className={styles.authShell}>
      <section className={styles.brandPanel}>
        <div className={styles.brandRow}>
          <span className={styles.brandMark}>P+</span>
          <span>Ponder+</span>
        </div>

        <div className={styles.brandCopy}>
          <p className={styles.kicker}>AUTHENTIC SOCIAL · 18+</p>
          <h1>Come as yourself.</h1>
          <p>
            Your Ponder+ identity keeps conversations, connections, room access,
            reputation, and future wallet features continuous across the
            experience.
          </p>
        </div>

        <div className={styles.trustRow} aria-label="Ponder+ identity promises">
          <span className={styles.trustChip}>Private by default</span>
          <span className={styles.trustChip}>One identity across devices</span>
          <span className={styles.trustChip}>Adult community</span>
        </div>
      </section>

      <section className={styles.loginPanel} aria-label="Ponder+ sign in">
        <div className={styles.loginCard}>
          <div className={styles.cardMeta}>
            <span className={styles.secureLabel}>
              <span className={styles.secureDot} aria-hidden="true" />
              Secure credential login
            </span>
            <span className={styles.ageBadge}>18+</span>
          </div>

          <h2>Welcome back.</h2>
          <p className={styles.cardIntro}>
            Sign in to continue to your Ponder+ experience.
          </p>

          <form className={styles.form} action={signIn}>
            <label className={styles.field}>
              Email
              <input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>

            <label className={styles.field}>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
            </label>

            <button className={styles.primaryButton} type="submit">
              Log in to Ponder+
            </button>
          </form>

          <div className={styles.divider}>NEW HERE?</div>

          <details className={styles.createPanel}>
            <summary>Create a Ponder+ account</summary>
            <form className={styles.createForm} action={signUp}>
              <label className={styles.field}>
                Email
                <input
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                />
              </label>

              <label className={styles.field}>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>

              <label className={styles.field}>
                Date of birth
                <input
                  name="date_of_birth"
                  type="date"
                  autoComplete="bday"
                  required
                />
              </label>

              <p className={styles.note}>
                Ponder+ is for adults 18 and older. Age is self-attested in this
                release; stronger verification remains a safety milestone.
              </p>

              <button className={styles.secondaryButton} type="submit">
                Create account
              </button>
            </form>
          </details>

          <div className={styles.cardFooter}>
            <a href="/terms">Terms</a>
            <a href="/safety">Safety</a>
            <span>Protected by Ponder+ Identity</span>
          </div>
        </div>
      </section>
    </main>
  );
}
