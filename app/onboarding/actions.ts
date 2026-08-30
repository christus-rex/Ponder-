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
