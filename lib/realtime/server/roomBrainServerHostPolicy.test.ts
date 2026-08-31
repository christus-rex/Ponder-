import { afterEach, describe, expect, it, vi } from "vitest";
import { roomBrainMediaGrantUrl } from "./roomBrainServerHostPolicy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("roomBrainMediaGrantUrl", () => {
  it("requires wss and an explicit allowlist in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() =>
      roomBrainMediaGrantUrl("ws://room-brain.example/socket", "room-1", [
        "room-brain.example",
      ]),
    ).toThrow("wss");

    expect(() =>
      roomBrainMediaGrantUrl("wss://evil.example/socket", "room-1", [
        "room-brain.example",
      ]),
    ).toThrow("allowlisted");
  });

  it("converts an allowlisted wss endpoint to https without forwarding URL credentials", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(
      roomBrainMediaGrantUrl(
        "wss://user:pass@room-brain.example/socket?secret=1#fragment",
        "room/one",
        ["ROOM-BRAIN.EXAMPLE"],
      ),
    ).toBe("https://room-brain.example/socket/rooms/room%2Fone/media-grant");
  });

  it("permits local ws development without weakening production policy", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(roomBrainMediaGrantUrl("ws://localhost:8787", "room-1")).toBe(
      "http://localhost:8787/rooms/room-1/media-grant",
    );
  });
});
