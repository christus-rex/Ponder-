import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle,display_name,bio,current_intent,interests")
    .eq("id", userData.user.id)
    .maybeSingle();

  return (
    <main className="shell">
      <section className="hero" style={{ minHeight: 300 }}>
        <div className="eyebrow">BUILD YOUR SOCIAL SIGNAL</div>
        <h1 style={{ fontSize: "clamp(44px, 7vw, 76px)" }}>Who are you here to be?</h1>
      </section>

      <form className="panel" action={saveProfile} style={{ marginBottom: 80 }}>
        <div className="roomGrid">
          <label>Handle<input name="handle" defaultValue={profile?.handle ?? ""} placeholder="your_handle" required /></label>
          <label>Display name<input name="display_name" defaultValue={profile?.display_name ?? ""} required /></label>
          <label>Intent
            <select name="intent" defaultValue={profile?.current_intent ?? "talk"}>
              <option value="talk">Talk</option>
              <option value="meet">Meet people</option>
              <option value="deep_conversation">Deep conversation</option>
              <option value="create">Create</option>
              <option value="debate">Debate</option>
              <option value="listen">Listen</option>
              <option value="hang_out">Hang out</option>
            </select>
          </label>
        </div>
        <label>Bio<textarea name="bio" defaultValue={profile?.bio ?? ""} maxLength={500} /></label>
        <label>Interests<input name="interests" defaultValue={profile?.interests?.join(", ") ?? ""} placeholder="music, philosophy, design" /></label>
        <button className="primaryButton" type="submit" style={{ marginTop: 20 }}>Enter Ponder+</button>
      </form>
    </main>
  );
}
