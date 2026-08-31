import { describe, expect, it, vi } from "vitest";
import { CloudflareRealtimeKitParticipantRevoker } from "./cloudflareRealtimeKitParticipantRevoker";

function revoker(fetchImpl: typeof fetch) {
  return new CloudflareRealtimeKitParticipantRevoker({
    accountId: "account-1",
    appId: "app-1",
    apiToken: "server-token",
    resolveMeetingId: async () => "meeting-1",
    fetchImpl,
  });
}

describe("CloudflareRealtimeKitParticipantRevoker", () => {
  it("deletes the exact participant through the trusted account/app-scoped API", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await revoker(fetchImpl).revokeParticipant("room-1", "participant-1");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account-1/realtime/kit/app-1/meetings/meeting-1/participants/participant-1",
    );
    expect(init?.method).toBe("DELETE");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer server-token",
    );
  });

  it("treats an already-absent participant as an idempotent successful revocation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    await expect(
      revoker(fetchImpl).revokeParticipant("room-1", "participant-1"),
    ).resolves.toBeUndefined();
  });

  it("fails closed on provider deletion errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    await expect(
      revoker(fetchImpl).revokeParticipant("room-1", "participant-1"),
    ).rejects.toThrow("revocation failed (503)");
  });

  it("rejects arbitrary HTTPS provider hosts before credentials can be sent", () => {
    expect(
      () =>
        new CloudflareRealtimeKitParticipantRevoker({
          accountId: "account-1",
          appId: "app-1",
          apiToken: "server-token",
          resolveMeetingId: async () => "meeting-1",
          apiBase: "https://attacker.example/client/v4",
          fetchImpl: vi.fn<typeof fetch>(),
        }),
    ).toThrow("API host is not trusted");
  });
});
