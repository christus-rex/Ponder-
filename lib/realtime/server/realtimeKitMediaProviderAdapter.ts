import type {
  ProviderSessionCredentials,
  TrustedMediaProviderAdapter,
  VerifiedProviderExchangeContext,
} from "./mediaProviderExchange";

const DEFAULT_REALTIMEKIT_API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_ALLOWED_REALTIMEKIT_API_HOSTS = ["api.cloudflare.com"] as const;

export interface RealtimeKitMediaProviderAdapterConfig {
  accountId: string;
  appId: string;
  apiToken: string;
  subscribeOnlyPreset: string;
  publisherPreset: string;
  resolveMeetingId(roomId: string): Promise<string>;
  apiBase?: string;
  allowedApiHosts?: readonly string[];
  fetchImpl?: typeof fetch;
}

type RealtimeKitParticipantResponse = {
  success: boolean;
  data?: {
    id?: string;
    token?: string;
  };
};

/**
 * Server-only Cloudflare RealtimeKit REST adapter.
 *
 * Provider permission is represented by server-controlled presets. The adapter
 * never accepts a preset name from the browser and refuses mixed publish
 * permissions because they cannot be represented by the two-preset contract.
 * Provider credentials may only be sent to explicitly trusted HTTPS hosts.
 */
export class RealtimeKitMediaProviderAdapter
  implements TrustedMediaProviderAdapter
{
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: RealtimeKitMediaProviderAdapterConfig) {
    this.apiBase = normalizeApiBase(
      config.apiBase ?? DEFAULT_REALTIMEKIT_API_BASE,
      config.allowedApiHosts ?? DEFAULT_ALLOWED_REALTIMEKIT_API_HOSTS,
    );
    this.fetchImpl = config.fetchImpl ?? fetch;
    validateConfig(config);
  }

  async exchange(
    context: VerifiedProviderExchangeContext,
  ): Promise<ProviderSessionCredentials> {
    const meetingId = await this.config.resolveMeetingId(context.roomId);
    if (!meetingId.trim()) {
      throw new Error("RealtimeKit meeting mapping is missing");
    }

    const presetName = selectPreset(context, this.config);
    const response = await this.fetchImpl(
      this.meetingParticipantsUrl(meetingId),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: context.userId,
          preset_name: presetName,
          custom_participant_id: context.userId,
        }),
        cache: "no-store",
      },
    );

    const payload = (await readJson(response)) as RealtimeKitParticipantResponse;
    if (!response.ok || payload.success !== true) {
      throw new Error(`RealtimeKit participant exchange failed (${response.status})`);
    }

    const participantId = payload.data?.id?.trim();
    const token = payload.data?.token?.trim();
    if (!participantId || !token) {
      if (participantId) await this.deleteParticipant(meetingId, participantId);
      throw new Error("RealtimeKit participant response is missing credentials");
    }

    let expiresAt: number;
    try {
      expiresAt = readJwtExpiry(token);
      if (expiresAt > context.expiresAt) {
        throw new Error("RealtimeKit participant token outlives Room Brain authority");
      }
    } catch (error) {
      await this.deleteParticipant(meetingId, participantId);
      throw error;
    }

    return {
      provider: "realtimekit",
      participantToken: token,
      expiresAt,
    };
  }

  private meetingParticipantsUrl(meetingId: string): string {
    return [
      this.apiBase,
      "accounts",
      encodeURIComponent(this.config.accountId),
      "realtime",
      "kit",
      encodeURIComponent(this.config.appId),
      "meetings",
      encodeURIComponent(meetingId),
      "participants",
    ].join("/");
  }

  private async deleteParticipant(
    meetingId: string,
    participantId: string,
  ): Promise<void> {
    try {
      await this.fetchImpl(
        `${this.meetingParticipantsUrl(meetingId)}/${encodeURIComponent(
          participantId,
        )}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );
    } catch {
      // The provider credential is never returned after validation failure.
      // Cleanup is best-effort because a network failure must not convert an
      // unsafe credential into an accepted one.
    }
  }
}

function selectPreset(
  context: VerifiedProviderExchangeContext,
  config: RealtimeKitMediaProviderAdapterConfig,
): string {
  const { canPublishAudio, canPublishVideo } = context.permissions;
  if (canPublishAudio !== canPublishVideo) {
    throw new Error("RealtimeKit preset contract cannot represent mixed media permissions");
  }
  return canPublishAudio ? config.publisherPreset : config.subscribeOnlyPreset;
}

function readJwtExpiry(token: string): number {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("RealtimeKit participant token is not a JWT");
  }

  let payload: unknown;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    throw new Error("RealtimeKit participant token payload is invalid");
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("exp" in payload) ||
    !Number.isSafeInteger((payload as { exp?: unknown }).exp)
  ) {
    throw new Error("RealtimeKit participant token expiry is invalid");
  }

  return (payload as { exp: number }).exp;
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

  const trustedHosts = new Set(
    allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean),
  );
  if (trustedHosts.size === 0 || !trustedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("RealtimeKit API host is not trusted");
  }
  if (url.username || url.password) {
    throw new Error("RealtimeKit API base must not contain credentials");
  }

  return url.toString().replace(/\/$/, "");
}

function validateConfig(config: RealtimeKitMediaProviderAdapterConfig): void {
  if (!config.accountId.trim()) throw new Error("Cloudflare account ID is required");
  if (!config.appId.trim()) throw new Error("RealtimeKit app ID is required");
  if (!config.apiToken.trim()) throw new Error("Cloudflare Realtime API token is required");
  if (!config.subscribeOnlyPreset.trim()) {
    throw new Error("RealtimeKit subscribe-only preset is required");
  }
  if (!config.publisherPreset.trim()) {
    throw new Error("RealtimeKit publisher preset is required");
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("RealtimeKit returned an invalid JSON response");
  }
}
