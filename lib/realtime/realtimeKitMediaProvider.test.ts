import { describe, expect, it } from "vitest";
import type { JoinMediaRoomInput } from "../../packages/domain/src/index.ts";
import {
  RealtimeKitMediaProvider,
  type RealtimeKitMeetingFactory,
} from "./realtimeKitMediaProvider";

class FakeMeeting {
  readonly operations: string[] = [];
  leaveError: Error | null = null;
  readonly remote = [
    {
      userId: "rtk-remote",
      customParticipantId: "user-2",
      presetName: "ponder-viewer",
      audioEnabled: false,
      videoEnabled: true,
      registerVideoElement: () => this.operations.push("remote:register"),
      deregisterVideoElement: () => this.operations.push("remote:deregister"),
    },
  ];
  self = {
    userId: "rtk-local",
    audioEnabled: false,
    videoEnabled: false,
    permissions: {
      canProduceAudio: "ALLOWED" as const,
      canProduceVideo: "ALLOWED" as const,
    },
    enableAudio: async () => {
      this.operations.push("audio:true");
      this.self.audioEnabled = true;
    },
    disableAudio: async () => {
      this.operations.push("audio:false");
      this.self.audioEnabled = false;
    },
    enableVideo: async () => {
      this.operations.push("video:true");
      this.self.videoEnabled = true;
    },
    disableVideo: async () => {
      this.operations.push("video:false");
      this.self.videoEnabled = false;
    },
    registerVideoElement: () => this.operations.push("self:register"),
    deregisterVideoElement: () => this.operations.push("self:deregister"),
  };
  participants = { joined: { toArray: () => this.remote } };

  async join() {
    this.operations.push("join");
  }

  async leave() {
    this.operations.push("leave");
    const error = this.leaveError;
    this.leaveError = null;
    if (error) throw error;
  }
}

describe("RealtimeKitMediaProvider", () => {
  it("joins muted and controls microphone and camera for a speaker preset", async () => {
    const meeting = new FakeMeeting();
    const tokens: string[] = [];
    const provider = providerFor(meeting, tokens);

    await provider.join(joinInput("speaker"));
    await provider.setMicrophoneEnabled(true);
    await provider.setCameraEnabled(true);

    expect(tokens).toEqual(["role-bound-token"]);
    expect(meeting.operations).toEqual(["join", "audio:true", "video:true"]);
    expect(provider.participants()).toEqual([
      {
        userId: "user-1",
        role: "speaker",
        microphoneEnabled: true,
        cameraEnabled: true,
      },
      {
        userId: "user-2",
        role: "viewer",
        microphoneEnabled: false,
        cameraEnabled: true,
      },
    ]);

    await provider.leave();
    expect(meeting.operations.slice(-3)).toEqual([
      "audio:false",
      "video:false",
      "leave",
    ]);
    expect(provider.participants()).toEqual([]);
  });

  it("rejects a viewer token whose provider preset can publish", async () => {
    const meeting = new FakeMeeting();
    const provider = providerFor(meeting);

    await expect(provider.join(joinInput("viewer"))).rejects.toThrow(
      "does not match authoritative viewer role"
    );
    expect(meeting.operations).toEqual(["leave"]);
  });

  it("rejects a speaker token whose provider preset cannot publish video", async () => {
    const meeting = new FakeMeeting();
    meeting.self.permissions.canProduceVideo = "NOT_ALLOWED" as "ALLOWED";
    const provider = providerFor(meeting);

    await expect(provider.join(joinInput("speaker"))).rejects.toThrow(
      "video permission does not match"
    );
    expect(meeting.operations).toEqual(["leave"]);
  });

  it("forces unexpected initial publication off after joining", async () => {
    const meeting = new FakeMeeting();
    meeting.self.audioEnabled = true;
    meeting.self.videoEnabled = true;
    const provider = providerFor(meeting);

    await provider.join(joinInput("speaker"));

    expect(meeting.operations).toEqual(["join", "audio:false", "video:false"]);
  });

  it("registers local and remote participant video elements", async () => {
    const meeting = new FakeMeeting();
    const provider = providerFor(meeting);
    const element = {} as HTMLVideoElement;
    await provider.join(joinInput("speaker"));

    const detachSelf = provider.registerVideoElement("user-1", element);
    const detachRemote = provider.registerVideoElement("user-2", element);
    detachSelf();
    detachRemote();

    expect(meeting.operations.slice(-4)).toEqual([
      "self:register",
      "remote:register",
      "self:deregister",
      "remote:deregister",
    ]);
  });

  it("retains a failed session so leave can be retried", async () => {
    const meeting = new FakeMeeting();
    const provider = providerFor(meeting);
    await provider.join(joinInput("speaker"));
    meeting.leaveError = new Error("provider leave failed");

    await expect(provider.leave()).rejects.toThrow("provider leave failed");
    expect(provider.participants()).toHaveLength(2);

    await provider.leave();
    expect(provider.participants()).toEqual([]);
    expect(meeting.operations.filter((operation) => operation === "leave")).toHaveLength(2);
  });
});

function providerFor(meeting: FakeMeeting, tokens: string[] = []) {
  const createMeeting: RealtimeKitMeetingFactory = async (token) => {
    tokens.push(token);
    return meeting;
  };
  return new RealtimeKitMediaProvider({ createMeeting });
}

function joinInput(role: JoinMediaRoomInput["role"]): JoinMediaRoomInput {
  return {
    roomId: "room-1",
    userId: "user-1",
    role,
    token: "role-bound-token",
    initialMicrophoneEnabled: false,
    initialCameraEnabled: false,
  };
}
