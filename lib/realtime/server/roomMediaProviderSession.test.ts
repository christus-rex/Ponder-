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

function storeBase(
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
      return [];
    },
    async listActiveUserSessions() {
      return [];
    },
    async markRevoked() {},
    ...overrides,
  };
}

describe("replaceTrackedMediaProviderSession", () => {
  it("registers the new generation, revokes prior handles, then verifies it is still current", async () => {
    const events: string[] = [];
    const store = storeBase({
      async registerActiveSession(session) {
        events.push(`register:${session.providerParticipantId}`);
        return ["participant-old"];
      },
      async markRevoked(_roomId, _userId, participantId) {
        events.push(`marked:${participantId}`);
      },
      async isCurrentSession(_roomId, _userId, participantId) {
        events.push(`current:${participantId}`);
        return true;
      },
    });
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoke:${participantId}`);
      },
    };

    await replaceTrackedMediaProviderSession(store, revoker, tracked());

    expect(events).toEqual([
      "register:participant-new",
      "revoke:participant-old",
      "marked:participant-old",
      "current:participant-new",
    ]);
  });

  it("revokes an untracked newly-created participant when serialized registration fails", async () => {
    const events: string[] = [];
    const store = storeBase({
      async registerActiveSession() {
        events.push("register:failed");
        throw new Error("database unavailable");
      },
    });
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoke:${participantId}`);
      },
    };

    await expect(
      replaceTrackedMediaProviderSession(store, revoker, tracked()),
    ).rejects.toThrow("database unavailable");

    expect(events).toEqual([
      "register:failed",
      "revoke:participant-new",
    ]);
  });

  it("compensates the new tracked participant when an older participant cannot be revoked", async () => {
    const events: string[] = [];
    const store = storeBase({
      async registerActiveSession() {
        return ["participant-old"];
      },
      async markRevoked(_roomId, _userId, participantId) {
        events.push(`marked:${participantId}`);
      },
    });
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
      "marked:participant-new",
    ]);
  });

  it("does not deliver a participant that a concurrent registration already superseded", async () => {
    const events: string[] = [];
    const store = storeBase({
      async isCurrentSession() {
        events.push("current:false");
        return false;
      },
      async markRevoked(_roomId, _userId, participantId) {
        events.push(`marked:${participantId}`);
      },
    });
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoke:${participantId}`);
      },
    };

    await expect(
      replaceTrackedMediaProviderSession(store, revoker, tracked()),
    ).rejects.toThrow("superseded before delivery");

    expect(events).toEqual([
      "current:false",
      "revoke:participant-new",
      "marked:participant-new",
    ]);
  });

  it("surfaces compensation failure rather than returning an untracked participant", async () => {
    const store = storeBase({
      async registerActiveSession() {
        throw new Error("database unavailable");
      },
    });
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
    const store = storeBase({
      async listActiveRoomSessions(roomId) {
        expect(roomId).toBe("room-1");
        return sessions;
      },
      async markRevoked(_roomId, userId, participantId) {
        events.push(`marked:${userId}:${participantId}`);
      },
    });
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
    const store = storeBase({
      async listActiveRoomSessions() {
        return [tracked()];
      },
      async markRevoked() {
        events.push("marked");
      },
    });
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant() {
        events.push("revoke-failed");
        throw new Error("provider unavailable");
      },
    };

    await expect(
      revokeTrackedMediaSessionsForRoom(store, revoker, "room-1"),
    ).rejects.toThrow("reconciliation required");
    expect(events).toEqual([
      "revoke-failed",
      "revoke-failed",
      "revoke-failed",
    ]);
  });
});


describe("revokeTrackedMediaSessionsForUser", () => {
  it("revokes only the target user's tracked sessions", async () => {
    const events: string[] = [];
    const store = storeBase({
      async listActiveUserSessions(roomId, userId) {
        expect(roomId).toBe("room-1");
        expect(userId).toBe("user-1");
        return [
          tracked({ providerParticipantId: "participant-1" }),
          tracked({ providerParticipantId: "participant-2" }),
        ];
      },
      async markRevoked(_roomId, userId, participantId) {
        events.push(`marked:${userId}:${participantId}`);
      },
    });
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoked:${participantId}`);
      },
    };

    const { revokeTrackedMediaSessionsForUser } = await import(
      "./roomMediaProviderSession"
    );
    await expect(
      revokeTrackedMediaSessionsForUser(store, revoker, "room-1", "user-1"),
    ).resolves.toBe(2);

    expect(events).toEqual([
      "revoked:participant-1",
      "marked:user-1:participant-1",
      "revoked:participant-2",
      "marked:user-1:participant-2",
    ]);
  });
});
