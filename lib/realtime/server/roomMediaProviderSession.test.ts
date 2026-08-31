import { describe, expect, it } from "vitest";
import {
  replaceTrackedMediaProviderSession,
  revokeTrackedMediaSessionsForRoom,
  type MediaProviderParticipantRevoker,
  type RoomMediaProviderSessionStore,
  type TrackedMediaProviderSession,
} from "./roomMediaProviderSession";

function tracked(
  overrides: Partial<TrackedMediaProviderSession> = {},
): TrackedMediaProviderSession {
  return {
    roomId: "room-1",
    userId: "user-1",
    providerParticipantId: "participant-new",
    authoritySequence: 9,
    role: "speaker",
    expiresAt: 1_800_000_020,
    ...overrides,
  };
}

describe("replaceTrackedMediaProviderSession", () => {
  it("revokes the previous participant before persisting a replacement", async () => {
    const events: string[] = [];
    const store: RoomMediaProviderSessionStore = {
      async getActiveUserSession() {
        return tracked({ providerParticipantId: "participant-old" });
      },
      async upsertActiveSession(session) {
        events.push(`store:${session.providerParticipantId}`);
      },
      async listActiveRoomSessions() {
        return [];
      },
      async markRevoked() {},
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoke:${participantId}`);
      },
    };

    await replaceTrackedMediaProviderSession(store, revoker, tracked());

    expect(events).toEqual([
      "revoke:participant-old",
      "store:participant-new",
    ]);
  });

  it("revokes the newly-created participant when persistence fails", async () => {
    const events: string[] = [];
    const store: RoomMediaProviderSessionStore = {
      async getActiveUserSession() {
        return null;
      },
      async upsertActiveSession() {
        events.push("store:failed");
        throw new Error("database unavailable");
      },
      async listActiveRoomSessions() {
        return [];
      },
      async markRevoked() {},
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoke:${participantId}`);
      },
    };

    await expect(
      replaceTrackedMediaProviderSession(store, revoker, tracked()),
    ).rejects.toThrow("database unavailable");

    expect(events).toEqual([
      "store:failed",
      "revoke:participant-new",
    ]);
  });

  it("does not persist a replacement when the prior participant cannot be revoked", async () => {
    const events: string[] = [];
    const store: RoomMediaProviderSessionStore = {
      async getActiveUserSession() {
        return tracked({ providerParticipantId: "participant-old" });
      },
      async upsertActiveSession() {
        events.push("store:new");
      },
      async listActiveRoomSessions() {
        return [];
      },
      async markRevoked() {},
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoke:${participantId}`);
        if (participantId === "participant-old") {
          throw new Error("old participant still active");
        }
      },
    };

    await expect(
      replaceTrackedMediaProviderSession(store, revoker, tracked()),
    ).rejects.toThrow("old participant still active");

    expect(events).toEqual([
      "revoke:participant-old",
      "revoke:participant-new",
    ]);
  });

  it("surfaces compensation failure rather than returning an untracked participant", async () => {
    const store: RoomMediaProviderSessionStore = {
      async getActiveUserSession() {
        return null;
      },
      async upsertActiveSession() {
        throw new Error("database unavailable");
      },
      async listActiveRoomSessions() {
        return [];
      },
      async markRevoked() {},
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant() {
        throw new Error("provider unavailable");
      },
    };

    await expect(
      replaceTrackedMediaProviderSession(store, revoker, tracked()),
    ).rejects.toThrow("manual cleanup required");
  });
});

describe("revokeTrackedMediaSessionsForRoom", () => {
  it("revokes every tracked participant and then marks each handle revoked", async () => {
    const events: string[] = [];
    const sessions = [
      tracked({ userId: "user-1", providerParticipantId: "participant-1" }),
      tracked({ userId: "user-2", providerParticipantId: "participant-2" }),
    ];
    const store: RoomMediaProviderSessionStore = {
      async getActiveUserSession() {
        return null;
      },
      async upsertActiveSession() {},
      async listActiveRoomSessions(roomId) {
        expect(roomId).toBe("room-1");
        return sessions;
      },
      async markRevoked(_roomId, userId, participantId) {
        events.push(`marked:${userId}:${participantId}`);
      },
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoked:${participantId}`);
      },
    };

    await expect(
      revokeTrackedMediaSessionsForRoom(store, revoker, "room-1"),
    ).resolves.toBe(2);

    expect(events).toEqual([
      "revoked:participant-1",
      "marked:user-1:participant-1",
      "revoked:participant-2",
      "marked:user-2:participant-2",
    ]);
  });

  it("does not mark a participant revoked when provider deletion fails", async () => {
    const events: string[] = [];
    const store: RoomMediaProviderSessionStore = {
      async getActiveUserSession() {
        return null;
      },
      async upsertActiveSession() {},
      async listActiveRoomSessions() {
        return [tracked()];
      },
      async markRevoked() {
        events.push("marked");
      },
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant() {
        events.push("revoke-failed");
        throw new Error("provider unavailable");
      },
    };

    await expect(
      revokeTrackedMediaSessionsForRoom(store, revoker, "room-1"),
    ).rejects.toThrow("provider unavailable");
    expect(events).toEqual(["revoke-failed"]);
  });
});
