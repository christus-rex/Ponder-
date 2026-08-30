import { describe, expect, it } from "vitest";
import { getRouteAccessRequirements } from "./routeAccess";

describe("Ponder+ route access", () => {
  it("requires authentication for the app entry splash boundary", () => {
    expect(getRouteAccessRequirements("/")).toEqual({
      needsAuthentication: true,
      needsFullAccess: false,
      isApiRequest: false,
    });
  });

  it("keeps auth and legal/safety routes public", () => {
    expect(getRouteAccessRequirements("/auth").needsAuthentication).toBe(false);
    expect(getRouteAccessRequirements("/terms").needsAuthentication).toBe(false);
    expect(getRouteAccessRequirements("/safety").needsAuthentication).toBe(false);
  });

  it("requires completed access for social rooms and their APIs", () => {
    expect(getRouteAccessRequirements("/rooms/lab").needsFullAccess).toBe(true);
    expect(
      getRouteAccessRequirements("/api/rooms/room-1/realtime-token"),
    ).toEqual({
      needsAuthentication: true,
      needsFullAccess: true,
      isApiRequest: true,
    });
  });
});
