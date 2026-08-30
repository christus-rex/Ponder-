import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth");

  const [{ data: profile }, { data: privateRecord }, { data: preferences }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("handle,display_name,bio,current_intent,interests")
        .eq("id", userData.user.id)
        .maybeSingle(),
      supabase
        .from("user_private")
        .select("terms_accepted_at")
        .eq("id", userData.user.id)
        .maybeSingle(),
      supabase
        .from("user_preferences")
        .select("mature_content_preference")
        .eq("id", userData.user.id)
        .maybeSingle(),
    ]);

  const termsAccepted = Boolean(privateRecord?.terms_accepted_at);

  return (
    <main className="shell">
      <section className="hero" style={{ minHeight: 300 }}>
        <div className="eyebrow">BUILD YOUR SOCIAL SIGNAL</div>
        <h1 style={{ fontSize: "clamp(44px, 7vw, 76px)" }}>Who are you here to be?</h1>
        <p className="lede">
          Your public identity stays separate from private age and safety settings.
        </p>
      </section>

      <form className="panel" action={saveProfile} style={{ marginBottom: 80 }}>
        <div className="roomGrid">
          <label>
            Handle
            <input name="handle" defaultValue={profile?.handle ?? ""} placeholder="your_handle" required />
          </label>
          <label>
            Display name
            <input name="display_name" defaultValue={profile?.display_name ?? ""} required />
          </label>
          <label>
            Intent
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

        <label>
          Bio
          <textarea name="bio" defaultValue={profile?.bio ?? ""} maxLength={500} />
        </label>

        <label>
          Interests
          <input
            name="interests"
            defaultValue={profile?.interests?.join(", ") ?? ""}
            placeholder="music, philosophy, design"
          />
        </label>

        <label>
          Mature-topic discovery
          <select
            name="mature_content_preference"
            defaultValue={preferences?.mature_content_preference ?? "standard_mature"}
          >
            <option value="standard_mature">Standard Mature — adult conversation without elevated After Dark discovery</option>
            <option value="after_dark">After Dark — include dating, intimacy, nightlife, and late-night topics within policy</option>
            <option value="hide_mature_topics">Hide Mature Topics — minimize mature-topic recommendations</option>
          </select>
        </label>

        {termsAccepted ? (
          <div className="notice" style={{ marginTop: 20 }}>
            Alpha Terms accepted. Your acceptance timestamp is server-controlled and cannot be rewritten by the client.
          </div>
        ) : (
          <label style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              name="terms_acceptance"
              required
              style={{ width: 20, height: 20, marginTop: 3 }}
            />
            <span>
              I am 18 or older and agree to the{" "}
              <Link href="/terms">Ponder+ Alpha Terms</Link> and{" "}
              <Link href="/safety">Community Safety rules</Link>.
            </span>
          </label>
        )}

        <button className="primaryButton" type="submit" style={{ marginTop: 20 }}>
          Enter Ponder+
        </button>
      </form>
    </main>
  );
}
