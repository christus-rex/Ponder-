import type { RoomBrainCommand, RoomBrainRole } from './room-brain.ts';
import {
  ROOM_BRAIN_PROTOCOL_VERSION,
  validateEnvelope,
  type RoomBrainClientEnvelope
} from './room-brain-protocol.ts';

export const MAX_ROOM_BRAIN_MESSAGE_BYTES = 4096;

export function decodeRoomBrainClientMessage(
  message: string,
  maxBytes = MAX_ROOM_BRAIN_MESSAGE_BYTES
): RoomBrainClientEnvelope {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('maxBytes must be a positive safe integer');
  }
  if (new TextEncoder().encode(message).byteLength > maxBytes) {
    throw new Error('Room Brain message exceeds size limit');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    throw new Error('Room Brain message is not valid JSON');
  }

  const object = requireObject(parsed, 'Room Brain envelope');
  const version = object.version;
  const commandId = object.commandId;
  const expectedSequence = object.expectedSequence;
  const command = decodeCommand(object.command);

  if (version !== ROOM_BRAIN_PROTOCOL_VERSION) {
    throw new Error('Unsupported Room Brain protocol version');
  }
  if (typeof commandId !== 'string') {
    throw new Error('Room Brain command ID must be a string');
  }
  if (typeof expectedSequence !== 'number') {
    throw new Error('Expected sequence must be a number');
  }

  const envelope: RoomBrainClientEnvelope = {
    version,
    commandId,
    expectedSequence,
    command
  };
  validateEnvelope(envelope);
  return envelope;
}

export function encodeRoomBrainMessage(value: unknown): string {
  return JSON.stringify(value);
}

function decodeCommand(value: unknown): RoomBrainCommand {
  const command = requireObject(value, 'Room Brain command');
  const type = requireString(command.type, 'Command type');

  switch (type) {
    case 'join':
      return {
        type,
        userId: requireId(command.userId, 'userId'),
        role: requireRole(command.role)
      };
    case 'leave':
    case 'request_seat':
    case 'cancel_seat':
      return {
        type,
        userId: requireId(command.userId, 'userId')
      };
    case 'grant_seat':
      return {
        type,
        actorUserId: requireId(command.actorUserId, 'actorUserId'),
        targetUserId: requireId(command.targetUserId, 'targetUserId')
      };
    case 'set_room_lock':
      return {
        type,
        actorUserId: requireId(command.actorUserId, 'actorUserId'),
        locked: requireBoolean(command.locked, 'locked')
      };
    case 'react':
      return {
        type,
        userId: requireId(command.userId, 'userId'),
        reaction: requireString(command.reaction, 'reaction')
      };
    default:
      throw new Error('Unknown Room Brain command type');
  }
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
}

function requireId(value: unknown, label: string): string {
  const id = requireString(value, label);
  if (id.length < 1 || id.length > 128) throw new Error(`${label} has invalid length`);
  return id;
}

function requireRole(value: unknown): RoomBrainRole {
  if (value === 'host' || value === 'moderator' || value === 'speaker' || value === 'viewer') {
    return value;
  }
  throw new Error('Invalid Room Brain role');
}
