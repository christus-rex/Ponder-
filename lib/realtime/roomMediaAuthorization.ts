import type {
  MediaJoinAuthorization,
  MediaJoinAuthorizationRequest,
  RequestMediaJoinAuthorization,
} from "../../packages/domain/src/index.ts";

export const requestRoomMediaJoinAuthorization: RequestMediaJoinAuthorization = async (
  request
) => {
  const response = await fetch(
    `/api/rooms/${encodeURIComponent(request.roomId)}/media-authorization`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ authoritySequence: request.authoritySequence }),
      cache: "no-store",
    }
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Media authorization service returned an invalid response.");
  }

  if (!response.ok) {
    const error = readError(payload);
    throw new Error(error ?? "Unable to authorize the media session.");
  }

  const authorization = decodeAuthorization(payload);
  assertMatchesRequest(authorization, request);
  return authorization;
};

function decodeAuthorization(value: unknown): MediaJoinAuthorization {
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

function assertMatchesRequest(
  authorization: MediaJoinAuthorization,
  request: MediaJoinAuthorizationRequest
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
