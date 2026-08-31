import { DurableObject } from "cloudflare:workers";
import {
  applyRoomBrainCommand,
  applyRoomBrainEnvelope,
  buildRoomBrainSnapshot,
  claimRoomBrainPresence,
  createMediaSessionToken,
  encodeRoomBrainMessage,
  handleRoomBrainClientMessage,
  initialRoomBrainProtocolState,
  initialRoomBrainState,
  releaseRoomBrainPresence,
  verifyRoomBrainToken,
  type RoomBrainConnectionIdentity,
  type RoomBrainPresenceRegistry,
  type RoomBrainProtocolState,
  type RoomBrainServerMessage,
  type RoomBrainTokenPayload,
} from "../../../packages/domain/src/index.ts";

interface Env {
  ROOM_BRAIN: DurableObjectNamespace;
  ROOM_BRAIN_AUTH_SECRET: string;
  MEDIA_SESSION_AUTH_SECRET: string;
}

type ConnectionAttachment = RoomBrainConnectionIdentity & {
  roomId: string;
  connectionId: string;
  tokenExp: number;
};

const PROTOCOL_STORAGE_KEY = "room-brain-protocol";
const PRESENCE_STORAGE_KEY = "room-brain-presence";
const MEDIA_GRANT_TTL_SECONDS = 30;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const mediaGrantMatch = /^\/rooms\/([^/]+)\/media-grant$/.exec(url.pathname);
    const moderationActionMatch = /^\/rooms\/([^/]+)\/moderation-action$/.exec(
      url.pathname,
    );

    if (request.method === "POST" && (mediaGrantMatch || moderationActionMatch)) {
      const routeMatch = mediaGrantMatch ?? moderationActionMatch;
      const roomId = decodeURIComponent(routeMatch![1]!);
      const token = extractBearerToken(request.headers.get("Authorization"));
      if (!token) {
        return new Response("Missing realtime authorization", { status: 401 });
      }

      let payload: RoomBrainTokenPayload;
      try {
        payload = await verifyRoomBrainToken(token, env.ROOM_BRAIN_AUTH_SECRET);
      } catch {
        return new Response("Invalid realtime authorization", { status: 401 });
      }

      if (payload.roomId !== roomId) {
        return new Response("Room authorization mismatch", { status: 403 });
      }
      if (
        moderationActionMatch &&
        payload.role !== "host" &&
        payload.role !== "moderator"
      ) {
        return new Response("Moderator authorization required", { status: 403 });
      }

      const id = env.ROOM_BRAIN.idFromName(roomId);
      const stub = env.ROOM_BRAIN.get(id);
      const headers = new Headers(request.headers);
      headers.set("X-Ponder-Verified-Room", payload.roomId);
      headers.set("X-Ponder-Verified-User", payload.userId);
      headers.set("X-Ponder-Verified-Role", payload.role);
      headers.set("X-Ponder-Connection-Id", payload.connectionId);
      headers.set("X-Ponder-Token-Exp", String(payload.exp));

      return stub.fetch(new Request(request, { headers }));
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const match = /^\/rooms\/([^/]+)$/.exec(url.pathname);
    if (!match) return new Response("Not found", { status: 404 });

    const roomId = decodeURIComponent(match[1]!);
    const protocolHeader = request.headers.get("Sec-WebSocket-Protocol");
    if (!offersPonderProtocol(protocolHeader)) {
      return new Response("Ponder WebSocket protocol required", { status: 400 });
    }

    const token = extractAuthorizationToken(protocolHeader);
    if (!token) return new Response("Missing realtime authorization", { status: 401 });

    let payload: RoomBrainTokenPayload;
    try {
      payload = await verifyRoomBrainToken(token, env.ROOM_BRAIN_AUTH_SECRET);
    } catch {
      return new Response("Invalid realtime authorization", { status: 401 });
    }

    if (payload.roomId !== roomId) {
      return new Response("Room authorization mismatch", { status: 403 });
    }

    const id = env.ROOM_BRAIN.idFromName(roomId);
    const stub = env.ROOM_BRAIN.get(id);
    const headers = new Headers(request.headers);
    headers.set("X-Ponder-Verified-Room", payload.roomId);
    headers.set("X-Ponder-Verified-User", payload.userId);
    headers.set("X-Ponder-Verified-Role", payload.role);
    headers.set("X-Ponder-Connection-Id", payload.connectionId);
    headers.set("X-Ponder-Token-Exp", String(payload.exp));

    return stub.fetch(new Request(request, { headers }));
  },
};

