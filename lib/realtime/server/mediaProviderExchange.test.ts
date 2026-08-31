import { describe, expect, it } from "vitest";
import {
  createMediaSessionToken,
  type MediaSessionTokenPayload,
} from "../../../packages/domain/src/index";
import {
  exchangeTrustedMediaCapability,
  verifyTrustedMediaCapability,
  type TrustedMediaProviderAdapter,
  type VerifiedProviderExchangeContext,
} from "./mediaProviderExchange";

const secret = "x".repeat(32);
const now = 1_800_000_000;

async function capability(
  overrides: Partial<MediaSessionTokenPayload> = {}
): Promise<string> {
  return createMediaSessionToken(
    {
      v: 1,
      kind: "ponder-media-session",
      roomId: "room-1",
      userId: "user-1",
      role: "viewer",
      authoritySequence: 42,
      exp: now + 30,
      ...overrides,
    },
    secret
  );
}

function adapter(
  capture: VerifiedProviderExchangeContext[] = [],
  expiresAt = now + 20
): TrustedMediaProviderAdapter {
  return {
    async exchange(context) {
      capture.push(context);
      return {
        provider: "test-sfu",
        providerParticipantId: "participant-test",
        participantToken: "provider-credential",
        expiresAt,
      };
    },
  };
}

describe("exchangeTrustedMediaCapability", () => {
  it("derives subscribe-only permissions for viewers", async () => {
    const seen: VerifiedProviderExchangeContext[] = [];

    const result = await exchangeTrustedMediaCapability(
      {
        capabilityToken: await capability(),
        expectedRoomId: "room-1",
        expectedUserId: "user-1",
        expectedAuthoritySequence: 42,
      },
      adapter(seen),
      secret,
      now
    );

    expect(result.provider).toBe("test-sfu");
    expect(result.providerParticipantId).toBe("participant-test");
    expect(result.verifiedRole).toBe("viewer");
    expect(result.authoritySequence).toBe(42);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.role).toBe("viewer");
    expect(seen[0]?.permissions).toEqual({
      canPublishAudio: false,
      canPublishVideo: false,
    });
  });

  it("derives publish permission only from a verified promoted role", async () => {
    const seen: VerifiedProviderExchangeContext[] = [];

    await exchangeTrustedMediaCapability(
      {
        capabilityToken: await capability({ role: "speaker" }),
        expectedRoomId: "room-1",
        expectedUserId: "user-1",
        expectedAuthoritySequence: 42,
      },
      adapter(seen),
      secret,
      now
    );

    expect(seen[0]?.permissions).toEqual({
      canPublishAudio: true,
      canPublishVideo: true,
    });
  });

  it("rejects mismatched room, user, and authority bindings before provider exchange", async () => {
    const seen: VerifiedProviderExchangeContext[] = [];
    const token = await capability();

    await expect(
      exchangeTrustedMediaCapability(
        {
          capabilityToken: token,
          expectedRoomId: "room-other",
          expectedUserId: "user-1",
          expectedAuthoritySequence: 42,
        },
        adapter(seen),
        secret,
        now
      )
    ).rejects.toThrow("room binding mismatch");

    await expect(
      exchangeTrustedMediaCapability(
        {
          capabilityToken: token,
          expectedRoomId: "room-1",
          expectedUserId: "user-other",
          expectedAuthoritySequence: 42,
        },
        adapter(seen),
        secret,
        now
      )
    ).rejects.toThrow("user binding mismatch");

    await expect(
      exchangeTrustedMediaCapability(
        {
          capabilityToken: token,
          expectedRoomId: "room-1",
          expectedUserId: "user-1",
          expectedAuthoritySequence: 43,
        },
        adapter(seen),
        secret,
        now
      )
    ).rejects.toThrow("authority sequence mismatch");

    expect(seen).toHaveLength(0);
  });

  it("rejects provider credentials that outlive the Room Brain capability", async () => {
    await expect(
      exchangeTrustedMediaCapability(
        {
          capabilityToken: await capability(),
          expectedRoomId: "room-1",
          expectedUserId: "user-1",
          expectedAuthoritySequence: 42,
        },
        adapter([], now + 31),
        secret,
        now
      )
    ).rejects.toThrow("outlives Room Brain authority");
  });
});


describe("verifyTrustedMediaCapability", () => {
  it("verifies caller bindings without touching the provider", async () => {
    const verified = await verifyTrustedMediaCapability(
      {
        capabilityToken: await capability({ role: "speaker" }),
        expectedRoomId: "room-1",
        expectedUserId: "user-1",
        expectedAuthoritySequence: 42,
      },
      secret,
      now,
    );

    expect(verified.role).toBe("speaker");
    expect(verified.authoritySequence).toBe(42);
    expect(verified.permissions).toEqual({
      canPublishAudio: true,
      canPublishVideo: true,
    });
  });
});
