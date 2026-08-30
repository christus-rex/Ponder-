import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

type AccessContext = {
  account_status?: string;
  restriction_reason?: string | null;
  role?: string | null;
  can_enter?: boolean;
};

export default async function RestrictedAccountPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect("/auth");

  const { data } = await supabase.rpc("current_access_context");
  const access = data as AccessContext | null;

  if (access?.account_status === "active") {
    redirect(access.can_enter ? "/discover" : "/onboarding");
  }

  return (
    <main className="shell">
      <section className="hero" style={{ minHeight: 360 }}>
        <div className="eyebrow">PONDER+ IDENTITY</div>
        <h1 style={{ fontSize: "clamp(44px, 7vw, 76px)" }}>
          Account access restricted.
        </h1>
        <p className="heroCopy">
          Your sign-in still works, but the central authorization service has
          disabled access to rooms, messages, connections, wallets, and other
          member-only features.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 80 }}>
        <p>
          <strong>Status:</strong> {access?.account_status ?? "unavailable"}
        </p>
        {access?.restriction_reason ? (
          <p>
            <strong>Reason:</strong> {access.restriction_reason}
          </p>
        ) : null}
        <p className="walletNote">
          Authorization state is server-owned and cannot be changed from the client.
        </p>
        <form action={signOut}>
          <button className="secondaryButton" type="submit">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
