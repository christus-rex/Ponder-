import {
  mayMediaRolePublishAudio,
  mayMediaRolePublishVideo,
  type JoinMediaRoomInput,
  type MediaParticipant,
  type MediaRole,
  type RealtimeMediaProvider,
} from "../../packages/domain/src/index.ts";

type ProductionPermission = "ALLOWED" | "NOT_ALLOWED" | "CAN_REQUEST";

interface RealtimeKitParticipantLike {
  userId: string;
  customParticipantId?: string;
  presetName?: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  registerVideoElement?: (element: HTMLVideoElement) => void;
  deregisterVideoElement?: (element: HTMLVideoElement) => void;
}

interface RealtimeKitMeetingLike {
  join(): Promise<void>;
  leave(): Promise<void>;
  self: RealtimeKitParticipantLike & {
    permissions: {
      canProduceAudio: ProductionPermission;
      canProduceVideo: ProductionPermission;
    };
    enableAudio(): Promise<void>;
    disableAudio(): Promise<void> | void;
    enableVideo(): Promise<void>;
    disableVideo(): Promise<void> | void;
  };
  participants: {
    joined: {
      toArray(): RealtimeKitParticipantLike[];
    };
  };
}

export type RealtimeKitMeetingFactory = (
  authToken: string
) => Promise<RealtimeKitMeetingLike>;

export interface RealtimeKitMediaProviderOptions {
  createMeeting?: RealtimeKitMeetingFactory;
  roleForPresetName?: (presetName: string | undefined) => MediaRole;
}

/**
 * RealtimeKit SDK adapter. It owns provider objects and performs a second,
 * provider-side permission check before the coordinator can join or publish.
 */
export class RealtimeKitMediaProvider implements RealtimeMediaProvider {
  private readonly createMeeting: RealtimeKitMeetingFactory;
  private readonly roleForPresetName: (
    presetName: string | undefined
  ) => MediaRole;
  private meeting: RealtimeKitMeetingLike | null = null;
  private joinedInput: JoinMediaRoomInput | null = null;

  constructor(options: RealtimeKitMediaProviderOptions = {}) {
    this.createMeeting = options.createMeeting ?? createRealtimeKitMeeting;
    this.roleForPresetName = options.roleForPresetName ?? defaultRoleForPresetName;
  }

  async join(input: JoinMediaRoomInput): Promise<void> {
    if (this.meeting || this.joinedInput) {
      throw new Error("RealtimeKit media session is already joined");
    }
    if (input.initialMicrophoneEnabled || input.initialCameraEnabled) {
      throw new Error("RealtimeKit joins must start with publication disabled");
    }

    const meeting = await this.createMeeting(input.token);
    try {
      assertRoleMatchesProviderPermissions(input.role, meeting.self.permissions);
      await meeting.join();
      await disableInitialPublication(meeting);
    } catch (error) {
      try {
        await meeting.leave();
      } catch {
        // Preserve the join/permission failure; the coordinator remains unjoined.
      }
      throw error;
    }

    this.meeting = meeting;
    this.joinedInput = input;
  }

  async leave(): Promise<void> {
    const meeting = this.meeting;
    if (!meeting) {
      this.joinedInput = null;
      return;
    }

    const errors: Error[] = [];
    await attempt(() => meeting.self.disableAudio(), errors);
    await attempt(() => meeting.self.disableVideo(), errors);
    try {
      await meeting.leave();
    } catch (error) {
      errors.push(asError(error));
      if (errors.length === 1) throw errors[0];
      throw new AggregateError(errors, "Unable to close RealtimeKit media session");
    }

    this.meeting = null;
    this.joinedInput = null;
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    const { meeting, input } = this.requireJoinedSession();
    if (enabled) {
      assertPublicationAllowed(
        input.role,
        meeting.self.permissions.canProduceAudio,
        "audio"
      );
      await meeting.self.enableAudio();
      return;
    }
    await meeting.self.disableAudio();
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    const { meeting, input } = this.requireJoinedSession();
    if (enabled) {
      assertPublicationAllowed(
        input.role,
        meeting.self.permissions.canProduceVideo,
        "video"
      );
      await meeting.self.enableVideo();
      return;
    }
    await meeting.self.disableVideo();
  }

