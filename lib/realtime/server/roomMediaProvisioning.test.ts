import { describe, expect, it } from "vitest";
import {
  deactivateRealtimeKitMeetingForRoom,
  ensureRealtimeKitMeetingProvisioned,
  type RealtimeKitMeetingControlPlane,
  type RoomMediaProvisioningStore,
} from "./roomMediaProvisioning";

function fakeStore(initialMeetingId: string | null = null) {
  let meetingId = initialMeetingId;
  let createResult: "created" | "conflict" = "created";
  let createError: Error | null = null;

  const store: RoomMediaProvisioningStore = {
    async findMeetingId() {
      return meetingId;
    },
    async tryCreateMapping(_roomId, candidateMeetingId) {
      if (createError) throw createError;
      if (createResult === "created") meetingId = candidateMeetingId;
      return createResult;
    },
  };

  return {
    store,
    setMeetingId(value: string | null) {
      meetingId = value;
    },
    setCreateResult(value: "created" | "conflict") {
      createResult = value;
    },
    setCreateError(error: Error) {
      createError = error;
    },
  };
}

function fakeControlPlane(options?: {
  createdMeetingId?: string;
  failStatusFor?: string;
}) {
  const calls: string[] = [];
  const controlPlane: RealtimeKitMeetingControlPlane = {
    async createMeeting({ roomId, title }) {
      calls.push(`create:${roomId}:${title}`);
      return { meetingId: options?.createdMeetingId ?? "meeting-new" };
    },
    async setMeetingStatus(meetingId, status) {
      calls.push(`status:${meetingId}:${status}`);
      if (options?.failStatusFor === meetingId) {
        throw new Error("provider unavailable");
      }
    },
  };
  return { controlPlane, calls };
}

describe("ensureRealtimeKitMeetingProvisioned", () => {
  it("reactivates and reuses an existing backend mapping", async () => {
    const { store } = fakeStore("meeting-existing");
    const { controlPlane, calls } = fakeControlPlane();

    await expect(
      ensureRealtimeKitMeetingProvisioned(store, controlPlane, {
        roomId: "room-1",
        title: "Existing room",
      }),
    ).resolves.toEqual({ meetingId: "meeting-existing", created: false });

    expect(calls).toEqual(["status:meeting-existing:ACTIVE"]);
  });

  it("creates and persists a meeting when no mapping exists", async () => {
    const { store } = fakeStore();
    const { controlPlane, calls } = fakeControlPlane({
      createdMeetingId: "meeting-created",
    });

    await expect(
      ensureRealtimeKitMeetingProvisioned(store, controlPlane, {
        roomId: "room-2",
        title: "New room",
      }),
    ).resolves.toEqual({ meetingId: "meeting-created", created: true });

    expect(calls).toEqual(["create:room-2:New room"]);
  });

  it("compensates the losing provider meeting when another request wins the mapping race", async () => {
    const state = fakeStore();
    state.setCreateResult("conflict");
    const { controlPlane, calls } = fakeControlPlane({
      createdMeetingId: "meeting-loser",
    });

    let reads = 0;
    const racingStore: RoomMediaProvisioningStore = {
      async findMeetingId() {
        reads += 1;
        return reads === 1 ? null : "meeting-winner";
      },
      tryCreateMapping: state.store.tryCreateMapping,
    };

    await expect(
      ensureRealtimeKitMeetingProvisioned(racingStore, controlPlane, {
        roomId: "room-3",
        title: "Race room",
      }),
    ).resolves.toEqual({ meetingId: "meeting-winner", created: false });

    expect(calls).toEqual([
      "create:room-3:Race room",
      "status:meeting-loser:INACTIVE",
      "status:meeting-winner:ACTIVE",
    ]);
  });

  it("disables a newly created meeting when mapping persistence fails", async () => {
    const state = fakeStore();
    state.setCreateError(new Error("database unavailable"));
    const { controlPlane, calls } = fakeControlPlane({
      createdMeetingId: "meeting-orphan",
    });

    await expect(
      ensureRealtimeKitMeetingProvisioned(state.store, controlPlane, {
        roomId: "room-4",
        title: "Failure room",
      }),
    ).rejects.toThrow("database unavailable");

    expect(calls).toEqual([
      "create:room-4:Failure room",
      "status:meeting-orphan:INACTIVE",
    ]);
  });

  it("surfaces compensation failure instead of silently leaving an active orphan", async () => {
    const state = fakeStore();
    state.setCreateError(new Error("database unavailable"));
    const { controlPlane } = fakeControlPlane({
      createdMeetingId: "meeting-orphan",
      failStatusFor: "meeting-orphan",
    });

    await expect(
      ensureRealtimeKitMeetingProvisioned(state.store, controlPlane, {
        roomId: "room-5",
        title: "Cleanup failure",
      }),
    ).rejects.toThrow("manual cleanup required");
  });

  it("does not mutate provider state when a uniqueness conflict has no same-room winner", async () => {
    const state = fakeStore();
    state.setCreateResult("conflict");
    const { controlPlane, calls } = fakeControlPlane({
      createdMeetingId: "meeting-ambiguous",
    });

    await expect(
      ensureRealtimeKitMeetingProvisioned(state.store, controlPlane, {
        roomId: "room-6",
        title: "Ambiguous conflict",
      }),
    ).rejects.toThrow("manual reconciliation");

    expect(calls).toEqual(["create:room-6:Ambiguous conflict"]);
  });

  it("rejects invalid room metadata before touching the provider", async () => {
    const { store } = fakeStore();
    const { controlPlane, calls } = fakeControlPlane();

    await expect(
      ensureRealtimeKitMeetingProvisioned(store, controlPlane, {
        roomId: " ",
        title: "Valid title",
      }),
    ).rejects.toThrow("Room ID is required");

    await expect(
      ensureRealtimeKitMeetingProvisioned(store, controlPlane, {
        roomId: "room-7",
        title: "x",
      }),
    ).rejects.toThrow("between 3 and 100");

    expect(calls).toEqual([]);
  });
});

describe("deactivateRealtimeKitMeetingForRoom", () => {
  it("is a no-op when no mapping exists", async () => {
    const { store } = fakeStore();
    const { controlPlane, calls } = fakeControlPlane();

    await expect(
      deactivateRealtimeKitMeetingForRoom(store, controlPlane, "room-8"),
    ).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it("disables the backend-owned meeting without deleting its mapping", async () => {
    const { store } = fakeStore("meeting-close");
    const { controlPlane, calls } = fakeControlPlane();

    await expect(
      deactivateRealtimeKitMeetingForRoom(store, controlPlane, "room-9"),
    ).resolves.toBe(true);
    expect(calls).toEqual(["status:meeting-close:INACTIVE"]);
  });
});
