import { randomUUID } from "node:crypto";
import {
  createRoomBrainToken,
  type MediaJoinAuthorization,
  type RoomBrainTokenRole,
} from "../../../packages/domain/src/index";
import {
  roomBrainMediaGrantUrl,
  roomBrainModerationActionUrl,
} from "./roomBrainServerHostPolicy";

export class RoomBrainServerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface RoomBrainServerClientConfig {
  websocketUrl: string;
  roomBrainSecret: string;
  allowedHosts?: readonly string[];
  fetchImpl?: typeof fetch;
}

export async function requestAuthoritativeMediaGrant(
  config: RoomBrainServerClientConfig,
  input: {
    roomId: string;
    userId: string;
    baselineRole: RoomBrainTokenRole;
    authoritySequence: number;
  },
): Promise<MediaJoinAuthorization> {
  validateConfig(config);
  if (!Number.isSafeInteger(input.authoritySequence) || input.authoritySequence < 0) {
    throw new Error("Invalid Room Brain authority sequence");
  }

  const token = await createServerRoomBrainToken(config, {
    roomId: input.roomId,
    userId: input.userId,
    role: input.baselineRole,
  });
  const url = roomBrainMediaGrantUrl(
    config.websocketUrl,
    input.roomId,
    config.allowedHosts ?? [],
  );
  const response = await (config.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authoritySequence: input.authoritySequence }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new RoomBrainServerRequestError(
      "Room Brain media authority revalidation failed",
      response.status,
    );
  }

  const value = await readJson(response);
  if (!isMediaJoinAuthorization(value)) {
    throw new RoomBrainServerRequestError(
      "Room Brain returned an invalid media grant",
      502,
    );
  }
  if (
    value.roomId !== input.roomId ||
    value.userId !== input.userId ||
    value.authoritySequence !== input.authoritySequence
  ) {
    throw new RoomBrainServerRequestError(
      "Room Brain media grant binding mismatch",
      502,
    );
  }
  return value;
}

export async function requestAuthoritativeSpeakerDemotion(
  config: RoomBrainServerClientConfig,
  input: {
    roomId: string;
    actorUserId: string;
    actorRole: "host" | "moderator";
    targetUserId: string;
    expectedSequence: number;
    commandId?: string;
  },
): Promise<{
  sequence: number;
  targetUserId: string;
  role: "viewer";
  duplicate: boolean;
}> {
  validateConfig(config);
  if (!Number.isSafeInteger(input.expectedSequence) || input.expectedSequence < 0) {
    throw new Error("Invalid Room Brain expected sequence");
  }
  if (!input.targetUserId.trim() || input.targetUserId.length > 128) {
    throw new Error("Invalid Room Brain demotion target");
  }

  const token = await createServerRoomBrainToken(config, {
    roomId: input.roomId,
    userId: input.actorUserId,
    role: input.actorRole,
  });
  const url = roomBrainModerationActionUrl(
    config.websocketUrl,
    input.roomId,
    config.allowedHosts ?? [],
  );
  const commandId =
    input.commandId ??
    `srv_demote_${randomUUID().replaceAll("-", "")}`;
  const response = await (config.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      commandId,
      expectedSequence: input.expectedSequence,
      action: "demote_speaker",
      targetUserId: input.targetUserId,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new RoomBrainServerRequestError(
      "Room Brain speaker demotion failed",
      response.status,
    );
  }

  const value = await readJson(response);
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new RoomBrainServerRequestError(
      "Room Brain returned an invalid demotion response",
      502,
    );
  }
  const record = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record.sequence) ||
    record.targetUserId !== input.targetUserId ||
    record.role !== "viewer" ||
    typeof record.duplicate !== "boolean"
  ) {
    throw new RoomBrainServerRequestError(
      "Room Brain returned an invalid demotion response",
      502,
    );
  }

  return {
    sequence: record.sequence as number,
    targetUserId: input.targetUserId,
    role: "viewer",
    duplicate: record.duplicate,
  };
}

