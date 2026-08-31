import { describe, expect, it } from "vitest";
import {
  closeBackendOwnedLiveRoom,
  createBackendOwnedLiveRoom,
  moderationCloseBackendOwnedLiveRoom,
  type LiveRoomLifecycleStore,
} from "./liveRoomLifecycle";
import type {
  RealtimeKitMeetingControlPlane,
  RoomMediaProvisioningStore,
} from "./roomMediaProvisioning";
import type {
  MediaProviderParticipantRevoker,
  RoomMediaProviderSessionStore,
  TrackedMediaProviderSession,
} from "./roomMediaProviderSession";

function fakes(options?: {
  failOpen?: boolean;
  failDeactivate?: boolean;
  failParticipantRevoke?: boolean;
  existingMeetingId?: string | null;
  trackedParticipantIds?: string[];
}) {
  const events: string[] = [];
  let mapping = options?.existingMeetingId ?? null;

  const store: LiveRoomLifecycleStore = {
    async createClosedRoom(input) {
      events.push(`db:create:${input.createdBy}:${input.title}:closed`);
      return { id: "room-1", title: input.title };
    },
    async markRoomOpen(roomId, createdBy) {
      events.push(`db:open:${roomId}:${createdBy}`);
      if (options?.failOpen) throw new Error("open failed");
    },
    async markRoomClosed(roomId, createdBy) {
      events.push(`db:close:${roomId}:${createdBy}`);
    },
    async moderationCloseRoom(input) {
      events.push(
        `db:moderation-close:${input.roomId}:${input.actorId}:${input.actorRole}:${input.reason}`,
      );
      return { actionId: 42 };
    },
  };

  const mediaStore: RoomMediaProvisioningStore = {
    async findMeetingId() {
      return mapping;
    },
    async tryCreateMapping(_roomId, meetingId) {
      mapping = meetingId;
      events.push(`db:map:${meetingId}`);
      return "created";
    },
  };

  const controlPlane: RealtimeKitMeetingControlPlane = {
    async createMeeting({ roomId }) {
      events.push(`provider:create:${roomId}`);
      return { meetingId: "meeting-1" };
    },
    async setMeetingStatus(meetingId, status) {
      events.push(`provider:${status}:${meetingId}`);
      if (status === "INACTIVE" && options?.failDeactivate) {
        throw new Error("deactivate failed");
      }
    },
  };

  const trackedSessions: TrackedMediaProviderSession[] = (
    options?.trackedParticipantIds ?? []
  ).map((providerParticipantId, index) => ({
    roomId: "room-1",
    userId: `user-${index + 1}`,
    providerParticipantId,
    authoritySequence: 10 + index,
    role: "speaker",
    expiresAt: 1_800_000_020,
  }));

  const sessionStore: RoomMediaProviderSessionStore = {
    async registerActiveSession() {
      return [];
    },
    async isCurrentSession() {
      return true;
    },
    async listActiveRoomSessions(roomId) {
      events.push(`db:list-sessions:${roomId}`);
      return trackedSessions;
    },
    async listActiveUserSessions() {
      return [];
    },
    async markRevoked(_roomId, userId, participantId) {
      events.push(`db:revoked:${userId}:${participantId}`);
    },
  };

  const participantRevoker: MediaProviderParticipantRevoker = {
    async revokeParticipant(_roomId, participantId) {
      events.push(`provider:revoke:${participantId}`);
      if (options?.failParticipantRevoke) {
        throw new Error("participant revoke failed");
      }
    },
  };

  return {
    store,
    mediaStore,
    controlPlane,
    sessionStore,
    participantRevoker,
    events,
  };
}

describe("createBackendOwnedLiveRoom", () => {
  it("creates the room closed, provisions media, then opens it", async () => {
    const { store, mediaStore, controlPlane, events } = fakes();
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Room title",
      }),
    ).resolves.toEqual({ roomId: "room-1", status: "open" });
    expect(events).toEqual([
      "db:create:user-1:Room title:closed",
      "provider:create:room-1",
      "db:map:meeting-1",
      "db:open:room-1:user-1",
    ]);
  });

  it("never opens a room when media provisioning fails", async () => {
    const { store, mediaStore, events } = fakes();
    const controlPlane: RealtimeKitMeetingControlPlane = {
      async createMeeting() {
        events.push("provider:create:failed");
        throw new Error("provider unavailable");
      },
      async setMeetingStatus() {},
    };
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Room title",
      }),
    ).rejects.toThrow("provider unavailable");
    expect(events).toEqual([
      "db:create:user-1:Room title:closed",
      "provider:create:failed",
    ]);
  });

  it("deactivates media if final room activation fails", async () => {
    const { store, mediaStore, controlPlane, events } = fakes({ failOpen: true });
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Room title",
      }),
    ).rejects.toThrow("open failed");
    expect(events).toEqual([
      "db:create:user-1:Room title:closed",
      "provider:create:room-1",
      "db:map:meeting-1",
      "db:open:room-1:user-1",
      "provider:INACTIVE:meeting-1",
    ]);
  });

  it("surfaces cleanup failure without claiming the room opened", async () => {
    const { store, mediaStore, controlPlane } = fakes({
      failOpen: true,
      failDeactivate: true,
    });
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Room title",
      }),
    ).rejects.toThrow("provider cleanup is required");
  });

  it("validates room metadata before creating a lifecycle record", async () => {
    const { store, mediaStore, controlPlane, events } = fakes();
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "x",
      }),
    ).rejects.toThrow("between 3 and 100");
    await expect(
      createBackendOwnedLiveRoom(store, mediaStore, controlPlane, {
        createdBy: "user-1",
        title: "Valid room",
        maxParticipants: 25,
      }),
    ).rejects.toThrow("between 2 and 24");
    expect(events).toEqual([]);
  });
});

