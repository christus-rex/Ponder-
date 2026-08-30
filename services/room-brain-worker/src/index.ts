import { DurableObject } from "cloudflare:workers";
import {
  applyRoomBrainCommand,
  encodeRoomBrainMessage,
  handleRoomBrainClientMessage,
  initialRoomBrainProtocolState,
  initialRoomBrainState,
  verifyRoomBrainToken,
  type RoomBrainConnectionIdentity,
  type RoomBrainProtocolState,
  type RoomBrainServerMessage,
  type RoomBrainTokenPayload,
} from "../../../packages/domain/src/index.ts";

interface Env {
  ROOM_BRAIN: DurableObjectNamespace;
  ROOM_BRAIN_AUTH_SECRET: string;
}

type ConnectionAttachment = RoomBrainConnectionIdentity & {
  roomId: string;
  connectionId: string;
  tokenExp: number;
};

const PROTOCOL_STORAGE_KEY = "room-brain-protocol";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const url = new URL(request.url);
    const match = /^\/rooms\/([^/]+)$/.exec(url.pathname);
    if (!match) return new Response("Not found", { status: 404 });

    const roomId = decodeURIComponent(match[1]!);
    const token = extractAuthorizationToken(
      request.headers.get("Sec-WebSocket-Protocol")
    );
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
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const attachment = readVerifiedAttachment(request.headers);
    if (!attachment) {
      return new Response("Verified connection identity required", { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

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

    if (attachment.tokenExp <= Math.floor(Date.now() / 1000)) {
      webSocket.close(1008, "Realtime authorization expired");
      return;
    }

    const protocol = await this.loadProtocol();
    const result = handleRoomBrainClientMessage(protocol, attachment, message);

    webSocket.send(encodeRoomBrainMessage(result.reply));

    if (result.protocol.room.sequence !== protocol.room.sequence) {
      await this.ctx.storage.put(PROTOCOL_STORAGE_KEY, result.protocol);
    }

    if (result.broadcast) {
      this.broadcast(result.broadcast, webSocket);
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

  private async loadProtocol(): Promise<RoomBrainProtocolState> {
    return (
      (await this.ctx.storage.get<RoomBrainProtocolState>(
        PROTOCOL_STORAGE_KEY
      )) ?? initialRoomBrainProtocolState(initialRoomBrainState())
    );
  }

  private async removeConnection(
    webSocket: HibernatingWebSocket
  ): Promise<void> {
    const attachment = webSocket.deserializeAttachment() as
      | ConnectionAttachment
      | null;
    if (!attachment) return;

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
