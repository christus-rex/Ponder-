import { describe, expect, it, vi } from "vitest";
import type {
  JoinMediaRoomInput,
  MediaParticipant,
  MediaRole,
  RealtimeMediaProvider,
  RoomBrainClientSyncState,
} from "../../packages/domain/src/index.ts";
import {
  RoomMediaSessionCoordinator,
  type RoomMediaSessionCoordinatorState,
} from "./roomMediaSessionCoordinator";

class FakeMediaProvider implements RealtimeMediaProvider {
  readonly operations: string[] = [];
  readonly joinInputs: JoinMediaRoomInput[] = [];
  joinGate: Deferred | null = null;
  microphoneGate: Deferred | null = null;
  microphoneError: Error | null = null;

  async join(input: JoinMediaRoomInput): Promise<void> {
    this.joinInputs.push(input);
    this.operations.push(`join:${input.role}`);
    const gate = this.joinGate;
    this.joinGate = null;
    if (gate) await gate.promise;
  }

  async leave(): Promise<void> {
    this.operations.push("leave");
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.operations.push(`microphone:${enabled}`);
    const gate = this.microphoneGate;
    this.microphoneGate = null;
    if (gate) await gate.promise;
    const error = this.microphoneError;
    this.microphoneError = null;
    if (error) throw error;
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    this.operations.push(`camera:${enabled}`);
  }

  participants(): readonly MediaParticipant[] {
    return [];
  }
}

