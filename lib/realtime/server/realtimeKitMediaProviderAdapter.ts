import type {
  ProviderSessionCredentials,
  TrustedMediaProviderAdapter,
  VerifiedProviderExchangeContext,
} from "./mediaProviderExchange";

const DEFAULT_REALTIMEKIT_API_BASE = "https://api.dyte.io/v2";

export interface RealtimeKitMediaProviderAdapterConfig {
  organizationId: string;
  apiKey: string;
  subscribeOnlyPreset: string;
  publisherPreset: string;
  resolveMeetingId(roomId: string): Promise<string>;
  apiBase?: string;
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
 * Server-only RealtimeKit/Dyte REST adapter.
 *
 * Provider permission is represented by server-controlled presets. The adapter
 * never accepts a preset name from the browser and refuses mixed publish
 * permissions because they cannot be represented by the two-preset contract.
 */
export class RealtimeKitMediaProviderAdapter
  implements TrustedMediaProviderAdapter
{
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: RealtimeKitMediaProviderAdapterConfig) {
    this.apiBase = normalizeApiBase(config.apiBase ?? DEFAULT_REALTIMEKIT_API_BASE);
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
      `${this.apiBase}/meetings/${encodeURIComponent(meetingId)}/participants`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${encodeBasicAuth(
            this.config.organizationId,
            this.config.apiKey,
          )}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: context.userId,
          preset_name: presetName,
          client_specific_id: context.userId,
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

  private async deleteParticipant(
    meetingId: string,
    participantId: string,
  ): Promise<void> {
    try {
      await this.fetchImpl(
        `${this.apiBase}/meetings/${encodeURIComponent(
          meetingId,
        )}/participants/${encodeURIComponent(participantId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Basic ${encodeBasicAuth(
              this.config.organizationId,
              this.config.apiKey,
            )}`,
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

function encodeBasicAuth(organizationId: string, apiKey: string): string {
  return Buffer.from(`${organizationId}:${apiKey}`, "utf8").toString("base64");
}

function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(trimmed)) {
    throw new Error("RealtimeKit API base must use HTTPS");
  }
  return trimmed;
}

function validateConfig(config: RealtimeKitMediaProviderAdapterConfig): void {
  if (!config.organizationId.trim()) throw new Error("RealtimeKit organization ID is required");
  if (!config.apiKey.trim()) throw new Error("RealtimeKit API key is required");
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
