import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export default async function DiscoverPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth");

  const [{ data: people }, { data: rooms }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,handle,display_name,bio,current_intent,interests")
      .neq("id", userData.user.id)
      .not("onboarding_completed_at", "is", null)
      .limit(12),
    supabase
      .from("rooms")
      .select("id,title,description,current_intent,max_participants,status")
      .eq("status", "open")
      .limit(12),
  ]);

  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand"><span className="brandMark">P+</span><span>Discover</span></div>
        <div className="heroActions" style={{ marginTop: 0 }}>
          <a className="secondaryButton" href="/rooms/lab">Live room lab</a>
          <form action={signOut}><button className="secondaryButton" type="submit">Sign out</button></form>
        </div>
      </nav>

      <section className="section">
        <p className="sectionLabel">PEOPLE</p>
        <h2>Find conversation before popularity.</h2>
        <div className="roomGrid" style={{ marginTop: 28 }}>
          {(people ?? []).map((person) => (
            <article className="roomCard" key={person.id}>
              <span className="roomMeta">{person.current_intent?.replaceAll("_", " ")}</span>
              <h3>{person.display_name}</h3>
              <p>@{person.handle}</p>
              <p>{person.bio}</p>
              <p className="walletNote">{person.interests?.join(" · ")}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" style={{ paddingBottom: 90 }}>
        <p className="sectionLabel">ROOMS</p>
        <h2>Small spaces with an explicit purpose.</h2>
        <div className="roomGrid" style={{ marginTop: 28 }}>
          {(rooms ?? []).map((room) => (
            <article className="roomCard" key={room.id}>
              <span className="roomMeta">{room.current_intent?.replaceAll("_", " ")} · up to {room.max_participants}</span>
              <h3>{room.title}</h3>
              <p>{room.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
