import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type RoomMembershipEntryState = "active" | "ejected";

export type RoomMembershipRecord = {
  roomId: string;
  userId: string;
  entryState: RoomMembershipEntryState;
  leftAt: string | null;
  ejectedAt: string | null;
};

export interface RoomMembershipAdminStore {
  getMembership(
    roomId: string,
    userId: string,
  ): Promise<RoomMembershipRecord | null>;
  ensureActiveMembership(
    roomId: string,
    userId: string,
  ): Promise<RoomMembershipEntryState>;
  markMembershipLeft(
    roomId: string,
    userId: string,
  ): Promise<RoomMembershipEntryState | "missing">;
  hostEjectMember(input: {
    roomId: string;
    targetUserId: string;
    actorUserId: string;
    reason: string;
  }): Promise<number>;
}

export function createRoomMembershipAdminStoreFromEnv():
  | RoomMembershipAdminStore
  | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return createSupabaseRoomMembershipAdminStore(admin);
}

export function createSupabaseRoomMembershipAdminStore(
  adminClient: SupabaseClient,
): RoomMembershipAdminStore {
  const getMembership = async (
    roomId: string,
    userId: string,
  ): Promise<RoomMembershipRecord | null> => {
    const { data, error } = await adminClient
      .from("room_members")
      .select("room_id,user_id,entry_state,left_at,ejected_at")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error("Unable to read authoritative room membership");
    }
    return data ? decodeMembership(data) : null;
  };

  return {
    getMembership,

    async ensureActiveMembership(roomId, userId) {
      let membership = await getMembership(roomId, userId);
      if (membership?.entryState === "ejected") return "ejected";

      if (!membership) {
        const { error } = await adminClient.from("room_members").insert({
          room_id: roomId,
          user_id: userId,
          entry_state: "active",
          left_at: null,
          ejected_at: null,
        });

        if (!error) return "active";
        if (readErrorCode(error) !== "23505") {
          throw new Error("Unable to establish room membership");
        }

        // A concurrent join or ejection won the insert race. Re-read instead
        // of using upsert so an ejected row can never be reactivated.
        membership = await getMembership(roomId, userId);
        if (!membership) {
          throw new Error("Room membership race did not converge");
        }
        if (membership.entryState === "ejected") return "ejected";
      }

      if (membership.leftAt === null) return "active";

      const { data, error } = await adminClient
        .from("room_members")
        .update({ left_at: null })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("entry_state", "active")
        .select("entry_state,left_at")
        .maybeSingle();

      if (error) {
        throw new Error("Unable to reactivate room membership");
      }
      if (data?.entry_state === "active" && data.left_at === null) {
        return "active";
      }

      // An ejection may have committed after our read but before the guarded
      // update. Re-read and fail closed on any non-active result.
      membership = await getMembership(roomId, userId);
      if (membership?.entryState === "ejected") return "ejected";
      if (membership?.entryState === "active" && membership.leftAt === null) {
        return "active";
      }
      throw new Error("Room membership could not be reactivated safely");
    },

    async markMembershipLeft(roomId, userId) {
      let membership = await getMembership(roomId, userId);
      if (!membership) return "missing";
      if (membership.entryState === "ejected") return "ejected";
      if (membership.leftAt !== null) return "active";

      const { data, error } = await adminClient
        .from("room_members")
        .update({ left_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .eq("entry_state", "active")
        .is("left_at", null)
        .select("entry_state")
        .maybeSingle();

      if (error) {
        throw new Error("Unable to leave room membership");
      }
      if (data?.entry_state === "active") return "active";

      membership = await getMembership(roomId, userId);
      if (!membership) return "missing";
      return membership.entryState;
    },

    async hostEjectMember(input) {
      const reason = input.reason.trim();
      if (reason.length < 3 || reason.length > 500) {
        throw new Error("Room ejection reason must be between 3 and 500 characters");
      }

      const { data, error } = await adminClient.rpc("host_eject_room_member", {
        p_room_id: input.roomId,
        p_target_user_id: input.targetUserId,
        p_actor_id: input.actorUserId,
        p_reason: reason,
      });

      if (error) {
        throw new Error("Unable to persist authoritative room ejection");
      }

      const actionId = Number(data);
      if (!Number.isSafeInteger(actionId) || actionId <= 0) {
        throw new Error("Room ejection audit action is invalid");
      }
      return actionId;
    },
  };
}

function decodeMembership(data: Record<string, unknown>): RoomMembershipRecord {
  const roomId = data.room_id;
  const userId = data.user_id;
  const entryState = data.entry_state;
  const leftAt = data.left_at;
  const ejectedAt = data.ejected_at;

  if (
    typeof roomId !== "string" ||
    typeof userId !== "string" ||
    (entryState !== "active" && entryState !== "ejected") ||
    (leftAt !== null && typeof leftAt !== "string") ||
    (ejectedAt !== null && typeof ejectedAt !== "string")
  ) {
    throw new Error("Room membership registry contains invalid data");
  }

  if (
    (entryState === "active" && ejectedAt !== null) ||
    (entryState === "ejected" && (ejectedAt === null || leftAt === null))
  ) {
    throw new Error("Room membership registry contains inconsistent state");
  }

  return {
    roomId,
    userId,
    entryState,
    leftAt,
    ejectedAt,
  };
}

function readErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