  participants(): readonly MediaParticipant[] {
    if (!this.meeting || !this.joinedInput) return [];

    const local: MediaParticipant = {
      userId: this.joinedInput.userId,
      role: this.joinedInput.role,
      microphoneEnabled: this.meeting.self.audioEnabled,
      cameraEnabled: this.meeting.self.videoEnabled,
    };
    const remote = this.meeting.participants.joined.toArray().map((participant) => ({
      userId: participant.customParticipantId || participant.userId,
      role: this.roleForPresetName(participant.presetName),
      microphoneEnabled: participant.audioEnabled,
      cameraEnabled: participant.videoEnabled,
    }));
    return [local, ...remote];
  }

  registerVideoElement(userId: string, element: HTMLVideoElement): () => void {
    const { meeting, input } = this.requireJoinedSession();
    const participant =
      userId === input.userId
        ? meeting.self
        : meeting.participants.joined
            .toArray()
            .find(
              (candidate) =>
                candidate.customParticipantId === userId || candidate.userId === userId
            );
    if (!participant?.registerVideoElement || !participant.deregisterVideoElement) {
      throw new Error("RealtimeKit participant video is not available");
    }

    participant.registerVideoElement(element);
    return () => participant.deregisterVideoElement?.(element);
  }

  private requireJoinedSession(): {
    meeting: RealtimeKitMeetingLike;
    input: JoinMediaRoomInput;
  } {
    if (!this.meeting || !this.joinedInput) {
      throw new Error("RealtimeKit media session is not joined");
    }
    return { meeting: this.meeting, input: this.joinedInput };
  }
}

async function createRealtimeKitMeeting(
  authToken: string
): Promise<RealtimeKitMeetingLike> {
  const { default: RealtimeKitClient } = await import("@cloudflare/realtimekit");
  return RealtimeKitClient.init({
    authToken,
    defaults: { audio: false, video: false },
  }) as unknown as Promise<RealtimeKitMeetingLike>;
}

function assertRoleMatchesProviderPermissions(
  role: MediaRole,
  permissions: RealtimeKitMeetingLike["self"]["permissions"]
): void {
  assertPublicationPermissionForRole(role, permissions.canProduceAudio, "audio");
  assertPublicationPermissionForRole(role, permissions.canProduceVideo, "video");
}

function assertPublicationPermissionForRole(
  role: MediaRole,
  permission: ProductionPermission,
  kind: "audio" | "video"
): void {
  const mayPublish =
    kind === "audio"
      ? mayMediaRolePublishAudio(role)
      : mayMediaRolePublishVideo(role);
  const expected = mayPublish ? "ALLOWED" : "NOT_ALLOWED";
  if (permission !== expected) {
    throw new Error(
      `RealtimeKit ${kind} permission does not match authoritative ${role} role`
    );
  }
}

function assertPublicationAllowed(
  role: MediaRole,
  permission: ProductionPermission,
  kind: "audio" | "video"
): void {
  const roleAllows =
    kind === "audio"
      ? mayMediaRolePublishAudio(role)
      : mayMediaRolePublishVideo(role);
  if (!roleAllows || permission !== "ALLOWED") {
    throw new Error(`RealtimeKit ${kind} publication is not authorized`);
  }
}

async function disableInitialPublication(
  meeting: RealtimeKitMeetingLike
): Promise<void> {
  if (meeting.self.audioEnabled) await meeting.self.disableAudio();
  if (meeting.self.videoEnabled) await meeting.self.disableVideo();
}

async function attempt(
  operation: () => Promise<void> | void,
  errors: Error[]
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    errors.push(asError(error));
  }
}

function defaultRoleForPresetName(presetName: string | undefined): MediaRole {
  const role = presetName?.replace(/^ponder-/, "");
  return role === "host" ||
    role === "moderator" ||
    role === "speaker" ||
    role === "viewer"
    ? role
    : "viewer";
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown RealtimeKit error");
}
