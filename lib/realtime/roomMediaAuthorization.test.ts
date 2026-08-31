import { afterEach, describe, expect, it, vi } from "vitest";
import { requestRoomMediaJoinAuthorization } from "./roomMediaAuthorization";

const request = {
  roomId: "room-1",
  userId: "user-1",
  role: "speaker" as const,
  authoritySequence: 42,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestRoomMediaJoinAuthorization", () => {
  it("exchanges a sequence-bound Room Brain capability for a RealtimeKit participant token", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });

      if (url.endsWith("/media-authorization")) {
        return Response.json({
          ...request,
          token: "signed-room-brain-capability",
          expiresAt: Date.now() + 30_000,
        });
      }

      return Response.json({
        provider: "realtimekit",
        participantToken: "provider-participant-token",
        expiresAt: 1_900_000_000,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const authorization = await requestRoomMediaJoinAuthorization(request);

    expect(calls).toEqual([
      {
        url: "/api/rooms/room-1/media-authorization",
        body: { authoritySequence: 42 },
      },
      {
        url: "/api/rooms/room-1/media-session",
        body: {
          capabilityToken: "signed-room-brain-capability",
          authoritySequence: 42,
        },
      },
    ]);
    expect(authorization).toEqual({
      ...request,
      token: "provider-participant-token",
      expiresAt: 1_900_000_000_000,
    });
  });

  it("never sends the browser-supplied role to either server endpoint", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return String(input).endsWith("/media-authorization")
          ? Response.json({
              ...request,
              token: "capability-token",
              expiresAt: Date.now() + 30_000,
            })
          : Response.json({
              provider: "realtimekit",
              participantToken: "provider-token",
              expiresAt: 1_900_000_000,
            });
      }),
    );

    await requestRoomMediaJoinAuthorization(request);

    expect(JSON.stringify(bodies)).not.toContain('"role"');
    expect(JSON.stringify(bodies)).not.toContain('"preset"');
  });

  it("rejects a server capability that does not match Room Brain authority", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...request,
          role: "viewer",
          token: "grant-token",
          expiresAt: Date.now() + 30_000,
        }),
      ),
    );

    await expect(requestRoomMediaJoinAuthorization(request)).rejects.toThrow(
      /does not match current Room Brain authority/,
    );
  });

  it("does not contact the provider exchange after a Room Brain resync failure", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: "Room state changed. Resync before publishing media." }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestRoomMediaJoinAuthorization(request)).rejects.toThrow(
      /Resync before publishing media/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces provider-session failures without returning a provider token", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return Response.json({
            ...request,
            token: "capability-token",
            expiresAt: Date.now() + 30_000,
          });
        }
        return new Response(
          JSON.stringify({ error: "Room state changed during media setup. Resync required." }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await expect(requestRoomMediaJoinAuthorization(request)).rejects.toThrow(
      /Resync required/,
    );
  });
});
