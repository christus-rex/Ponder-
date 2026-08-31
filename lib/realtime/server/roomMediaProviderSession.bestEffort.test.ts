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
  it("continues room revocation after an earlier provider failure", async () => {
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
      "revoke:participant-revoked",
      "marked:user-2:participant-revoked",
    ]);
  });

  it("continues user revocation after an earlier registry update failure", async () => {
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
      "revoke:participant-revoked",
      "marked:user-1:participant-revoked",
    ]);
  });
});
