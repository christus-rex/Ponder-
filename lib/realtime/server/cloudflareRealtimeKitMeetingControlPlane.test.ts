import { describe, expect, it, vi } from "vitest";
import { CloudflareRealtimeKitMeetingControlPlane } from "./cloudflareRealtimeKitMeetingControlPlane";

function controlPlane(fetchImpl: typeof fetch) {
  return new CloudflareRealtimeKitMeetingControlPlane({
    accountId: "account-1",
    appId: "app-1",
    apiToken: "server-token",
    fetchImpl,
  });
}

describe("CloudflareRealtimeKitMeetingControlPlane", () => {
  it("creates meetings through the account/app-scoped Cloudflare API without forwarding user room titles", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: "meeting-123" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      controlPlane(fetchImpl).createMeeting({
        roomId: "room-123",
        title: "User supplied sensitive title",
      }),
    ).resolves.toEqual({ meetingId: "meeting-123" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account-1/realtime/kit/app-1/meetings",
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer server-token",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      title: "Ponder+ room room-123",
    });
  });

  it("sets meetings inactive through the same trusted control plane", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: "meeting-123" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await controlPlane(fetchImpl).setMeetingStatus("meeting-123", "INACTIVE");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account-1/realtime/kit/app-1/meetings/meeting-123",
    );
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ status: "INACTIVE" });
  });

  it("fails closed when meeting creation returns no provider meeting ID", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      controlPlane(fetchImpl).createMeeting({
        roomId: "room-123",
        title: "Room title",
      }),
    ).rejects.toThrow("meeting creation failed");
  });

  it("rejects arbitrary provider hosts before credentials can be sent", () => {
    expect(
      () =>
        new CloudflareRealtimeKitMeetingControlPlane({
          accountId: "account-1",
          appId: "app-1",
          apiToken: "server-token",
          apiBase: "https://attacker.example/client/v4",
          fetchImpl: vi.fn<typeof fetch>(),
        }),
    ).toThrow("API host is not trusted");
  });

  it("allows an explicitly allowlisted controlled API host", () => {
    expect(
      () =>
        new CloudflareRealtimeKitMeetingControlPlane({
          accountId: "account-1",
          appId: "app-1",
          apiToken: "server-token",
          apiBase: "https://realtime.internal.example/client/v4",
          allowedApiHosts: ["realtime.internal.example"],
          fetchImpl: vi.fn<typeof fetch>(),
        }),
    ).not.toThrow();
  });
});