export class RoomBrainDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (request.method === "POST" && pathname.endsWith("/media-grant")) {
      return this.issueMediaGrant(request);
    }
    if (request.method === "POST" && pathname.endsWith("/moderation-action")) {
      return this.applyModerationAction(request);
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const attachment = readVerifiedAttachment(request.headers);
    if (!attachment) {
      return new Response("Verified connection identity required", { status: 401 });
    }

    const presence = await this.loadPresence();
    let claimedPresence;
    try {
      claimedPresence = claimRoomBrainPresence(
        presence,
        attachment.userId,
        attachment.connectionId
      );
    } catch {
      return new Response("Too many active Room Brain connections", { status: 429 });
    }

    let protocol = await this.loadProtocol();
    let joinBroadcast: RoomBrainServerMessage | undefined;

    if (!protocol.room.participants[attachment.userId]) {
      const room = applyRoomBrainCommand(protocol.room, {
        type: "join",
        userId: attachment.userId,
        role: attachment.role,
      });
      protocol = {
        room,
        recentCommandIds: protocol.recentCommandIds,
      };
      joinBroadcast = {
        version: 1,
        type: "state_changed",
        sequence: room.sequence,
        command: {
          type: "join",
          userId: attachment.userId,
          role: attachment.role,
        },
      };
    }

    await this.ctx.storage.put(PRESENCE_STORAGE_KEY, claimedPresence.registry);
    if (joinBroadcast) {
      await this.ctx.storage.put(PROTOCOL_STORAGE_KEY, protocol);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    server.send(
      encodeRoomBrainMessage({
        version: 1,
        type: "snapshot",
        snapshot: buildRoomBrainSnapshot(protocol.room),
      } satisfies RoomBrainServerMessage)
    );

    if (joinBroadcast) {
      this.broadcast(joinBroadcast, server);
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": "ponder-v1" },
    } as ResponseInit & { webSocket: WebSocket });
  }

  async webSocketMessage(
    webSocket: HibernatingWebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    if (typeof message !== "string") {
      webSocket.send(
        encodeRoomBrainMessage({
          version: 1,
          type: "error",
          code: "invalid_message",
          message: "Binary Room Brain messages are not supported",
        } satisfies RoomBrainServerMessage)
      );
      return;
    }

    const attachment = webSocket.deserializeAttachment() as
      | ConnectionAttachment
      | null;
    if (!attachment) {
      webSocket.close(1008, "Missing verified connection identity");
      return;
    }

    // tokenExp limits replay at handshake time. Once the connection is accepted,
    // the verified attachment authorizes the lifetime of this WebSocket session.
    const protocol = await this.loadProtocol();
    const result = handleRoomBrainClientMessage(protocol, attachment, message);

    webSocket.send(encodeRoomBrainMessage(result.reply));

    if (result.protocol.room.sequence !== protocol.room.sequence) {
      await this.ctx.storage.put(PROTOCOL_STORAGE_KEY, result.protocol);
    }

    if (result.broadcast) {
      this.broadcast(result.broadcast);
    }
  }

  async webSocketClose(
    webSocket: HibernatingWebSocket,
    code: number,
    reason: string,
    _wasClean: boolean
  ): Promise<void> {
    await this.removeConnection(webSocket);
    webSocket.close(code, reason);
  }

  async webSocketError(webSocket: HibernatingWebSocket): Promise<void> {
    await this.removeConnection(webSocket);
  }

  private async applyModerationAction(request: Request): Promise<Response> {
    const attachment = readVerifiedAttachment(request.headers);
    if (!attachment) {
      return new Response("Verified connection identity required", { status: 401 });
    }
    if (attachment.role !== "host" && attachment.role !== "moderator") {
      return new Response("Moderator authorization required", { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid moderation request", { status: 400 });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return new Response("Invalid moderation request", { status: 400 });
    }

    const record = body as Record<string, unknown>;
    const commandId = record.commandId;
    const expectedSequence = record.expectedSequence;
    const action = record.action;
    const targetUserId = record.targetUserId;
    if (
      typeof commandId !== "string" ||
      !/^[A-Za-z0-9_-]{8,80}$/.test(commandId) ||
      !Number.isSafeInteger(expectedSequence) ||
      (expectedSequence as number) < 0 ||
      action !== "demote_speaker" ||
      typeof targetUserId !== "string" ||
      targetUserId.length < 1 ||
      targetUserId.length > 128
    ) {
      return new Response("Invalid moderation request", { status: 400 });
    }

    const protocol = await this.loadProtocol();
    let applied;
    try {
      applied = applyRoomBrainEnvelope(protocol, {
        version: 1,
        commandId,
        expectedSequence: expectedSequence as number,
        command: {
          type: "demote_speaker",
          actorUserId: attachment.userId,
          targetUserId,
        },
      });
    } catch {
      return new Response("Moderation action rejected by authoritative state", {
        status: 422,
      });
    }

    if (!applied.accepted) {
      if (applied.duplicate) {
        return Response.json(
          {
            sequence: applied.protocol.room.sequence,
            targetUserId,
            role: applied.protocol.room.participants[targetUserId]?.role ?? null,
            duplicate: true,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return Response.json(
        {
          error: "Room Brain sequence changed; resync required",
          snapshot: buildRoomBrainSnapshot(applied.protocol.room),
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    await this.ctx.storage.put(PROTOCOL_STORAGE_KEY, applied.protocol);
    const broadcast = {
      version: 1 as const,
      type: "state_changed" as const,
      sequence: applied.protocol.room.sequence,
      command: {
        type: "demote_speaker" as const,
        actorUserId: attachment.userId,
        targetUserId,
      },
    };
    this.broadcast(broadcast);

    return Response.json(
      {
        sequence: applied.protocol.room.sequence,
        targetUserId,
        role: "viewer",
        duplicate: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  private async issueMediaGrant(request: Request): Promise<Response> {
    const attachment = readVerifiedAttachment(request.headers);
    if (!attachment) {
      return new Response("Verified connection identity required", { status: 401 });
    }

    if (!this.env.MEDIA_SESSION_AUTH_SECRET || this.env.MEDIA_SESSION_AUTH_SECRET.length < 32) {
      return new Response("Media authorization is not configured", { status: 503 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid media authorization request", { status: 400 });
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return new Response("Invalid media authorization request", { status: 400 });
    }

    const authoritySequence = (body as Record<string, unknown>).authoritySequence;
    if (!Number.isSafeInteger(authoritySequence) || (authoritySequence as number) < 0) {
      return new Response("Invalid media authority sequence", { status: 400 });
    }

    const protocol = await this.loadProtocol();
    if (protocol.room.sequence !== authoritySequence) {
      return new Response("Room Brain sequence changed; resync required", { status: 409 });
    }

    const participant = protocol.room.participants[attachment.userId];
    if (!participant) {
      return new Response("User is not present in the authoritative room", { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + MEDIA_GRANT_TTL_SECONDS;
    const token = await createMediaSessionToken(
      {
        v: 1,
        kind: "ponder-media-session",
        roomId: attachment.roomId,
        userId: attachment.userId,
        role: participant.role,
        authoritySequence: authoritySequence as number,
        exp,
      },
      this.env.MEDIA_SESSION_AUTH_SECRET
    );

    return Response.json(
      {
        roomId: attachment.roomId,
        userId: attachment.userId,
        role: participant.role,
        authoritySequence,
        token,
        expiresAt: exp * 1000,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  private async loadProtocol(): Promise<RoomBrainProtocolState> {
    return (
      (await this.ctx.storage.get<RoomBrainProtocolState>(
        PROTOCOL_STORAGE_KEY
      )) ?? initialRoomBrainProtocolState(initialRoomBrainState())
    );
  }

  private async loadPresence(): Promise<RoomBrainPresenceRegistry> {
    return (
      (await this.ctx.storage.get<RoomBrainPresenceRegistry>(
        PRESENCE_STORAGE_KEY
      )) ?? {}
    );
  }

  private async removeConnection(
    webSocket: HibernatingWebSocket
  ): Promise<void> {
    const attachment = webSocket.deserializeAttachment() as
      | ConnectionAttachment
      | null;
    if (!attachment) return;

    const presence = await this.loadPresence();
    const release = releaseRoomBrainPresence(
      presence,
      attachment.userId,
      attachment.connectionId
    );
    if (!release.released) return;

    await this.ctx.storage.put(PRESENCE_STORAGE_KEY, release.registry);
    if (release.hasActiveConnections) return;

    const protocol = await this.loadProtocol();
    if (!protocol.room.participants[attachment.userId]) return;

    const room = applyRoomBrainCommand(protocol.room, {
      type: "leave",
      userId: attachment.userId,
    });
    const next: RoomBrainProtocolState = {
      room,
      recentCommandIds: protocol.recentCommandIds,
    };
    await this.ctx.storage.put(PROTOCOL_STORAGE_KEY, next);

    this.broadcast({
      version: 1,
      type: "state_changed",
      sequence: room.sequence,
      command: { type: "leave", userId: attachment.userId },
    });
  }

  private broadcast(
    message: RoomBrainServerMessage,
    except?: WebSocket
  ): void {
    const encoded = encodeRoomBrainMessage(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except) socket.send(encoded);
    }
  }
}

function extractAuthorizationToken(protocolHeader: string | null): string | null {
  if (!protocolHeader) return null;
  const protocols = protocolHeader
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const auth = protocols.find((value) => value.startsWith("ponder-auth."));
  return auth ? auth.slice("ponder-auth.".length) : null;
}

function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function readVerifiedAttachment(headers: Headers): ConnectionAttachment | null {
  const roomId = headers.get("X-Ponder-Verified-Room");
  const userId = headers.get("X-Ponder-Verified-User");
  const role = headers.get("X-Ponder-Verified-Role");
  const connectionId = headers.get("X-Ponder-Connection-Id");
  const tokenExp = Number(headers.get("X-Ponder-Token-Exp"));

  if (
    !roomId ||
    !userId ||
    !connectionId ||
    !Number.isSafeInteger(tokenExp) ||
    (role !== "host" &&
      role !== "moderator" &&
      role !== "speaker" &&
      role !== "viewer")
  ) {
    return null;
  }

  return { roomId, userId, role, connectionId, tokenExp };
}

function offersPonderProtocol(protocolHeader: string | null): boolean {
  return Boolean(
    protocolHeader
      ?.split(",")
      .map((value) => value.trim())
      .includes("ponder-v1")
  );
}