describe("closeBackendOwnedLiveRoom", () => {
  it("closes Ponder authority, revokes active participants, then deactivates the meeting", async () => {
    const {
      store,
      mediaStore,
      controlPlane,
      sessionStore,
      participantRevoker,
      events,
    } = fakes({
      existingMeetingId: "meeting-1",
      trackedParticipantIds: ["participant-1", "participant-2"],
    });

    await expect(
      closeBackendOwnedLiveRoom(
        store,
        mediaStore,
        controlPlane,
        sessionStore,
        participantRevoker,
        {
          roomId: "room-1",
          createdBy: "user-1",
        },
      ),
    ).resolves.toEqual({ roomId: "room-1", status: "closed" });

    expect(events).toEqual([
      "db:close:room-1:user-1",
      "db:list-sessions:room-1",
      "provider:revoke:participant-1",
      "db:revoked:user-1:participant-1",
      "provider:revoke:participant-2",
      "db:revoked:user-2:participant-2",
      "provider:INACTIVE:meeting-1",
    ]);
  });

  it("still deactivates the meeting when an individual participant revocation fails", async () => {
    const {
      store,
      mediaStore,
      controlPlane,
      sessionStore,
      participantRevoker,
      events,
    } = fakes({
      existingMeetingId: "meeting-1",
      trackedParticipantIds: ["participant-1"],
      failParticipantRevoke: true,
    });

    await expect(
      closeBackendOwnedLiveRoom(
        store,
        mediaStore,
        controlPlane,
        sessionStore,
        participantRevoker,
        {
          roomId: "room-1",
          createdBy: "user-1",
        },
      ),
    ).rejects.toThrow("Provider media cleanup failed");

    expect(events[0]).toBe("db:close:room-1:user-1");
    expect(events).toContain("provider:INACTIVE:meeting-1");
  });

  it("keeps Ponder closed when meeting deactivation fails after participant revocation", async () => {
    const {
      store,
      mediaStore,
      controlPlane,
      sessionStore,
      participantRevoker,
      events,
    } = fakes({
      existingMeetingId: "meeting-1",
      trackedParticipantIds: ["participant-1"],
      failDeactivate: true,
    });

    await expect(
      closeBackendOwnedLiveRoom(
        store,
        mediaStore,
        controlPlane,
        sessionStore,
        participantRevoker,
        {
          roomId: "room-1",
          createdBy: "user-1",
        },
      ),
    ).rejects.toThrow("Provider media cleanup failed");

    expect(events[0]).toBe("db:close:room-1:user-1");
    expect(events).toContain("provider:revoke:participant-1");
  });
});

describe("moderationCloseBackendOwnedLiveRoom", () => {
  it("writes the audited close before active participant and meeting cleanup", async () => {
    const {
      store,
      mediaStore,
      controlPlane,
      sessionStore,
      participantRevoker,
      events,
    } = fakes({
      existingMeetingId: "meeting-1",
      trackedParticipantIds: ["participant-1"],
    });

    await expect(
      moderationCloseBackendOwnedLiveRoom(
        store,
        mediaStore,
        controlPlane,
        sessionStore,
        participantRevoker,
        {
          roomId: "room-1",
          actorId: "mod-1",
          actorRole: "moderator",
          reason: "Policy violation",
        },
      ),
    ).resolves.toEqual({ roomId: "room-1", status: "closed", actionId: 42 });

    expect(events).toEqual([
      "db:moderation-close:room-1:mod-1:moderator:Policy violation",
      "db:list-sessions:room-1",
      "provider:revoke:participant-1",
      "db:revoked:user-1:participant-1",
      "provider:INACTIVE:meeting-1",
    ]);
  });

  it("keeps the audited close authoritative and still deactivates the meeting if participant cleanup fails", async () => {
    const {
      store,
      mediaStore,
      controlPlane,
      sessionStore,
      participantRevoker,
      events,
    } = fakes({
      existingMeetingId: "meeting-1",
      trackedParticipantIds: ["participant-1"],
      failParticipantRevoke: true,
    });

    await expect(
      moderationCloseBackendOwnedLiveRoom(
        store,
        mediaStore,
        controlPlane,
        sessionStore,
        participantRevoker,
        {
          roomId: "room-1",
          actorId: "admin-1",
          actorRole: "admin",
          reason: "Safety response",
        },
      ),
    ).rejects.toThrow("Provider media cleanup failed");

    expect(events[0]).toBe(
      "db:moderation-close:room-1:admin-1:admin:Safety response",
    );
    expect(events).toContain("provider:INACTIVE:meeting-1");
  });

  it("rejects non-moderation roles and invalid reasons before touching state", async () => {
    const {
      store,
      mediaStore,
      controlPlane,
      sessionStore,
      participantRevoker,
      events,
    } = fakes();

    await expect(
      moderationCloseBackendOwnedLiveRoom(
        store,
        mediaStore,
        controlPlane,
        sessionStore,
        participantRevoker,
        {
          roomId: "room-1",
          actorId: "user-1",
          actorRole: "member" as "moderator",
          reason: "Policy violation",
        },
      ),
    ).rejects.toThrow("moderator or admin");

    await expect(
      moderationCloseBackendOwnedLiveRoom(
        store,
        mediaStore,
        controlPlane,
        sessionStore,
        participantRevoker,
        {
          roomId: "room-1",
          actorId: "mod-1",
          actorRole: "moderator",
          reason: "x",
        },
      ),
    ).rejects.toThrow("between 3 and 500");

    expect(events).toEqual([]);
  });
});
