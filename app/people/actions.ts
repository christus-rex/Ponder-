"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function uuidField(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function requestConnection(formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth");

  const candidateId = uuidField(formData, "candidate_id");
  const batchId = uuidField(formData, "batch_id");

  if (!candidateId) throw new Error("Invalid connection candidate.");

  const { error } = await supabase.rpc("request_connection_from_resonance", {
    p_candidate_id: candidateId,
    p_batch_id: batchId,
  });

  if (error) throw new Error(error.message);

  const query = batchId ? `?batch=${encodeURIComponent(batchId)}&connected=1` : "?connected=1";
  redirect(`/people/${candidateId}${query}`);
}
