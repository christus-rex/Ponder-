"use server";

import { redirect } from "next/navigation";
import { isAtLeast18 } from "@/lib/auth/age";
import { POST_AUTH_DESTINATION } from "@/lib/auth/routeAccess";
import { createClient } from "@/lib/supabase/server";

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function signUp(formData: FormData) {
  const email = stringField(formData, "email");
  const password = stringField(formData, "password");
  const dateOfBirth = stringField(formData, "date_of_birth");

  if (!email || password.length < 8) {
    throw new Error("Use a valid email and a password of at least 8 characters.");
  }

  if (!isAtLeast18(dateOfBirth)) {
    throw new Error("Ponder+ accounts are limited to adults age 18 and older.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        date_of_birth: dateOfBirth,
        age_attestation: "self_attested",
      },
    },
  });

  if (error) throw new Error(error.message);
  redirect(data.session ? POST_AUTH_DESTINATION : "/auth/check-email");
}

export async function signIn(formData: FormData) {
  const email = stringField(formData, "email");
  const password = stringField(formData, "password");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) throw new Error(error.message);
  redirect(POST_AUTH_DESTINATION);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth");
}
