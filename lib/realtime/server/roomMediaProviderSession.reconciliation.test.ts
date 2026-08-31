import { describe, expect, it } from "vitest";
import {
  reconcileTrackedMediaSessions,
  revokeTrackedMediaSessionsForRoom,
  type MediaProviderParticipantRevoker,
  type RoomMediaProviderSessionStore,
  type TrackedMediaProviderSession,
} from "./roomMediaProviderSession";

function tracked(providerParticipantId: string): TrackedMediaProviderSession {
  return {
    roomId: "room-1",
    userId: `user-${providerParticipantId}`,
    providerParticipantId,
    authoritySequence: 12,
    role: "speaker",
    expiresAt: 1_800_000_020,
  };
}

function baseStore(): RoomMediaProviderSessionStore {
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
  };
}

describe("provider media revocation reconciliation", () => {
  it("durably schedules a handle after synchronous revocation exhausts retries", async () => {
    const session = tracked("participant-fails");
    const scheduled: string[] = [];
    const store: RoomMediaProviderSessionStore = {
      ...baseStore(),
      async listActiveRoomSessions() {
        return [session];
      },
      async requestReconciliation(_roomId, _userId, participantId) {
        scheduled.push(participantId);
      },
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant() {
        throw new Error("provider unavailable");
      },
    };

    await expect(
      revokeTrackedMediaSessionsForRoom(store, revoker, "room-1"),
    ).rejects.toThrow("reconciliation required");

    expect(scheduled).toEqual(["participant-fails"]);
  });

  it("reconciles a bounded claimed batch and keeps failures retryable", async () => {
    const sessions = [tracked("participant-ok"), tracked("participant-fails")];
    const marked: string[] = [];
    const attempts = new Map<string, number>();
    const store: RoomMediaProviderSessionStore = {
      ...baseStore(),
      async claimReconciliationBatch(limit) {
        expect(limit).toBe(16);
        return sessions;
      },
      async markRevoked(_roomId, _userId, participantId) {
        marked.push(participantId);
      },
    };
    const revoker: MediaProviderParticipantRevoker = {
      async revokeParticipant(_roomId, participantId) {
        attempts.set(participantId, (attempts.get(participantId) ?? 0) + 1);
        if (participantId === "participant-fails") {
          throw new Error("provider unavailable");
        }
      },
    };

    await expect(reconcileTrackedMediaSessions(store, revoker)).resolves.toEqual({
      claimed: 2,
      revoked: 1,
      failed: 1,
    });
    expect(marked).toEqual(["participant-ok"]);
    expect(attempts.get("participant-ok")).toBe(1);
    expect(attempts.get("participant-fails")).toBe(3);
  });

  it("rejects an unbounded reconciliation batch size", async () => {
    await expect(
      reconcileTrackedMediaSessions(baseStore(), { async revokeParticipant() {} }, 33),
    ).rejects.toThrow("limit is invalid");
  });
});
