import { WalletPanel } from "@/components/WalletPanel";

const intents = ["Talk", "Meet", "Deep Conversation", "Create", "Debate", "Listen"];

const rooms = [
  {
    title: "What changed your mind lately?",
    meta: "6 people · Deep Conversation",
    description: "A small room for ideas you no longer hold as tightly as you once did.",
  },
  {
    title: "Late-night makers",
    meta: "4 people · Create",
    description: "Share what you are building and find one person who can sharpen it.",
  },
  {
    title: "No-feed coffee table",
    meta: "3 people · Hang Out",
    description: "Nothing to perform. Just a quiet room for an actual conversation.",
  },
];

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand">
          <span className="brandMark">P+</span>
          <span>Ponder+</span>
        </div>
        <span className="statusPill">v0.1 · engineering preview</span>
      </nav>

      <section className="hero">
        <div className="eyebrow">AUTHENTIC SOCIAL INFRASTRUCTURE</div>
        <h1>Less broadcasting.<br />More belonging.</h1>
        <p className="heroCopy">
          Ponder+ is being built around conversations people want to continue,
          not feeds they cannot stop scrolling.
        </p>
        <div className="heroActions">
          <a className="primaryButton" href="#rooms">Explore the social shell</a>
          <a className="secondaryButton" href="#wallet">Try the crypto foundation</a>
        </div>
      </section>

      <section className="panel intentPanel">
        <div>
          <p className="sectionLabel">ENTER WITH INTENT</p>
          <h2>What kind of connection do you want right now?</h2>
        </div>
        <div className="chips">
          {intents.map((intent) => (
            <button className="chip" key={intent} type="button">{intent}</button>
          ))}
        </div>
      </section>

      <section id="rooms" className="section">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">SMALL ROOMS</p>
            <h2>Spaces designed for conversation, not audience size.</h2>
          </div>
          <span className="quietMetric">North star: meaningful connections / active user</span>
        </div>
        <div className="roomGrid">
          {rooms.map((room) => (
            <article className="roomCard" key={room.title}>
              <span className="roomMeta">{room.meta}</span>
              <h3>{room.title}</h3>
              <p>{room.description}</p>
              <button type="button" className="roomButton">Enter room</button>
            </article>
          ))}
        </div>
      </section>

      <section id="wallet" className="section split">
        <div>
          <p className="sectionLabel">VALUE LAYER</p>
          <h2>Crypto should disappear into the experience.</h2>
          <p className="bodyCopy">
            The first on-chain spike uses a Base Account smart wallet and test USDC
            on Base Sepolia. No real funds are required. Ponder+ keeps social state
            off-chain and uses blockchain only where settlement or portable ownership adds value.
          </p>
          <ul className="principles">
            <li>Normal social use never requires crypto.</li>
            <li>Testnet first; mainnet is explicitly out of scope for v0.1.</li>
            <li>Money movement is modeled with a balanced internal ledger.</li>
            <li>No private keys or seed phrases are stored by Ponder+.</li>
          </ul>
        </div>
        <WalletPanel />
      </section>

      <section className="panel roadmapPanel">
        <p className="sectionLabel">BUILD SEQUENCE</p>
        <div className="roadmap">
          <div><strong>01</strong><span>Social shell</span></div>
          <div><strong>02</strong><span>Base test wallet</span></div>
          <div><strong>03</strong><span>USDC test tips</span></div>
          <div><strong>04</strong><span>Persistent ledger</span></div>
          <div><strong>05</strong><span>Profiles + messaging</span></div>
        </div>
      </section>

      <footer>
        <span>Ponder+ · Build relationships, not reach.</span>
        <span>Base Sepolia testnet only in this milestone.</span>
      </footer>
    </main>
  );
}
