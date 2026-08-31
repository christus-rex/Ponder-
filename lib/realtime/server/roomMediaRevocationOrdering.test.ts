import { describe, expect, it } from "vitest";
import {
  revokeTrackedMediaSessionsForRoom,
  type MediaProviderParticipantRevoker,
  type RoomMediaProviderSessionStore,
  type TrackedMediaProviderSession,
} from "./roomMediaProviderSession";

const session: TrackedMediaProviderSession = {
  roomId: "room-1",
  userId: "user-1",
  providerParticipantId: "participant-1",
  authoritySequence: 4,
  role: "speaker",
  expiresAt: 1_800_000_020,
};

function store(
  overrides: Partial<RoomMediaProviderSessionStore> = {},
): RoomMediaProviderSessionStore {
  return {
    async registerActiveSession() {
      return [];
    },
    async isCurrentSession() {
      return true;
    },
    async listActiveRoomSessions() {
      return [session];
    },
    async listActiveUserSessions() {
      return [session];
    },
    async markRevoked() {},
    async requestReconciliation() {},
    ...overrides,
  };
}

describe("crash-safe tracked media revocation", () => {
  it("persists reconciliation intent before touching the provider", async () => {
    const events: string[] = [];
    const sessionStore = store({
      async requestReconciliation() {
        events.push("intent");
      },
      async markRevoked() {
        events.push("marked");
      },
    });
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant() {
        events.push("provider");
      },
    };

    await expect(
      revokeTrackedMediaSessionsForRoom(sessionStore, revoker, "room-1"),
    ).resolves.toBe(1);

    expect(events).toEqual(["intent", "provider", "marked"]);
  });

  it("still attempts immediate cleanup when durable scheduling is unavailable", async () => {
    let scheduleAttempts = 0;
    let providerAttempts = 0;
    const sessionStore = store({
      async requestReconciliation() {
        scheduleAttempts += 1;
        throw new Error("database unavailable");
      },
    });
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant() {
        providerAttempts += 1;
      },
    };

    await expect(
      revokeTrackedMediaSessionsForRoom(sessionStore, revoker, "room-1"),
    ).resolves.toBe(1);

    expect(scheduleAttempts).toBe(3);
    expect(providerAttempts).toBe(1);
  });

  it("surfaces both failures when scheduling and provider cleanup fail", async () => {
    const sessionStore = store({
      async requestReconciliation() {
        throw new Error("database unavailable");
      },
    });
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant() {
        throw new Error("provider unavailable");
      },
    };

    await expect(
      revokeTrackedMediaSessionsForRoom(sessionStore, revoker, "room-1"),
    ).rejects.toThrow("reconciliation required");
  });
});
