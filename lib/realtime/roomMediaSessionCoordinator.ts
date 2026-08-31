import {
  deriveRoomMediaSessionDecision,
  initialRoomBrainClientSyncState,
  type MediaRole,
  type MediaJoinAuthorization,
  type RealtimeMediaProvider,
  type RequestMediaJoinAuthorization,
  type RoomBrainClientSyncState,
  type RoomId,
  type RoomMediaSessionDecision,
  type UserId,
} from "../../packages/domain/src/index.ts";

export type RoomMediaSessionPhase =
  | "idle"
  | "joining"
  | "joined"
  | "leaving"
  | "error"
  | "stopped";

export interface RoomMediaSessionCoordinatorState {
  phase: RoomMediaSessionPhase;
  decision: RoomMediaSessionDecision;
  joinedRole: MediaRole | null;
  microphoneRequested: boolean;
  microphoneEnabled: boolean;
  cameraRequested: boolean;
  cameraEnabled: boolean;
  lastError: string | null;
}

export interface RoomMediaSessionCoordinatorOptions {
  roomId: RoomId;
  userId: UserId;
  provider: RealtimeMediaProvider;
  requestJoinAuthorization: RequestMediaJoinAuthorization;
  now?: () => number;
  onStateChange?: (state: RoomMediaSessionCoordinatorState) => void;
  onError?: (error: Error) => void;
}

/**
 * The only application-layer owner of SFU join/leave and local publication.
 * Room Brain synchronization and role state are its authority; local device
 * intent can narrow that authority but can never expand it.
 */
export class RoomMediaSessionCoordinator {
  private readonly roomId: RoomId;
  private readonly userId: UserId;
  private readonly provider: RealtimeMediaProvider;
  private readonly requestJoinAuthorization: RequestMediaJoinAuthorization;
  private readonly now: () => number;
  private readonly onStateChange?: (state: RoomMediaSessionCoordinatorState) => void;
  private readonly onError?: (error: Error) => void;

  private decision: RoomMediaSessionDecision;
  private phase: RoomMediaSessionPhase = "idle";
  private joinedRole: MediaRole | null = null;
  private microphoneRequested = false;
  private microphoneEnabled = false;
  private cameraRequested = false;
  private cameraEnabled = false;
  private lastError: string | null = null;
  private stopped = false;
  private desiredRevision = 0;
  private settledRevision = 0;
  private worker: Promise<void> | null = null;

  constructor(options: RoomMediaSessionCoordinatorOptions) {
    if (!options.roomId.trim()) throw new Error("roomId is required");
    if (!options.userId.trim()) throw new Error("userId is required");
    if (typeof options.requestJoinAuthorization !== "function") {
      throw new Error("requestJoinAuthorization is required");
    }

    this.roomId = options.roomId;
    this.userId = options.userId;
    this.provider = options.provider;
    this.requestJoinAuthorization = options.requestJoinAuthorization;
    this.now = options.now ?? Date.now;
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;
    this.decision = deriveRoomMediaSessionDecision(
      initialRoomBrainClientSyncState(),
      this.userId
    );
  }

  get state(): RoomMediaSessionCoordinatorState {
    return {
      phase: this.phase,
      decision: { ...this.decision },
      joinedRole: this.joinedRole,
      microphoneRequested: this.microphoneRequested,
      microphoneEnabled: this.microphoneEnabled,
      cameraRequested: this.cameraRequested,
      cameraEnabled: this.cameraEnabled,
      lastError: this.lastError,
    };
  }

  updateRoomBrainState(state: RoomBrainClientSyncState): void {
    if (this.stopped) return;
    this.decision = deriveRoomMediaSessionDecision(state, this.userId);
    this.requestReconciliation();
  }

  setMicrophoneRequested(enabled: boolean): void {
    if (this.stopped) return;
    if (this.microphoneRequested === enabled) return;
    this.microphoneRequested = enabled;
    this.requestReconciliation();
  }

  setCameraRequested(enabled: boolean): void {
    if (this.stopped) return;
    if (this.cameraRequested === enabled) return;
    this.cameraRequested = enabled;
    this.requestReconciliation();
  }

  async stop(): Promise<void> {
    if (!this.stopped) {
      this.stopped = true;
      this.decision = deriveRoomMediaSessionDecision(
        initialRoomBrainClientSyncState(),
        this.userId
      );
      this.requestReconciliation();
    }
    await this.whenSettled();
  }

  async whenSettled(): Promise<void> {
    while (this.worker) {
      await this.worker;
    }
  }

  private requestReconciliation(): void {
    this.desiredRevision += 1;
    this.emitState();
    this.ensureWorker();
  }

  private ensureWorker(): void {
    if (this.worker) return;

    const worker = this.reconcileUntilStable().finally(() => {
      if (this.worker !== worker) return;
      this.worker = null;
      if (this.settledRevision !== this.desiredRevision) {
        this.ensureWorker();
      }
    });
    this.worker = worker;
  }

  private async reconcileUntilStable(): Promise<void> {
    while (true) {
      const revision = this.desiredRevision;
      let progressed: boolean;

      try {
        progressed = await this.reconcileOneStep(revision);
      } catch (error) {
        this.settledRevision = revision;
        this.phase = "error";
        this.reportError(asError(error));
        this.emitState();
        return;
      }

      if (progressed) continue;
      if (revision !== this.desiredRevision) continue;

      this.settledRevision = revision;
      this.phase = this.stopped
        ? "stopped"
        : this.joinedRole
          ? "joined"
          : "idle";
      this.emitState();
      return;
    }
  }

