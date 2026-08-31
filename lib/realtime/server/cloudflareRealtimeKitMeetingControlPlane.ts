import type {
  MediaProviderMeetingStatus,
  RealtimeKitMeetingControlPlane,
} from "./roomMediaProvisioning";

const DEFAULT_REALTIMEKIT_API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_ALLOWED_REALTIMEKIT_API_HOSTS = ["api.cloudflare.com"] as const;

export interface CloudflareRealtimeKitMeetingControlPlaneConfig {
  accountId: string;
  appId: string;
  apiToken: string;
  apiBase?: string;
  allowedApiHosts?: readonly string[];
  fetchImpl?: typeof fetch;
}

type MeetingResponse = {
  success: boolean;
  data?: {
    id?: string;
  };
};

/**
 * Server-only Cloudflare RealtimeKit meeting management adapter.
 *
 * Ponder room titles are intentionally not forwarded to the provider. The
 * provider receives only a pseudonymous room identifier for operational
 * correlation, keeping user-generated room text inside Ponder.
 */
export class CloudflareRealtimeKitMeetingControlPlane
  implements RealtimeKitMeetingControlPlane
{
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: CloudflareRealtimeKitMeetingControlPlaneConfig,
  ) {
    validateConfig(config);
    this.apiBase = normalizeApiBase(
      config.apiBase ?? DEFAULT_REALTIMEKIT_API_BASE,
      config.allowedApiHosts ?? DEFAULT_ALLOWED_REALTIMEKIT_API_HOSTS,
    );
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async createMeeting(input: {
    roomId: string;
    title: string;
  }): Promise<{ meetingId: string }> {
    const roomId = input.roomId.trim();
    if (!roomId) throw new Error("Room ID is required for RealtimeKit provisioning");

    const response = await this.fetchImpl(this.meetingsUrl(), {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        title: `Ponder+ room ${roomId}`,
      }),
      cache: "no-store",
    });

    const payload = (await readJson(response)) as MeetingResponse;
    const meetingId = payload.data?.id?.trim();
    if (!response.ok || payload.success !== true || !meetingId) {
      throw new Error(`RealtimeKit meeting creation failed (${response.status})`);
    }

    return { meetingId };
  }

  async setMeetingStatus(
    meetingId: string,
    status: MediaProviderMeetingStatus,
  ): Promise<void> {
    const normalizedMeetingId = meetingId.trim();
    if (!normalizedMeetingId) {
      throw new Error("RealtimeKit meeting ID is required");
    }

    const response = await this.fetchImpl(
      `${this.meetingsUrl()}/${encodeURIComponent(normalizedMeetingId)}`,
      {
        method: "PATCH",
        headers: this.jsonHeaders(),
        body: JSON.stringify({ status }),
        cache: "no-store",
      },
    );

    const payload = (await readJson(response)) as MeetingResponse;
    if (!response.ok || payload.success !== true) {
      throw new Error(`RealtimeKit meeting status update failed (${response.status})`);
    }
  }

  private meetingsUrl(): string {
    return [
      this.apiBase,
      "accounts",
      encodeURIComponent(this.config.accountId),
      "realtime",
      "kit",
      encodeURIComponent(this.config.appId),
      "meetings",
    ].join("/");
  }

  private jsonHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }
}

function validateConfig(config: CloudflareRealtimeKitMeetingControlPlaneConfig): void {
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

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("RealtimeKit returned an invalid JSON response");
  }
}
