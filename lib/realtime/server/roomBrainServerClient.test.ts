import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestAuthoritativeMediaGrant,
  requestAuthoritativeSpeakerDemotion,
  RoomBrainServerRequestError,
} from "./roomBrainServerClient";

afterEach(() => {
  vi.unstubAllEnvs();
});

const secret = "s".repeat(32);

describe("requestAuthoritativeMediaGrant", () => {
  it("revalidates the exact authority sequence against the allowlisted Room Brain host", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        roomId: "room-1",
        userId: "user-1",
        role: "speaker",
        authoritySequence: 12,
        token: "signed-media-capability",
        expiresAt: 1_800_000_000_000,
      }),
    );

    const grant = await requestAuthoritativeMediaGrant(
      {
        websocketUrl: "ws://localhost:8787",
        roomBrainSecret: secret,
        fetchImpl,
      },
      {
        roomId: "room-1",
        userId: "user-1",
        baselineRole: "viewer",
        authoritySequence: 12,
      },
    );

    expect(grant.role).toBe("speaker");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(
      "http://localhost:8787/rooms/room-1/media-grant",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      authoritySequence: 12,
    });
    expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Bearer /);
  });

  it("preserves a Room Brain sequence mismatch as 409", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("resync", { status: 409 }),
    );

    await expect(
      requestAuthoritativeMediaGrant(
        {
          websocketUrl: "ws://localhost:8787",
          roomBrainSecret: secret,
          fetchImpl,
        },
        {
          roomId: "room-1",
          userId: "user-1",
          baselineRole: "viewer",
          authoritySequence: 11,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("requestAuthoritativeSpeakerDemotion", () => {
  it("sends a backend-only sequence-guarded demotion command", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        sequence: 21,
        targetUserId: "speaker-1",
        role: "viewer",
        duplicate: false,
      }),
    );

    const result = await requestAuthoritativeSpeakerDemotion(
      {
        websocketUrl: "ws://localhost:8787",
        roomBrainSecret: secret,
        fetchImpl,
      },
      {
        roomId: "room-1",
        actorUserId: "host-1",
        actorRole: "host",
        targetUserId: "speaker-1",
        expectedSequence: 20,
        commandId: "srv_demote_test_0001",
      },
    );

    expect(result).toEqual({
      sequence: 21,
      targetUserId: "speaker-1",
      role: "viewer",
      duplicate: false,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(
      "http://localhost:8787/rooms/room-1/moderation-action",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      commandId: "srv_demote_test_0001",
      expectedSequence: 20,
      action: "demote_speaker",
      targetUserId: "speaker-1",
    });
  });
});