  private async reconcileOneStep(revision: number): Promise<boolean> {
    const shouldJoin = !this.stopped && this.decision.shouldJoinSfu;

    if (!shouldJoin) {
      if (this.joinedRole) {
        await this.leaveCurrentSession();
        return true;
      }
      return false;
    }

    const desiredRole = this.decision.role;
    if (!desiredRole) {
      throw new Error("Room Brain allowed an SFU join without a participant role");
    }

    if (!this.joinedRole) {
      await this.joinCurrentSession(desiredRole, revision);
      return true;
    }

    if (this.joinedRole !== desiredRole) {
      await this.leaveCurrentSession();
      return true;
    }

    const shouldEnableMicrophone =
      this.microphoneRequested && this.decision.mayPublishAudio;
    if (this.microphoneEnabled !== shouldEnableMicrophone) {
      await this.setProviderMicrophoneEnabled(shouldEnableMicrophone);
      return true;
    }

    const shouldEnableCamera =
      this.cameraRequested && this.decision.mayPublishVideo;
    if (this.cameraEnabled !== shouldEnableCamera) {
      await this.setProviderCameraEnabled(shouldEnableCamera);
      return true;
    }

    return false;
  }

  private async joinCurrentSession(
    role: MediaRole,
    revision: number
  ): Promise<void> {
    const authoritySequence = this.decision.authoritySequence;
    if (authoritySequence === null) {
      throw new Error("Room Brain allowed an SFU join without an authority sequence");
    }

    this.phase = "joining";
    this.emitState();
    let authorization: MediaJoinAuthorization;
    try {
      authorization = await this.requestJoinAuthorization({
        roomId: this.roomId,
        userId: this.userId,
        role,
        authoritySequence,
      });
    } catch (error) {
      if (
        revision !== this.desiredRevision ||
        !this.isJoinStillAuthorized(role, authoritySequence)
      ) {
        return;
      }
      throw error;
    }

    if (
      revision !== this.desiredRevision ||
      !this.isJoinStillAuthorized(role, authoritySequence)
    ) {
      return;
    }

    this.assertValidJoinAuthorization(authorization, role, authoritySequence);
    await this.provider.join({
      roomId: this.roomId,
      userId: this.userId,
      role,
      token: authorization.token,
      initialMicrophoneEnabled: false,
      initialCameraEnabled: false,
    });
    this.joinedRole = role;
    this.microphoneEnabled = false;
    this.cameraEnabled = false;
    this.lastError = null;
    this.emitState();
  }

  private async leaveCurrentSession(): Promise<void> {
    this.phase = "leaving";
    this.emitState();

    const publicationErrors: Error[] = [];
    if (this.microphoneEnabled) {
      try {
        await this.provider.setMicrophoneEnabled(false);
        this.microphoneEnabled = false;
      } catch (error) {
        publicationErrors.push(asError(error));
      }
    }

    if (this.cameraEnabled) {
      try {
        await this.provider.setCameraEnabled(false);
        this.cameraEnabled = false;
      } catch (error) {
        publicationErrors.push(asError(error));
      }
    }

    try {
      await this.provider.leave();
      this.joinedRole = null;
      this.microphoneEnabled = false;
      this.cameraEnabled = false;
      this.lastError = null;
    } catch (error) {
      const leaveError = asError(error);
      if (publicationErrors.length > 0) {
        throw new AggregateError(
          [...publicationErrors, leaveError],
          "Unable to fail closed or leave the media session"
        );
      }
      throw leaveError;
    }

    for (const error of publicationErrors) this.reportError(error);
    this.emitState();
  }

  private async setProviderMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.provider.setMicrophoneEnabled(enabled);
    this.microphoneEnabled = enabled;
    this.lastError = null;
    this.emitState();
  }

  private async setProviderCameraEnabled(enabled: boolean): Promise<void> {
    await this.provider.setCameraEnabled(enabled);
    this.cameraEnabled = enabled;
    this.lastError = null;
    this.emitState();
  }

  private isJoinStillAuthorized(
    role: MediaRole,
    authoritySequence: number
  ): boolean {
    return (
      !this.stopped &&
      this.decision.shouldJoinSfu &&
      this.decision.role === role &&
      this.decision.authoritySequence === authoritySequence
    );
  }

  private assertValidJoinAuthorization(
    authorization: MediaJoinAuthorization,
    role: MediaRole,
    authoritySequence: number
  ): void {
    if (
      authorization.roomId !== this.roomId ||
      authorization.userId !== this.userId ||
      authorization.role !== role ||
      authorization.authoritySequence !== authoritySequence
    ) {
      throw new Error("Media join authorization does not match Room Brain authority");
    }
    if (!authorization.token.trim()) {
      throw new Error("Media join authorization token is required");
    }
    if (
      !Number.isFinite(authorization.expiresAt) ||
      authorization.expiresAt <= this.now()
    ) {
      throw new Error("Media join authorization is expired");
    }
  }

  private reportError(error: Error): void {
    this.lastError = error.message;
    this.onError?.(error);
  }

  private emitState(): void {
    this.onStateChange?.(this.state);
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown media session error");
}
