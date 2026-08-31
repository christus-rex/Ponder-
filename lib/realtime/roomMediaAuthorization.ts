import type {
  MediaJoinAuthorization,
  MediaJoinAuthorizationRequest,
  RequestMediaJoinAuthorization,
} from "../../packages/domain/src/index.ts";

type ProviderSessionResponse = {
  provider: "realtimekit";
  participantToken: string;
  expiresAt: number;
};

/**
 * Completes the two server-owned media authorization stages:
 * 1) Room Brain mints a short-lived capability bound to the live sequence/role.
 * 2) The trusted backend exchanges that capability for a provider participant.
 *
 * The browser never supplies a role, preset, provider meeting ID, or provider
 * credential. It only carries the opaque capability between same-origin routes.
 */
export const requestRoomMediaJoinAuthorization: RequestMediaJoinAuthorization = async (
  request,
) => {
  const capabilityResponse = await fetch(
    `/api/rooms/${encodeURIComponent(request.roomId)}/media-authorization`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ authoritySequence: request.authoritySequence }),
      cache: "no-store",
    },
  );

  const capabilityPayload = await readJson(
    capabilityResponse,
    "Media authorization service returned an invalid response.",
  );

  if (!capabilityResponse.ok) {
    throw new Error(
      readError(capabilityPayload) ?? "Unable to authorize the media session.",
    );
  }

  const capability = decodeCapability(capabilityPayload);
  assertMatchesRequest(capability, request);

  const sessionResponse = await fetch(
    `/api/rooms/${encodeURIComponent(request.roomId)}/media-session`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        capabilityToken: capability.token,
        authoritySequence: request.authoritySequence,
      }),
      cache: "no-store",
    },
  );

  const sessionPayload = await readJson(
    sessionResponse,
    "Media session service returned an invalid response.",
  );

  if (!sessionResponse.ok) {
    throw new Error(
      readError(sessionPayload) ?? "Unable to establish the media session.",
    );
  }

  const provider = decodeProviderSession(sessionPayload);

  return {
    roomId: request.roomId,
    userId: request.userId,
    role: request.role,
    authoritySequence: request.authoritySequence,
    token: provider.participantToken,
    // RealtimeKit JWT expiry is represented in epoch seconds server-side;
    // the coordinator compares against Date.now() milliseconds.
    expiresAt: provider.expiresAt * 1000,
  };
};

function decodeCapability(value: unknown): MediaJoinAuthorization {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Media authorization response must be an object.");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.roomId !== "string" ||
    typeof record.userId !== "string" ||
    !isMediaRole(record.role) ||
    !Number.isSafeInteger(record.authoritySequence) ||
    typeof record.token !== "string" ||
    !record.token.trim() ||
    typeof record.expiresAt !== "number" ||
    !Number.isFinite(record.expiresAt)
  ) {
    throw new Error("Media authorization response is malformed.");
  }

  return {
    roomId: record.roomId,
    userId: record.userId,
    role: record.role,
    authoritySequence: record.authoritySequence as number,
    token: record.token,
    expiresAt: record.expiresAt,
  };
}

function decodeProviderSession(value: unknown): ProviderSessionResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Media session response must be an object.");
  }

  const record = value as Record<string, unknown>;
  if (
    record.provider !== "realtimekit" ||
    typeof record.participantToken !== "string" ||
    !record.participantToken.trim() ||
    !Number.isSafeInteger(record.expiresAt) ||
    (record.expiresAt as number) <= 0
  ) {
    throw new Error("Media session response is malformed.");
  }

  return {
    provider: "realtimekit",
    participantToken: record.participantToken,
    expiresAt: record.expiresAt as number,
  };
}

function assertMatchesRequest(
  authorization: MediaJoinAuthorization,
  request: MediaJoinAuthorizationRequest,
): void {
  if (
    authorization.roomId !== request.roomId ||
    authorization.userId !== request.userId ||
    authorization.role !== request.role ||
    authorization.authoritySequence !== request.authoritySequence
  ) {
    throw new Error("Media authorization does not match current Room Brain authority.");
  }
}

async function readJson(response: Response, message: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(message);
  }
}

function readError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" && error.trim() ? error : null;
}

function isMediaRole(value: unknown): value is MediaJoinAuthorization["role"] {
  return (
    value === "host" ||
    value === "moderator" ||
    value === "speaker" ||
    value === "viewer"
  );
}
