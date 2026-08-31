import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseRoomMembershipAdminStore } from "./roomMembership";

describe("createSupabaseRoomMembershipAdminStore", () => {
  it("never reactivates a membership already marked ejected", async () => {
    const calls: string[] = [];
    const query = {
      select() {
        calls.push("select");
        return query;
      },
      eq() {
        return query;
      },
      async maybeSingle() {
        return {
          data: {
            room_id: "room-1",
            user_id: "user-1",
            entry_state: "ejected",
            left_at: "2026-08-31T09:00:00.000Z",
            ejected_at: "2026-08-31T09:00:00.000Z",
          },
          error: null,
        };
      },
    };
    const client = {
      from(table: string) {
        expect(table).toBe("room_members");
        return query;
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseRoomMembershipAdminStore(client);
    await expect(
      store.ensureActiveMembership("room-1", "user-1"),
    ).resolves.toBe("ejected");
    expect(calls).toEqual(["select"]);
  });

  it("creates a missing membership as active without upsert semantics", async () => {
    let readCount = 0;
    const inserts: unknown[] = [];
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      async maybeSingle() {
        readCount += 1;
        return { data: null, error: null };
      },
      async insert(value: unknown) {
        inserts.push(value);
        return { error: null };
      },
    };
    const client = {
      from() {
        return query;
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseRoomMembershipAdminStore(client);
    await expect(
      store.ensureActiveMembership("room-1", "user-1"),
    ).resolves.toBe("active");

    expect(readCount).toBe(1);
    expect(inserts).toEqual([
      {
        room_id: "room-1",
        user_id: "user-1",
        entry_state: "active",
        left_at: null,
        ejected_at: null,
      },
    ]);
  });

  it("fails closed when a concurrent ejection wins the membership insert race", async () => {
    let readCount = 0;
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      async maybeSingle() {
        readCount += 1;
        if (readCount === 1) return { data: null, error: null };
        return {
          data: {
            room_id: "room-1",
            user_id: "user-1",
            entry_state: "ejected",
            left_at: "2026-08-31T09:01:00.000Z",
            ejected_at: "2026-08-31T09:01:00.000Z",
          },
          error: null,
        };
      },
      async insert() {
        return { error: { code: "23505" } };
      },
    };
    const client = {
      from() {
        return query;
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseRoomMembershipAdminStore(client);
    await expect(
      store.ensureActiveMembership("room-1", "user-1"),
    ).resolves.toBe("ejected");
    expect(readCount).toBe(2);
  });

  it("persists host ejection only through the service-role RPC contract", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const client = {
      async rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return { data: 17, error: null };
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseRoomMembershipAdminStore(client);
    await expect(
      store.hostEjectMember({
        roomId: "room-1",
        targetUserId: "user-2",
        actorUserId: "host-1",
        reason: "Removed by room host",
      }),
    ).resolves.toBe(17);

    expect(calls).toEqual([
      {
        name: "host_eject_room_member",
        args: {
          p_room_id: "room-1",
          p_target_user_id: "user-2",
          p_actor_id: "host-1",
          p_reason: "Removed by room host",
        },
      },
    ]);
  });
});


describe("server-owned normal leave", () => {
  it("marks an active membership left without changing enforcement state", async () => {
    let readCount = 0;
    const updates: unknown[] = [];
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      is() {
        return query;
      },
      async maybeSingle() {
        readCount += 1;
        if (readCount === 1) {
          return {
            data: {
              room_id: "room-1",
              user_id: "user-1",
              entry_state: "active",
              left_at: null,
              ejected_at: null,
            },
            error: null,
          };
        }
        return {
          data: { entry_state: "active" },
          error: null,
        };
      },
      update(value: unknown) {
        updates.push(value);
        return query;
      },
    };
    const client = {
      from() {
        return query;
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseRoomMembershipAdminStore(client);
    await expect(
      store.markMembershipLeft("room-1", "user-1"),
    ).resolves.toBe("active");

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual(
      expect.objectContaining({ left_at: expect.any(String) }),
    );
  });

  it("never rewrites an ejected membership during normal leave", async () => {
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      async maybeSingle() {
        return {
          data: {
            room_id: "room-1",
            user_id: "user-1",
            entry_state: "ejected",
            left_at: "2026-08-31T09:01:00.000Z",
            ejected_at: "2026-08-31T09:01:00.000Z",
          },
          error: null,
        };
      },
    };
    const client = {
      from() {
        return query;
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseRoomMembershipAdminStore(client);
    await expect(
      store.markMembershipLeft("room-1", "user-1"),
    ).resolves.toBe("ejected");
  });
});
