import { describe, expect, it } from "vitest";
import {
  revokeTrackedMediaSessionsForRoom,
  revokeTrackedMediaSessionsForUser,
  type MediaProviderParticipantRevoker,
  type RoomMediaProviderSessionStore,
  type TrackedMediaProviderSession,
} from "./roomMediaProviderSession";

function tracked(
  userId: string,
  providerParticipantId: string,
): TrackedMediaProviderSession {
  return {
    roomId: "room-1",
    userId,
    providerParticipantId,
    authoritySequence: 12,
    role: "speaker",
    expiresAt: 1_800_000_020,
  };
}

function storeFor(sessions: TrackedMediaProviderSession[], events: string[]) {
  return {
    async registerActiveSession() {
      return [];
    },
    async isCurrentSession() {
      return true;
    },
    async listActiveRoomSessions() {
      return sessions;
    },
    async listActiveUserSessions() {
      return sessions;
    },
    async markRevoked(_roomId: string, userId: string, participantId: string) {
      events.push(`marked:${userId}:${participantId}`);
    },
  } satisfies RoomMediaProviderSessionStore;
}

describe("bounded provider media revocation", () => {
  it("retries transient provider failures before marking the handle revoked", async () => {
    const events: string[] = [];
    let attempts = 0;
    const store = storeFor([tracked("user-1", "participant-1")], events);
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        attempts += 1;
        events.push(`revoke:${participantId}:${attempts}`);
        if (attempts < 3) throw new Error("provider unavailable");
      },
    };

    await expect(
      revokeTrackedMediaSessionsForRoom(store, revoker, "room-1"),
    ).resolves.toBe(1);

    expect(events).toEqual([
      "revoke:participant-1:1",
      "revoke:participant-1:2",
      "revoke:participant-1:3",
      "marked:user-1:participant-1",
    ]);
  });

  it("continues room revocation after a provider exhausts its bounded retries", async () => {
    const events: string[] = [];
    const sessions = [
      tracked("user-1", "participant-fails"),
      tracked("user-2", "participant-revoked"),
    ];
    const store = storeFor(sessions, events);
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoke:${participantId}`);
        if (participantId === "participant-fails") {
          throw new Error("provider unavailable");
        }
      },
    };

    await expect(
      revokeTrackedMediaSessionsForRoom(store, revoker, "room-1"),
    ).rejects.toThrow("reconciliation required");

    expect(events).toEqual([
      "revoke:participant-fails",
      "revoke:participant-fails",
      "revoke:participant-fails",
      "revoke:participant-revoked",
      "marked:user-2:participant-revoked",
    ]);
  });

  it("retries a transient registry failure without repeating provider deletion", async () => {
    const events: string[] = [];
    let markAttempts = 0;
    const session = tracked("user-1", "participant-1");
    const baseStore = storeFor([session], events);
    const store: RoomMediaProviderSessionStore = {
      ...baseStore,
      async markRevoked(_roomId, userId, participantId) {
        markAttempts += 1;
        events.push(`marked:${userId}:${participantId}:${markAttempts}`);
        if (markAttempts < 3) throw new Error("database unavailable");
      },
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoke:${participantId}`);
      },
    };

    await expect(
      revokeTrackedMediaSessionsForUser(store, revoker, "room-1", "user-1"),
    ).resolves.toBe(1);

    expect(events).toEqual([
      "revoke:participant-1",
      "marked:user-1:participant-1:1",
      "marked:user-1:participant-1:2",
      "marked:user-1:participant-1:3",
    ]);
  });

  it("continues user revocation after a registry update exhausts bounded retries", async () => {
    const events: string[] = [];
    const sessions = [
      tracked("user-1", "participant-mark-fails"),
      tracked("user-1", "participant-revoked"),
    ];
    const baseStore = storeFor(sessions, events);
    const store: RoomMediaProviderSessionStore = {
      ...baseStore,
      async markRevoked(_roomId, userId, participantId) {
        events.push(`marked:${userId}:${participantId}`);
        if (participantId === "participant-mark-fails") {
          throw new Error("database unavailable");
        }
      },
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        events.push(`revoke:${participantId}`);
      },
    };

    await expect(
      revokeTrackedMediaSessionsForUser(store, revoker, "room-1", "user-1"),
    ).rejects.toThrow("reconciliation required");

    expect(events).toEqual([
      "revoke:participant-mark-fails",
      "marked:user-1:participant-mark-fails",
      "marked:user-1:participant-mark-fails",
      "marked:user-1:participant-mark-fails",
      "revoke:participant-revoked",
      "marked:user-1:participant-revoked",
    ]);
  });
});