export async function requestAuthoritativeParticipantEjection(
  config: RoomBrainServerClientConfig,
  input: {
    roomId: string;
    actorUserId: string;
    actorRole: "host" | "moderator";
    targetUserId: string;
    expectedSequence: number;
  },
): Promise<{
  sequence: number;
  targetUserId: string;
  ejected: true;
  duplicate: boolean;
}> {
  validateConfig(config);
  if (!Number.isSafeInteger(input.expectedSequence) || input.expectedSequence < 0) {
    throw new Error("Invalid Room Brain expected sequence");
  }
  if (!input.targetUserId.trim() || input.targetUserId.length > 128) {
    throw new Error("Invalid Room Brain ejection target");
  }
  if (input.targetUserId === input.actorUserId) {
    throw new Error("Room moderator cannot eject self");
  }

  const token = await createServerRoomBrainToken(config, {
    roomId: input.roomId,
    userId: input.actorUserId,
    role: input.actorRole,
  });
  const url = roomBrainModerationActionUrl(
    config.websocketUrl,
    input.roomId,
    config.allowedHosts ?? [],
  );

  let expectedSequence = input.expectedSequence;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await (config.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        commandId: `srv_eject_${randomUUID().replaceAll("-", "")}`,
        expectedSequence,
        action: "eject_participant",
        targetUserId: input.targetUserId,
      }),
      cache: "no-store",
    });

    if (response.status === 409 && attempt === 0) {
      const conflict = await readJson(response);
      const currentSequence = readSnapshotSequence(conflict);
      if (currentSequence !== null) {
        expectedSequence = currentSequence;
        continue;
      }
    }

    if (!response.ok) {
      throw new RoomBrainServerRequestError(
        "Room Brain participant ejection failed",
        response.status,
      );
    }

    const value = await readJson(response);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new RoomBrainServerRequestError(
        "Room Brain returned an invalid ejection response",
        502,
      );
    }
    const record = value as Record<string, unknown>;
    if (
      !Number.isSafeInteger(record.sequence) ||
      record.targetUserId !== input.targetUserId ||
      record.ejected !== true ||
      typeof record.duplicate !== "boolean"
    ) {
      throw new RoomBrainServerRequestError(
        "Room Brain returned an invalid ejection response",
        502,
      );
    }

    return {
      sequence: record.sequence as number,
      targetUserId: input.targetUserId,
      ejected: true,
      duplicate: record.duplicate,
    };
  }

  throw new RoomBrainServerRequestError(
    "Room Brain participant ejection did not converge",
    409,
  );
}

function readSnapshotSequence(value: unknown): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const snapshot = (value as Record<string, unknown>).snapshot;
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    Array.isArray(snapshot)
  ) {
    return null;
  }
  const sequence = (snapshot as Record<string, unknown>).sequence;
  return Number.isSafeInteger(sequence) && (sequence as number) >= 0
    ? (sequence as number)
    : null;
}

async function createServerRoomBrainToken(
  config: RoomBrainServerClientConfig,
  input: {
    roomId: string;
    userId: string;
    role: RoomBrainTokenRole;
  },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return createRoomBrainToken(
    {
      v: 1,
      roomId: input.roomId,
      userId: input.userId,
      role: input.role,
      connectionId: randomUUID(),
      exp: now + 60,
    },
    config.roomBrainSecret,
  );
}

function validateConfig(config: RoomBrainServerClientConfig): void {
  if (!config.websocketUrl.trim()) {
    throw new Error("Room Brain websocket URL is required");
  }
  if (config.roomBrainSecret.length < 32) {
    throw new Error("Room Brain auth secret is not configured");
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new RoomBrainServerRequestError(
      "Room Brain returned invalid JSON",
      502,
    );
  }
}

function isMediaJoinAuthorization(value: unknown): value is MediaJoinAuthorization {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.roomId === "string" &&
    typeof record.userId === "string" &&
    (record.role === "host" ||
      record.role === "moderator" ||
      record.role === "speaker" ||
      record.role === "viewer") &&
    Number.isSafeInteger(record.authoritySequence) &&
    typeof record.token === "string" &&
    Boolean(record.token.trim()) &&
    typeof record.expiresAt === "number" &&
    Number.isFinite(record.expiresAt)
  );
}
