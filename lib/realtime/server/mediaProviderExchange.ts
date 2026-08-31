import {
  verifyMediaSessionToken,
  type MediaRole,
  type MediaSessionTokenPayload,
} from "../../../packages/domain/src/index";

export interface ProviderMediaPermissions {
  canPublishAudio: boolean;
  canPublishVideo: boolean;
}

export interface TrustedProviderExchangeInput {
  capabilityToken: string;
  expectedRoomId: string;
  expectedUserId: string;
  expectedAuthoritySequence: number;
}

export interface VerifiedProviderExchangeContext {
  roomId: string;
  userId: string;
  role: MediaRole;
  authoritySequence: number;
  expiresAt: number;
  permissions: ProviderMediaPermissions;
}

export interface ProviderSessionCredentials {
  provider: string;
  providerParticipantId: string;
  participantToken: string;
  expiresAt: number;
}

export interface TrustedProviderExchangeResult extends ProviderSessionCredentials {
  verifiedRole: MediaRole;
  authoritySequence: number;
}

export interface TrustedMediaProviderAdapter {
  exchange(
    context: VerifiedProviderExchangeContext
  ): Promise<ProviderSessionCredentials>;
}

/**
 * Server-only trust boundary between Room Brain media capabilities and an SFU.
 *
 * The caller supplies only expected bindings that were established by the
 * authenticated backend. Role and media permissions are derived exclusively
 * from the signed capability after verification; an adapter never receives
 * browser-supplied publish privileges.
 */
export async function verifyTrustedMediaCapability(
  input: TrustedProviderExchangeInput,
  mediaSessionSecret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifiedProviderExchangeContext> {
  validateExpectedSequence(input.expectedAuthoritySequence);

  const payload = await verifyMediaSessionToken(
    input.capabilityToken,
    mediaSessionSecret,
    nowEpochSeconds,
  );
  assertExpectedBindings(payload, input);

  return {
    roomId: payload.roomId,
    userId: payload.userId,
    role: payload.role,
    authoritySequence: payload.authoritySequence,
    expiresAt: payload.exp,
    permissions: permissionsForRole(payload.role),
  };
}

export async function exchangeTrustedMediaCapability(
  input: TrustedProviderExchangeInput,
  adapter: TrustedMediaProviderAdapter,
  mediaSessionSecret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000)
): Promise<TrustedProviderExchangeResult> {
  const verified = await verifyTrustedMediaCapability(
    input,
    mediaSessionSecret,
    nowEpochSeconds,
  );

  const credentials = await adapter.exchange(verified);

  validateProviderCredentials(credentials, nowEpochSeconds, verified.expiresAt);
  return {
    ...credentials,
    verifiedRole: verified.role,
    authoritySequence: verified.authoritySequence,
  };
}

function assertExpectedBindings(
  payload: MediaSessionTokenPayload,
  input: TrustedProviderExchangeInput
): void {
  if (payload.roomId !== input.expectedRoomId) {
    throw new Error("Media capability room binding mismatch");
  }
  if (payload.userId !== input.expectedUserId) {
    throw new Error("Media capability user binding mismatch");
  }
  if (payload.authoritySequence !== input.expectedAuthoritySequence) {
    throw new Error("Media capability authority sequence mismatch");
  }
}

function permissionsForRole(role: MediaRole): ProviderMediaPermissions {
  const mayPublish = role === "host" || role === "moderator" || role === "speaker";
  return {
    canPublishAudio: mayPublish,
    canPublishVideo: mayPublish,
  };
}

function validateExpectedSequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("Invalid expected media authority sequence");
  }
}

function validateProviderCredentials(
  credentials: ProviderSessionCredentials,
  nowEpochSeconds: number,
  capabilityExpiry: number
): void {
  if (!credentials.provider.trim()) {
    throw new Error("Provider session is missing provider identity");
  }
  if (
    !credentials.providerParticipantId.trim() ||
    credentials.providerParticipantId.trim().length > 200
  ) {
    throw new Error("Provider session is missing participant revocation handle");
  }
  if (!credentials.participantToken.trim()) {
    throw new Error("Provider session is missing participant credential");
  }
  if (!Number.isSafeInteger(credentials.expiresAt)) {
    throw new Error("Provider session expiry is invalid");
  }
  if (credentials.expiresAt <= nowEpochSeconds) {
    throw new Error("Provider session credential is already expired");
  }
  if (credentials.expiresAt > capabilityExpiry) {
    throw new Error("Provider session credential outlives Room Brain authority");
  }
}
