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
