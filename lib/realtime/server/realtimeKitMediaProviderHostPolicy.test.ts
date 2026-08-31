import { describe, expect, it, vi } from "vitest";
import { RealtimeKitMediaProviderAdapter } from "./realtimeKitMediaProviderAdapter";

const baseConfig = {
  organizationId: "org-1",
  apiKey: "secret-key",
  subscribeOnlyPreset: "ponder-viewer",
  publisherPreset: "ponder-speaker",
  resolveMeetingId: async () => "meeting-1",
};

describe("RealtimeKit API host policy", () => {
  it("rejects an arbitrary HTTPS API host before any provider request can carry credentials", () => {
    expect(
      () =>
        new RealtimeKitMediaProviderAdapter({
          ...baseConfig,
          apiBase: "https://attacker.example/v2",
          fetchImpl: vi.fn<typeof fetch>(),
        }),
    ).toThrow("API host is not trusted");
  });

  it("permits an explicitly allowlisted custom host for controlled deployments", () => {
    expect(
      () =>
        new RealtimeKitMediaProviderAdapter({
          ...baseConfig,
          apiBase: "https://realtime.internal.example/v2",
          allowedApiHosts: ["realtime.internal.example"],
          fetchImpl: vi.fn<typeof fetch>(),
        }),
    ).not.toThrow();
  });

  it("rejects API URLs containing embedded credentials", () => {
    expect(
      () =>
        new RealtimeKitMediaProviderAdapter({
          ...baseConfig,
          apiBase: "https://user:pass@api.dyte.io/v2",
          fetchImpl: vi.fn<typeof fetch>(),
        }),
    ).toThrow("must not contain credentials");
  });
});
