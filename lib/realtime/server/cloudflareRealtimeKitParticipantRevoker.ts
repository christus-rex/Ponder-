import type { MediaProviderParticipantRevoker } from "./roomMediaProviderSession";

const DEFAULT_REALTIMEKIT_API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_ALLOWED_REALTIMEKIT_API_HOSTS = ["api.cloudflare.com"] as const;

export interface CloudflareRealtimeKitParticipantRevokerConfig {
  accountId: string;
  appId: string;
  apiToken: string;
  resolveMeetingId(roomId: string): Promise<string>;
  apiBase?: string;
  allowedApiHosts?: readonly string[];
  fetchImpl?: typeof fetch;
}

export class CloudflareRealtimeKitParticipantRevoker
  implements MediaProviderParticipantRevoker
{
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: CloudflareRealtimeKitParticipantRevokerConfig,
  ) {
    validateConfig(config);
    this.apiBase = normalizeApiBase(
      config.apiBase ?? DEFAULT_REALTIMEKIT_API_BASE,
      config.allowedApiHosts ?? DEFAULT_ALLOWED_REALTIMEKIT_API_HOSTS,
    );
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async revokeParticipant(
    roomId: string,
    providerParticipantId: string,
  ): Promise<void> {
    const meetingId = (await this.config.resolveMeetingId(roomId)).trim();
    const participantId = providerParticipantId.trim();
    if (!meetingId) throw new Error("RealtimeKit meeting mapping is missing");
    if (!participantId) throw new Error("RealtimeKit participant ID is required");

    const response = await this.fetchImpl(
      [
        this.apiBase,
        "accounts",
        encodeURIComponent(this.config.accountId),
        "realtime",
        "kit",
        encodeURIComponent(this.config.appId),
        "meetings",
        encodeURIComponent(meetingId),
        "participants",
        encodeURIComponent(participantId),
      ].join("/"),
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    // Revocation is idempotent. A participant already absent at the provider
    // satisfies the desired state and is safe to mark revoked locally.
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `RealtimeKit participant revocation failed (${response.status})`,
      );
    }
  }
}

function validateConfig(
  config: CloudflareRealtimeKitParticipantRevokerConfig,
): void {
  if (!config.accountId.trim()) throw new Error("Cloudflare account ID is required");
  if (!config.appId.trim()) throw new Error("RealtimeKit app ID is required");
  if (!config.apiToken.trim()) throw new Error("Cloudflare Realtime API token is required");
}

function normalizeApiBase(value: string, allowedHosts: readonly string[]): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("RealtimeKit API base is invalid");
  }
  if (url.protocol !== "https:") {
    throw new Error("RealtimeKit API base must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("RealtimeKit API base must not contain credentials");
  }

  const trustedHosts = new Set(
    allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean),
  );
  if (trustedHosts.size === 0 || !trustedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("RealtimeKit API host is not trusted");
  }

  return url.toString().replace(/\/$/, "");
}
