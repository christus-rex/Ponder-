import {
  applyRoomBrainServerMessage,
  initialRoomBrainClientSyncState,
  ROOM_BRAIN_PROTOCOL_VERSION,
  type RoomBrainClientEnvelope,
  type RoomBrainClientSyncState,
  type RoomBrainCommand,
  type RoomBrainServerMessage,
} from "../../packages/domain/src/index.ts";

export interface RoomBrainConnectionTicket {
  token: string;
  protocol: "ponder-v1";
  websocketUrl: string;
  expiresAt: number;
  role: "host" | "moderator" | "speaker" | "viewer";
}

export async function requestRoomBrainTicket(
  roomId: string
): Promise<RoomBrainConnectionTicket> {
  const response = await fetch(
    `/api/rooms/${encodeURIComponent(roomId)}/realtime-token`,
    {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  const payload = (await response.json()) as
    | RoomBrainConnectionTicket
    | { error?: string };

  if (!response.ok || !("token" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Unable to authorize Room Brain connection."
    );
  }

  return payload;
}

export async function connectRoomBrain(roomId: string): Promise<WebSocket> {
  const ticket = await requestRoomBrainTicket(roomId);
  const socket = new WebSocket(ticket.websocketUrl, [
    ticket.protocol,
    `ponder-auth.${ticket.token}`,
  ]);

  await waitForOpen(socket);
  return socket;
}

type SocketLike = Pick<
  WebSocket,
  | "readyState"
  | "send"
  | "close"
  | "addEventListener"
  | "removeEventListener"
>;

type SocketFactory = (
  url: string,
  protocols: string[]
) => SocketLike;

type TicketFactory = (roomId: string) => Promise<RoomBrainConnectionTicket>;

type Schedule = (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
type CancelSchedule = (handle: ReturnType<typeof setTimeout>) => void;

export interface ManagedRoomBrainClientOptions {
  requestTicket?: TicketFactory;
  socketFactory?: SocketFactory;
  schedule?: Schedule;
  cancelSchedule?: CancelSchedule;
  commandIdFactory?: () => string;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  onSyncStateChange?: (state: RoomBrainClientSyncState) => void;
  onError?: (error: Error) => void;
}

export class ManagedRoomBrainClient {
  private socket: SocketLike | null = null;
  private reconnectHandle: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private stopped = true;
  private syncState: RoomBrainClientSyncState = initialRoomBrainClientSyncState();

  private readonly requestTicket: TicketFactory;
  private readonly socketFactory: SocketFactory;
  private readonly schedule: Schedule;
  private readonly cancelSchedule: CancelSchedule;
  private readonly commandIdFactory: () => string;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly onSyncStateChange?: (state: RoomBrainClientSyncState) => void;
  private readonly onError?: (error: Error) => void;

  constructor(
    private readonly roomId: string,
    options: ManagedRoomBrainClientOptions = {}
  ) {
    this.requestTicket = options.requestTicket ?? requestRoomBrainTicket;
    this.socketFactory =
      options.socketFactory ??
      ((url, protocols) => new WebSocket(url, protocols));
    this.schedule = options.schedule ?? setTimeout;
    this.cancelSchedule = options.cancelSchedule ?? clearTimeout;
    this.commandIdFactory = options.commandIdFactory ?? defaultCommandId;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 500;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 10_000;
    this.onSyncStateChange = options.onSyncStateChange;
    this.onError = options.onError;

    if (!Number.isFinite(this.reconnectBaseDelayMs) || this.reconnectBaseDelayMs < 0) {
      throw new Error("reconnectBaseDelayMs must be non-negative");
    }
    if (
      !Number.isFinite(this.reconnectMaxDelayMs) ||
      this.reconnectMaxDelayMs < this.reconnectBaseDelayMs
    ) {
      throw new Error("reconnectMaxDelayMs must be >= reconnectBaseDelayMs");
    }
  }

  get state(): RoomBrainClientSyncState {
    return this.syncState;
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    await this.openConnection();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectHandle !== null) {
      this.cancelSchedule(this.reconnectHandle);
      this.reconnectHandle = null;
    }
    this.socket?.close(1000, "Room Brain client stopped");
    this.socket = null;
    this.setSyncState(initialRoomBrainClientSyncState());
  }

  sendCommand(command: RoomBrainCommand): string {
    if (
      this.syncState.status !== "synchronized" ||
      !this.syncState.room ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      throw new Error("Room Brain client is not synchronized");
    }

    const commandId = this.commandIdFactory();
    const envelope: RoomBrainClientEnvelope = {
      version: ROOM_BRAIN_PROTOCOL_VERSION,
      commandId,
      expectedSequence: this.syncState.room.sequence,
      command,
    };
    this.socket.send(JSON.stringify(envelope));
    return commandId;
  }

  private async openConnection(): Promise<void> {
    if (this.stopped) return;
    this.setSyncState(initialRoomBrainClientSyncState());

    try {
      const ticket = await this.requestTicket(this.roomId);
      if (this.stopped) return;

      const socket = this.socketFactory(ticket.websocketUrl, [
        ticket.protocol,
        `ponder-auth.${ticket.token}`,
      ]);
      this.socket = socket;

      const onOpen = () => {
        this.reconnectAttempt = 0;
      };
      const onMessage = (event: Event) => {
        const data = (event as MessageEvent<unknown>).data;
        if (typeof data !== "string") {
          this.forceReconnect(new Error("Room Brain sent a non-text message"));
          return;
        }

        let message: RoomBrainServerMessage;
        try {
          message = JSON.parse(data) as RoomBrainServerMessage;
          const next = applyRoomBrainServerMessage(this.syncState, message);
          this.setSyncState(next);
          if (next.status === "resync_required") {
            this.forceReconnect(new Error("Room Brain client detected a state gap"));
          }
        } catch {
          this.forceReconnect(new Error("Room Brain sent an invalid server message"));
        }
      };
      const onError = () => {
        this.reportError(new Error("Room Brain WebSocket connection failed"));
      };
      const onClose = () => {
        this.detachSocket(socket, onOpen, onMessage, onError, onClose);
        if (this.socket === socket) this.socket = null;
        if (!this.stopped) this.scheduleReconnect();
      };

      socket.addEventListener("open", onOpen);
      socket.addEventListener("message", onMessage);
      socket.addEventListener("error", onError);
      socket.addEventListener("close", onClose);
    } catch (error) {
      this.reportError(asError(error));
      if (!this.stopped) this.scheduleReconnect();
    }
  }

  private forceReconnect(error: Error): void {
    this.reportError(error);
    this.setSyncState({ status: "resync_required", room: this.syncState.room });
    this.socket?.close(1012, "Room Brain resync required");
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectHandle !== null) return;
    const delay = Math.min(
      this.reconnectMaxDelayMs,
      this.reconnectBaseDelayMs * 2 ** this.reconnectAttempt
    );
    this.reconnectAttempt += 1;
    this.reconnectHandle = this.schedule(() => {
      this.reconnectHandle = null;
      void this.openConnection();
    }, delay);
  }

  private setSyncState(state: RoomBrainClientSyncState): void {
    this.syncState = state;
    this.onSyncStateChange?.(state);
  }

  private reportError(error: Error): void {
    this.onError?.(error);
  }

  private detachSocket(
    socket: SocketLike,
    onOpen: EventListener,
    onMessage: EventListener,
    onError: EventListener,
    onClose: EventListener
  ): void {
    socket.removeEventListener("open", onOpen);
    socket.removeEventListener("message", onMessage);
    socket.removeEventListener("error", onError);
    socket.removeEventListener("close", onClose);
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Room Brain WebSocket connection failed."));
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Room Brain WebSocket closed before opening."));
    };
    const cleanup = () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("close", onClose);
    };

    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("error", onError, { once: true });
    socket.addEventListener("close", onClose, { once: true });
  });
}

function defaultCommandId(): string {
  return `cmd_${crypto.randomUUID().replaceAll("-", "")}`;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown Room Brain client error");
}
