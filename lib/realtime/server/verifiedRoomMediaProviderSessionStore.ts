import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseRoomMediaProviderSessionStore,
  type RoomMediaProviderSessionStore,
} from "./roomMediaProviderSession";

/**
 * Wraps the provider-session store with a strict reconciliation scheduler.
 *
 * Supabase update calls can succeed while matching zero rows. For revocation
 * cleanup that is not good enough: callers must only report reconciliation as
 * durable when the unresolved handle still exists and was actually updated.
 */
export function createVerifiedSupabaseRoomMediaProviderSessionStore(
  adminClient: SupabaseClient,
): RoomMediaProviderSessionStore {
  const store = createSupabaseRoomMediaProviderSessionStore(adminClient);

  return {
    ...store,
    async requestReconciliation(roomId, userId, providerParticipantId) {
      const now = new Date().toISOString();
      const { data, error } = await adminClient
        .from("room_media_provider_sessions")
        .update({
          reconciliation_requested_at: now,
          next_reconciliation_at: now,
          reconciliation_lease_until: null,
        })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("provider_participant_id", providerParticipantId)
        .is("revoked_at", null)
        .select("id")
        .maybeSingle();

      if (error || !data?.id) {
        throw new Error(
          "Unable to verify provider media reconciliation was scheduled",
        );
      }
    },
  };
}
