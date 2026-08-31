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
  it("sends only the authoritative sequence to the backend", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.body).toBe(JSON.stringify({ authoritySequence: 42 }));
      return new Response(
        JSON.stringify({
          ...request,
          token: "grant-token",
          expiresAt: Date.now() + 30_000,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const authorization = await requestRoomMediaJoinAuthorization(request);

    expect(authorization.role).toBe("speaker");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rooms/room-1/media-authorization",
      expect.objectContaining({ method: "POST", cache: "no-store" })
    );
  });

  it("rejects a server grant that does not match Room Brain authority", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ...request,
            role: "viewer",
            token: "grant-token",
            expiresAt: Date.now() + 30_000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(requestRoomMediaJoinAuthorization(request)).rejects.toThrow(
      /does not match current Room Brain authority/
    );
  });

  it("surfaces resync failures without returning a grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: "Room state changed. Resync before publishing media." }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(requestRoomMediaJoinAuthorization(request)).rejects.toThrow(
      /Resync before publishing media/
    );
  });
});
