import { describe, expect, it, vi } from "vitest";
import type {
  JoinMediaRoomInput,
  MediaJoinAuthorization,
  MediaJoinAuthorizationRequest,
  MediaParticipant,
  MediaRole,
  RealtimeMediaProvider,
  RequestMediaJoinAuthorization,
  RoomBrainClientSyncState,
} from "../../packages/domain/src/index.ts";
import {
  RoomMediaSessionCoordinator,
  type RoomMediaSessionCoordinatorState,
} from "./roomMediaSessionCoordinator";

class FakeMediaProvider implements RealtimeMediaProvider {
  readonly operations: string[] = [];
  readonly joinInputs: JoinMediaRoomInput[] = [];
  joinGate: Deferred<void> | null = null;
  microphoneGate: Deferred<void> | null = null;
  cameraGate: Deferred<void> | null = null;
  microphoneError: Error | null = null;
  cameraError: Error | null = null;

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
    const gate = this.cameraGate;
    this.cameraGate = null;
    if (gate) await gate.promise;
    const error = this.cameraError;
    this.cameraError = null;
    if (error) throw error;
  }

  participants(): readonly MediaParticipant[] {
    return [];
  }
}

describe("RoomMediaSessionCoordinator", () => {
  it("joins viewers subscribe-only with both publication devices disabled", async () => {
    const provider = new FakeMediaProvider();
    const coordinator = createCoordinator(provider);

    coordinator.setMicrophoneRequested(true);
    coordinator.setCameraRequested(true);
    coordinator.updateRoomBrainState(synchronized("viewer"));
    await coordinator.whenSettled();

    expect(provider.joinInputs).toEqual([
      {
        roomId: "room-1",
        userId: "user-1",
        role: "viewer",
        token: "viewer-1-token",
        initialMicrophoneEnabled: false,
        initialCameraEnabled: false,
      },
    ]);
    expect(provider.operations).toEqual(["join:viewer"]);
    expect(coordinator.state.microphoneEnabled).toBe(false);
    expect(coordinator.state.cameraEnabled).toBe(false);
    expect(coordinator.state.decision.mustUnpublishAudio).toBe(true);
    expect(coordinator.state.decision.mustUnpublishVideo).toBe(true);
  });

  it("publishes audio and video only after promotion and revokes both on demotion", async () => {
    const provider = new FakeMediaProvider();
    const authorizationRequests: MediaJoinAuthorizationRequest[] = [];
    const coordinator = createCoordinator(provider, {
      requestJoinAuthorization: async (request) => {
        authorizationRequests.push(request);
        return authorization(request);
      },
    });

    coordinator.setMicrophoneRequested(true);
    coordinator.setCameraRequested(true);
    coordinator.updateRoomBrainState(synchronized("viewer", 1));
    await coordinator.whenSettled();

    coordinator.updateRoomBrainState(synchronized("speaker", 2));
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([
      "join:viewer",
      "leave",
      "join:speaker",
      "microphone:true",
      "camera:true",
    ]);
    expect(coordinator.state.microphoneEnabled).toBe(true);
    expect(coordinator.state.cameraEnabled).toBe(true);

    coordinator.updateRoomBrainState(synchronized("viewer", 3));
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([
      "join:viewer",
      "leave",
      "join:speaker",
      "microphone:true",
      "camera:true",
      "microphone:false",
      "camera:false",
      "leave",
      "join:viewer",
    ]);
    expect(coordinator.state.microphoneEnabled).toBe(false);
    expect(coordinator.state.cameraEnabled).toBe(false);
    expect(
      authorizationRequests.map(({ role, authoritySequence }) => ({
        role,
        authoritySequence,
      }))
    ).toEqual([
      { role: "viewer", authoritySequence: 1 },
      { role: "speaker", authoritySequence: 2 },
      { role: "viewer", authoritySequence: 3 },
    ]);
    expect(provider.joinInputs.map(({ token }) => token)).toEqual([
      "viewer-1-token",
      "speaker-2-token",
      "viewer-3-token",
    ]);

    coordinator.updateRoomBrainState(synchronized("viewer", 3));
    await coordinator.whenSettled();
    expect(provider.joinInputs).toHaveLength(3);
  });

  it("fails closed for audio and video during desync and restores after a new snapshot", async () => {
    const provider = new FakeMediaProvider();
    const coordinator = createCoordinator(provider);

    coordinator.setMicrophoneRequested(true);
    coordinator.setCameraRequested(true);
    coordinator.updateRoomBrainState(synchronized("speaker", 4));
    await coordinator.whenSettled();

    coordinator.updateRoomBrainState({
      status: "resync_required",
      room: synchronized("speaker", 4).room,
    });
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([
      "join:speaker",
      "microphone:true",
      "camera:true",
      "microphone:false",
      "camera:false",
      "leave",
    ]);
    expect(coordinator.state.decision.mayPublishAudio).toBe(false);
    expect(coordinator.state.decision.mayPublishVideo).toBe(false);
    expect(coordinator.state.joinedRole).toBeNull();

    coordinator.updateRoomBrainState(synchronized("speaker", 5));
    await coordinator.whenSettled();

    expect(provider.operations.slice(-3)).toEqual([
      "join:speaker",
      "microphone:true",
      "camera:true",
    ]);
  });

  it("does not join when obsolete authorization resolves after authority is lost", async () => {
    const provider = new FakeMediaProvider();
    const authorizationGate = deferred<MediaJoinAuthorization>();
    const requestJoinAuthorization = vi.fn(async () => authorizationGate.promise);
    const coordinator = createCoordinator(provider, { requestJoinAuthorization });

    coordinator.setCameraRequested(true);
    await coordinator.whenSettled();
    coordinator.updateRoomBrainState(synchronized("speaker", 1));
    await vi.waitFor(() => expect(requestJoinAuthorization).toHaveBeenCalledOnce());

    coordinator.updateRoomBrainState({
      status: "resync_required",
      room: synchronized("speaker", 1).room,
    });
    authorizationGate.resolve(
      authorization({
        roomId: "room-1",
        userId: "user-1",
        role: "speaker",
        authoritySequence: 1,
      })
    );
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([]);
    expect(coordinator.state.joinedRole).toBeNull();
    expect(coordinator.state.cameraEnabled).toBe(false);
  });

  it("does not publish when an obsolete provider join resolves after authority is lost", async () => {
    const provider = new FakeMediaProvider();
    const joinGate = deferred<void>();
    provider.joinGate = joinGate;
    const coordinator = createCoordinator(provider);

    coordinator.setMicrophoneRequested(true);
    coordinator.setCameraRequested(true);
    await coordinator.whenSettled();
    coordinator.updateRoomBrainState(synchronized("speaker", 1));
    await vi.waitFor(() => expect(provider.operations).toEqual(["join:speaker"]));

    coordinator.updateRoomBrainState({
      status: "resync_required",
      room: synchronized("speaker", 1).room,
    });
    joinGate.resolve();
    await coordinator.whenSettled();

    expect(provider.operations).toEqual(["join:speaker", "leave"]);
    expect(coordinator.state.joinedRole).toBeNull();
    expect(coordinator.state.microphoneEnabled).toBe(false);
    expect(coordinator.state.cameraEnabled).toBe(false);
  });

  it("reverses stale audio and video publication completions after demotion", async () => {
    const provider = new FakeMediaProvider();
    const coordinator = createCoordinator(provider);

    coordinator.updateRoomBrainState(synchronized("speaker", 1));
    await coordinator.whenSettled();

    const microphoneGate = deferred<void>();
    provider.microphoneGate = microphoneGate;
    coordinator.setMicrophoneRequested(true);
    await vi.waitFor(() =>
      expect(provider.operations.at(-1)).toBe("microphone:true")
    );
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

    coordinator.updateRoomBrainState(synchronized("speaker", 3));
    await coordinator.whenSettled();
    coordinator.setMicrophoneRequested(false);
    await coordinator.whenSettled();

    const cameraGate = deferred<void>();
    provider.cameraGate = cameraGate;
    coordinator.setCameraRequested(true);
    await vi.waitFor(() => expect(provider.operations.at(-1)).toBe("camera:true"));
    coordinator.updateRoomBrainState(synchronized("viewer", 4));
    cameraGate.resolve();
    await coordinator.whenSettled();

    expect(provider.operations.slice(-4)).toEqual([
      "camera:true",
      "camera:false",
      "leave",
      "join:viewer",
    ]);
    expect(coordinator.state.joinedRole).toBe("viewer");
    expect(coordinator.state.cameraEnabled).toBe(false);
  });

  it("still leaves when the provider rejects explicit audio and video unpublish", async () => {
    const provider = new FakeMediaProvider();
    const errors: Error[] = [];
    const coordinator = createCoordinator(provider, {
      onError: (error) => errors.push(error),
    });

    coordinator.setMicrophoneRequested(true);
    coordinator.setCameraRequested(true);
    coordinator.updateRoomBrainState(synchronized("speaker", 1));
    await coordinator.whenSettled();

    provider.microphoneError = new Error("provider mute failed");
    provider.cameraError = new Error("provider camera stop failed");
    coordinator.updateRoomBrainState({
      status: "resync_required",
      room: synchronized("speaker", 1).room,
    });
    await coordinator.whenSettled();

    expect(provider.operations).toEqual([
      "join:speaker",
      "microphone:true",
      "camera:true",
      "microphone:false",
      "camera:false",
      "leave",
    ]);
    expect(coordinator.state.joinedRole).toBeNull();
    expect(coordinator.state.microphoneEnabled).toBe(false);
    expect(coordinator.state.cameraEnabled).toBe(false);
    expect(errors.map((error) => error.message)).toEqual([
      "provider mute failed",
      "provider camera stop failed",
    ]);
  });

  it("rejects expired or incorrectly bound media authorization", async () => {
    const mismatchedProvider = new FakeMediaProvider();
    const mismatchedCoordinator = createCoordinator(mismatchedProvider, {
      now: () => 5_000,
      requestJoinAuthorization: async (request) => ({
        ...request,
        role: "viewer",
        token: "wrong-role-token",
        expiresAt: 6_000,
      }),
    });

    mismatchedCoordinator.updateRoomBrainState(synchronized("speaker", 1));
    await mismatchedCoordinator.whenSettled();
    expect(mismatchedProvider.operations).toEqual([]);
    expect(mismatchedCoordinator.state.lastError).toContain("does not match");

    const expiredProvider = new FakeMediaProvider();
    const expiredCoordinator = createCoordinator(expiredProvider, {
      now: () => 5_000,
      requestJoinAuthorization: async (request) => ({
        ...request,
        token: "expired-token",
        expiresAt: 4_999,
      }),
    });

    expiredCoordinator.updateRoomBrainState(synchronized("speaker", 1));
    await expiredCoordinator.whenSettled();
    expect(expiredProvider.operations).toEqual([]);
    expect(expiredCoordinator.state.phase).toBe("error");
    expect(expiredCoordinator.state.lastError).toContain("expired");
  });

  it("deduplicates snapshots and cannot be resurrected by callbacks after stop", async () => {
    const provider = new FakeMediaProvider();
    const onStateChange = vi.fn();
    const requestJoinAuthorization = vi.fn(defaultAuthorizationIssuer);
    const coordinator = createCoordinator(provider, {
      onStateChange,
      requestJoinAuthorization,
    });
    const state = synchronized("viewer", 1);

    coordinator.updateRoomBrainState(state);
    await coordinator.whenSettled();
    coordinator.updateRoomBrainState(state);
    await coordinator.whenSettled();
    expect(provider.joinInputs).toHaveLength(1);
    expect(requestJoinAuthorization).toHaveBeenCalledOnce();

    await coordinator.stop();
    coordinator.updateRoomBrainState(synchronized("speaker", 2));
    coordinator.setMicrophoneRequested(true);
    coordinator.setCameraRequested(true);
    await coordinator.stop();

    expect(provider.operations).toEqual(["join:viewer", "leave"]);
    expect(coordinator.state.phase).toBe("stopped");
    expect(onStateChange).toHaveBeenCalled();
  });
});

interface CoordinatorTestOptions {
  requestJoinAuthorization?: RequestMediaJoinAuthorization;
  now?: () => number;
  onStateChange?: (state: RoomMediaSessionCoordinatorState) => void;
  onError?: (error: Error) => void;
}

function createCoordinator(
  provider: RealtimeMediaProvider,
  options: CoordinatorTestOptions = {}
) {
  return new RoomMediaSessionCoordinator({
    roomId: "room-1",
    userId: "user-1",
    provider,
    requestJoinAuthorization:
      options.requestJoinAuthorization ?? defaultAuthorizationIssuer,
    ...(options.now ? { now: options.now } : {}),
    ...(options.onStateChange ? { onStateChange: options.onStateChange } : {}),
    ...(options.onError ? { onError: options.onError } : {}),
  });
}

async function defaultAuthorizationIssuer(
  request: MediaJoinAuthorizationRequest
): Promise<MediaJoinAuthorization> {
  return authorization(request);
}

function authorization(
  request: MediaJoinAuthorizationRequest
): MediaJoinAuthorization {
  return {
    ...request,
    token: `${request.role}-${request.authoritySequence}-token`,
    expiresAt: Date.now() + 60_000,
  };
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