describe("RoomMediaSessionCoordinator", () => {
  it("joins viewers subscribe-only and ignores local publish intent", async () => {
    const provider = new FakeMediaProvider();
    const coordinator = createCoordinator(provider);

    coordinator.setMicrophoneRequested(true);
    coordinator.updateRoomBrainState(synchronized("viewer"));
    await coordinator.whenSettled();

    expect(provider.joinInputs).toEqual([
      {
        roomId: "room-1",
        userId: "user-1",
        role: "viewer",
        token: "server-issued-media-token",
        initialMicrophoneEnabled: false,
      },
    ]);
    expect(provider.operations).toEqual(["join:viewer"]);
    expect(coordinator.state.microphoneEnabled).toBe(false);
    expect(coordinator.state.decision.mustUnpublish).toBe(true);
  });

  it("publishes only after promotion and unpublishes on demotion", async () => {
    const provider = new FakeMediaProvider();
    const coordinator = createCoordinator(provider);

    coordinator.setMicrophoneRequested(true);
    coordinator.updateRoomBrainState(synchronized("viewer", 1));
    await coordinator.whenSettled();

    coordinator.updateRoomBrainState(synchronized("speaker", 2));
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([
      "join:viewer",
      "leave",
      "join:speaker",
      "microphone:true",
    ]);
    expect(coordinator.state.microphoneEnabled).toBe(true);

    coordinator.updateRoomBrainState(synchronized("viewer", 3));
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([
      "join:viewer",
      "leave",
      "join:speaker",
      "microphone:true",
      "microphone:false",
      "leave",
      "join:viewer",
    ]);
    expect(coordinator.state.microphoneEnabled).toBe(false);

    coordinator.updateRoomBrainState(synchronized("viewer", 3));
    await coordinator.whenSettled();
    expect(provider.joinInputs).toHaveLength(3);
  });

  it("fails closed during desync and restores only after a new authoritative snapshot", async () => {
    const provider = new FakeMediaProvider();
    const coordinator = createCoordinator(provider);

    coordinator.setMicrophoneRequested(true);
    coordinator.updateRoomBrainState(synchronized("speaker", 4));
    await coordinator.whenSettled();
    expect(coordinator.state.microphoneEnabled).toBe(true);

    coordinator.updateRoomBrainState({
      status: "resync_required",
      room: synchronized("speaker", 4).room,
    });
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([
      "join:speaker",
      "microphone:true",
      "microphone:false",
      "leave",
    ]);
    expect(coordinator.state.decision.mayPublishAudio).toBe(false);
    expect(coordinator.state.joinedRole).toBeNull();

    coordinator.updateRoomBrainState(synchronized("speaker", 5));
    await coordinator.whenSettled();

    expect(provider.operations.slice(-2)).toEqual([
      "join:speaker",
      "microphone:true",
    ]);
  });

  it("does not publish when an obsolete join resolves after authority is lost", async () => {
    const provider = new FakeMediaProvider();
    const joinGate = deferred();
    provider.joinGate = joinGate;
    const coordinator = createCoordinator(provider);

    coordinator.setMicrophoneRequested(true);
    await coordinator.whenSettled();
    coordinator.updateRoomBrainState(synchronized("speaker", 1));
    expect(provider.operations).toEqual(["join:speaker"]);

    coordinator.updateRoomBrainState({
      status: "resync_required",
      room: synchronized("speaker", 1).room,
    });
    joinGate.resolve();
    await coordinator.whenSettled();

    expect(provider.operations).toEqual(["join:speaker", "leave"]);
    expect(coordinator.state.joinedRole).toBeNull();
    expect(coordinator.state.microphoneEnabled).toBe(false);
  });

  it("reverses a stale publish completion before rejoining a demoted viewer", async () => {
    const provider = new FakeMediaProvider();
    const coordinator = createCoordinator(provider);

    coordinator.updateRoomBrainState(synchronized("speaker", 1));
    await coordinator.whenSettled();

    const microphoneGate = deferred();
    provider.microphoneGate = microphoneGate;
    coordinator.setMicrophoneRequested(true);
    expect(provider.operations.at(-1)).toBe("microphone:true");

    coordinator.updateRoomBrainState(synchronized("viewer", 2));
    microphoneGate.resolve();
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([
      "join:speaker",
      "microphone:true",
      "microphone:false",
      "leave",
      "join:viewer",
    ]);
    expect(coordinator.state.joinedRole).toBe("viewer");
    expect(coordinator.state.microphoneEnabled).toBe(false);
  });

  it("still leaves on desync when the provider rejects explicit unpublish", async () => {
    const provider = new FakeMediaProvider();
    const errors: Error[] = [];
    const coordinator = new RoomMediaSessionCoordinator({
      roomId: "room-1",
      userId: "user-1",
      token: "server-issued-media-token",
      provider,
      onError: (error) => errors.push(error),
    });

    coordinator.setMicrophoneRequested(true);
    coordinator.updateRoomBrainState(synchronized("speaker", 1));
    await coordinator.whenSettled();

    provider.microphoneError = new Error("provider mute failed");
    coordinator.updateRoomBrainState({
      status: "resync_required",
      room: synchronized("speaker", 1).room,
    });
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([
      "join:speaker",
      "microphone:true",
      "microphone:false",
      "leave",
    ]);
    expect(coordinator.state.joinedRole).toBeNull();
    expect(coordinator.state.microphoneEnabled).toBe(false);
    expect(errors.map((error) => error.message)).toEqual([
      "provider mute failed",
    ]);
  });

  it("deduplicates snapshots and cannot be resurrected by callbacks after stop", async () => {
    const provider = new FakeMediaProvider();
    const onStateChange = vi.fn();
    const coordinator = createCoordinator(provider, onStateChange);
    const state = synchronized("viewer", 1);

    coordinator.updateRoomBrainState(state);
    await coordinator.whenSettled();
    coordinator.updateRoomBrainState(state);
    await coordinator.whenSettled();
    expect(provider.joinInputs).toHaveLength(1);

    await coordinator.stop();
    coordinator.updateRoomBrainState(synchronized("speaker", 2));
    coordinator.setMicrophoneRequested(true);
    await coordinator.stop();

    expect(provider.operations).toEqual(["join:viewer", "leave"]);
    expect(coordinator.state.phase).toBe("stopped");
    expect(onStateChange).toHaveBeenCalled();
  });
});

function createCoordinator(
  provider: RealtimeMediaProvider,
  onStateChange?: (state: RoomMediaSessionCoordinatorState) => void
) {
  return new RoomMediaSessionCoordinator({
    roomId: "room-1",
    userId: "user-1",
    token: "server-issued-media-token",
    provider,
    ...(onStateChange ? { onStateChange } : {}),
  });
}

function synchronized(
  role: MediaRole,
  sequence = 1
): Extract<RoomBrainClientSyncState, { status: "synchronized" }> {
  return {
    status: "synchronized",
    room: {
      sequence,
      locked: false,
      participants: {
        "user-1": { userId: "user-1", role },
      },
      speakerQueue: [],
      reactionBuckets: {},
    },
  };
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: Deferred["resolve"];
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
