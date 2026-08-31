import {
  deriveRoomMediaSessionDecision,
  initialRoomBrainClientSyncState,
  type MediaRole,
  type RealtimeMediaProvider,
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
  lastError: string | null;
}

export interface RoomMediaSessionCoordinatorOptions {
  roomId: RoomId;
  userId: UserId;
  token: string;
  provider: RealtimeMediaProvider;
  onStateChange?: (state: RoomMediaSessionCoordinatorState) => void;
  onError?: (error: Error) => void;
}

/**
 * The only application-layer owner of SFU join/leave and microphone mutation.
 * Room Brain synchronization and role state are its authority; local microphone
 * intent can narrow that authority but can never expand it.
 */
export class RoomMediaSessionCoordinator {
  private readonly roomId: RoomId;
  private readonly userId: UserId;
  private readonly token: string;
  private readonly provider: RealtimeMediaProvider;
  private readonly onStateChange?: (state: RoomMediaSessionCoordinatorState) => void;
  private readonly onError?: (error: Error) => void;

  private decision: RoomMediaSessionDecision;
  private phase: RoomMediaSessionPhase = "idle";
  private joinedRole: MediaRole | null = null;
  private microphoneRequested = false;
  private microphoneEnabled = false;
  private lastError: string | null = null;
  private stopped = false;
  private desiredRevision = 0;
  private settledRevision = 0;
  private worker: Promise<void> | null = null;

  constructor(options: RoomMediaSessionCoordinatorOptions) {
    if (!options.roomId.trim()) throw new Error("roomId is required");
    if (!options.userId.trim()) throw new Error("userId is required");
    if (!options.token.trim()) throw new Error("media token is required");

    this.roomId = options.roomId;
    this.userId = options.userId;
    this.token = options.token;
    this.provider = options.provider;
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
        progressed = await this.reconcileOneStep();
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

  private async reconcileOneStep(): Promise<boolean> {
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
      await this.joinCurrentSession(desiredRole);
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

    return false;
  }

  private async joinCurrentSession(role: MediaRole): Promise<void> {
    this.phase = "joining";
    this.emitState();
    await this.provider.join({
      roomId: this.roomId,
      userId: this.userId,
      role,
      token: this.token,
      initialMicrophoneEnabled: false,
    });
    this.joinedRole = role;
    this.microphoneEnabled = false;
    this.lastError = null;
    this.emitState();
  }

  private async leaveCurrentSession(): Promise<void> {
    this.phase = "leaving";
    this.emitState();

    let muteError: Error | null = null;
    if (this.microphoneEnabled) {
      try {
        await this.provider.setMicrophoneEnabled(false);
        this.microphoneEnabled = false;
      } catch (error) {
        muteError = asError(error);
      }
    }

    try {
      await this.provider.leave();
      this.joinedRole = null;
      this.microphoneEnabled = false;
      this.lastError = null;
    } catch (error) {
      const leaveError = asError(error);
      if (muteError) {
        throw new AggregateError(
          [muteError, leaveError],
          "Unable to fail closed or leave the media session"
        );
      }
      throw leaveError;
    }

    if (muteError) this.reportError(muteError);
    this.emitState();
  }

  private async setProviderMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.provider.setMicrophoneEnabled(enabled);
    this.microphoneEnabled = enabled;
    this.lastError = null;
    this.emitState();
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
