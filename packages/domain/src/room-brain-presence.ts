export const DEFAULT_ROOM_BRAIN_CONNECTION_LIMIT = 4;

export type RoomBrainPresenceRegistry = Record<string, string[]>;

export interface RoomBrainPresenceClaimResult {
  registry: RoomBrainPresenceRegistry;
  added: boolean;
}

export interface RoomBrainPresenceReleaseResult {
  registry: RoomBrainPresenceRegistry;
  released: boolean;
  hasActiveConnections: boolean;
}

export function claimRoomBrainPresence(
  registry: RoomBrainPresenceRegistry,
  userId: string,
  connectionId: string,
  connectionLimit = DEFAULT_ROOM_BRAIN_CONNECTION_LIMIT
): RoomBrainPresenceClaimResult {
  validateIdentity(userId, connectionId);
  validateLimit(connectionLimit);

  const current = registry[userId] ?? [];
  if (current.includes(connectionId)) {
    return { registry: cloneRegistry(registry), added: false };
  }
  if (current.length >= connectionLimit) {
    throw new Error('Room Brain connection limit exceeded');
  }

  return {
    registry: {
      ...cloneRegistry(registry),
      [userId]: [...current, connectionId]
    },
    added: true
  };
}

export function releaseRoomBrainPresence(
  registry: RoomBrainPresenceRegistry,
  userId: string,
  connectionId: string
): RoomBrainPresenceReleaseResult {
  validateIdentity(userId, connectionId);

  const current = registry[userId] ?? [];
  if (!current.includes(connectionId)) {
    return {
      registry: cloneRegistry(registry),
      released: false,
      hasActiveConnections: current.length > 0
    };
  }

  const remaining = current.filter((value) => value !== connectionId);
  const next = cloneRegistry(registry);
  if (remaining.length === 0) {
    delete next[userId];
  } else {
    next[userId] = remaining;
  }

  return {
    registry: next,
    released: true,
    hasActiveConnections: remaining.length > 0
  };
}

function validateIdentity(userId: string, connectionId: string): void {
  if (userId.length < 1 || userId.length > 128) {
    throw new Error('Invalid Room Brain presence user ID');
  }
  if (connectionId.length < 8 || connectionId.length > 128) {
    throw new Error('Invalid Room Brain presence connection ID');
  }
}

function validateLimit(connectionLimit: number): void {
  if (!Number.isSafeInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 32) {
    throw new Error('Room Brain connection limit must be between 1 and 32');
  }
}

function cloneRegistry(registry: RoomBrainPresenceRegistry): RoomBrainPresenceRegistry {
  return Object.fromEntries(
    Object.entries(registry).map(([userId, connectionIds]) => [userId, [...connectionIds]])
  );
}
