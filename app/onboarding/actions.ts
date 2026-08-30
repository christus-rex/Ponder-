"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const allowedIntents = new Set([
  "talk",
  "meet",
  "deep_conversation",
  "create",
  "debate",
  "listen",
  "hang_out",
]);

const allowedMaturePreferences = new Set([
  "standard_mature",
  "after_dark",
  "hide_mature_topics",
]);

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) redirect("/auth");

  const handle = field(formData, "handle").toLowerCase();
  const displayName = field(formData, "display_name");
  const bio = field(formData, "bio");
  const intent = field(formData, "intent");
  const maturePreference = field(formData, "mature_content_preference");
  const acceptedTermsThisSubmit = formData.get("terms_acceptance") === "on";
  const interests = field(formData, "interests")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
    throw new Error("Handle must be 3–24 characters using letters, numbers, or underscore.");
  }
  if (!displayName || displayName.length > 60) {
    throw new Error("Display name is required and must be 60 characters or fewer.");
  }
  if (!allowedIntents.has(intent)) {
    throw new Error("Choose a valid social intent.");
  }
  if (!allowedMaturePreferences.has(maturePreference)) {
    throw new Error("Choose a valid mature-content preference.");
  }

  const { data: privateRecord, error: privateError } = await supabase
    .from("user_private")
    .select("terms_accepted_at")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (privateError) throw new Error(privateError.message);

  if (!privateRecord?.terms_accepted_at && !acceptedTermsThisSubmit) {
    throw new Error("Accept the Ponder+ Alpha Terms and Community Safety rules to continue.");
  }

  const { error: preferencesError } = await supabase
    .from("user_preferences")
    .update({ mature_content_preference: maturePreference })
    .eq("id", userData.user.id);

  if (preferencesError) throw new Error(preferencesError.message);

  if (!privateRecord?.terms_accepted_at) {
    const { error: termsError } = await supabase
      .from("user_private")
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq("id", userData.user.id);

    if (termsError) throw new Error(termsError.message);
  }

  // Mark onboarding complete last. The database independently verifies that
  // Terms are accepted and a preferences row exists before allowing this write.
  const { error } = await supabase
    .from("profiles")
    .update({
      handle,
      display_name: displayName,
      bio: bio.slice(0, 500),
      current_intent: intent,
      interests,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", userData.user.id);

  if (error) throw new Error(error.message);
  redirect("/discover");
}
