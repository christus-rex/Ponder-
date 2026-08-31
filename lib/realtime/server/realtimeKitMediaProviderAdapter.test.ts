import { describe, expect, it, vi } from "vitest";
import type { VerifiedProviderExchangeContext } from "./mediaProviderExchange";
import { RealtimeKitMediaProviderAdapter } from "./realtimeKitMediaProviderAdapter";

function context(
  overrides: Partial<VerifiedProviderExchangeContext> = {},
): VerifiedProviderExchangeContext {
  return {
    roomId: "room-1",
    userId: "user-1",
    role: "viewer",
    authoritySequence: 7,
    expiresAt: 1_800_000_030,
    permissions: {
      canPublishAudio: false,
      canPublishVideo: false,
    },
    ...overrides,
  };
}

function jwt(exp: number): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8")
      .toString("base64url");
  return `${part({ alg: "none" })}.${part({ exp })}.sig`;
}

function adapter(fetchImpl: typeof fetch) {
  return new RealtimeKitMediaProviderAdapter({
    organizationId: "org-1",
    apiKey: "secret-key",
    subscribeOnlyPreset: "ponder-viewer",
    publisherPreset: "ponder-speaker",
    resolveMeetingId: async (roomId) => `meeting-for-${roomId}`,
    fetchImpl,
  });
}

describe("RealtimeKitMediaProviderAdapter", () => {
  it("uses the server-controlled subscribe-only preset for viewers", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: "participant-1", token: jwt(1_800_000_020) },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const credentials = await adapter(fetchImpl).exchange(context());

    expect(credentials.provider).toBe("realtimekit");
    expect(credentials.expiresAt).toBe(1_800_000_020);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/meetings/meeting-for-room-1/participants");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      preset_name: "ponder-viewer",
      client_specific_id: "user-1",
    });
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("org-1:secret-key").toString("base64")}`,
    );
  });

  it("uses the publisher preset only for verified publish-capable contexts", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: "participant-2", token: jwt(1_800_000_020) },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await adapter(fetchImpl).exchange(
      context({
        role: "speaker",
        permissions: { canPublishAudio: true, canPublishVideo: true },
      }),
    );

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(String(init?.body)).preset_name).toBe("ponder-speaker");
  });

  it("rejects mixed media permissions before contacting RealtimeKit", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      adapter(fetchImpl).exchange(
        context({
          permissions: { canPublishAudio: true, canPublishVideo: false },
        }),
      ),
    ).rejects.toThrow("cannot represent mixed media permissions");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("deletes the created participant and rejects a provider token that outlives authority", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: "participant-long", token: jwt(1_800_100_000) },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(adapter(fetchImpl).exchange(context())).rejects.toThrow(
      "outlives Room Brain authority",
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [deleteUrl, deleteInit] = fetchImpl.mock.calls[1]!;
    expect(String(deleteUrl)).toContain(
      "/meetings/meeting-for-room-1/participants/participant-long",
    );
    expect(deleteInit?.method).toBe("DELETE");
  });

  it("fails closed on malformed provider responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: "participant-3" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(adapter(fetchImpl).exchange(context())).rejects.toThrow(
      "missing credentials",
    );
  });

  it("requires HTTPS for a custom provider API base", () => {
    expect(
      () =>
        new RealtimeKitMediaProviderAdapter({
          organizationId: "org-1",
          apiKey: "key",
          subscribeOnlyPreset: "viewer",
          publisherPreset: "speaker",
          resolveMeetingId: async () => "meeting-1",
          apiBase: "http://provider.internal",
        }),
    ).toThrow("must use HTTPS");
  });
});
