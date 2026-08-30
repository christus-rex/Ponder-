import { describe, expect, it, vi } from "vitest";
import { ManagedRoomBrainClient } from "./roomBrainClient";

class FakeSocket extends EventTarget {
  readyState: number = WebSocket.OPEN;
  sent: string[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push({ code, reason });
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  serverMessage(payload: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(payload) })
    );
  }
}

function snapshot(sequence = 0) {
  return {
    version: 1,
    type: "snapshot",
    snapshot: {
      version: 1,
      sequence,
      locked: false,
      participants: {},
      speakerQueue: [],
      reactionBuckets: {},
    },
  } as const;
}

function ticket() {
  return {
    token: "signed-ticket",
    protocol: "ponder-v1" as const,
    websocketUrl: "wss://room-brain.example/rooms/room-1",
    expiresAt: Date.now() + 60_000,
    role: "viewer" as const,
  };
}

describe("ManagedRoomBrainClient", () => {
  it("blocks commands until an authoritative snapshot arrives", async () => {
    const socket = new FakeSocket();
    const client = new ManagedRoomBrainClient("room-1", {
      requestTicket: async () => ticket(),
      socketFactory: () => socket as unknown as WebSocket,
      commandIdFactory: () => "cmd_test_0001",
    });

    await client.start();

    expect(() =>
      client.sendCommand({ type: "request_seat", userId: "viewer-1" })
    ).toThrow("not synchronized");

    socket.serverMessage(snapshot());
    expect(client.state.status).toBe("synchronized");

    client.sendCommand({ type: "request_seat", userId: "viewer-1" });
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      version: 1,
      commandId: "cmd_test_0001",
      expectedSequence: 0,
      command: { type: "request_seat", userId: "viewer-1" },
    });
  });

  it("closes and schedules reconnect when a sequence gap is detected", async () => {
    const sockets: FakeSocket[] = [];
    const scheduled: Array<() => void> = [];
    const errors: Error[] = [];
    const requestTicket = vi.fn(async () => ticket());

    const client = new ManagedRoomBrainClient("room-1", {
      requestTicket,
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      schedule: (callback) => {
        scheduled.push(callback);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      cancelSchedule: () => {},
      reconnectBaseDelayMs: 0,
      reconnectMaxDelayMs: 0,
      onError: (error) => errors.push(error),
    });

    await client.start();
    sockets[0]!.serverMessage(snapshot(0));
    sockets[0]!.serverMessage({
      version: 1,
      type: "state_changed",
      sequence: 2,
      command: { type: "join", userId: "viewer-1", role: "viewer" },
    });

    expect(client.state.status).toBe("resync_required");
    expect(sockets[0]!.closeCalls.at(-1)).toEqual({
      code: 1012,
      reason: "Room Brain resync required",
    });
    expect(scheduled).toHaveLength(1);
    expect(errors.at(-1)?.message).toContain("state gap");

    scheduled[0]!();
    await Promise.resolve();
    await Promise.resolve();

    expect(requestTicket).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(2);
    expect(client.state.status).toBe("awaiting_snapshot");
  });

  it("does not reconnect after an intentional stop", async () => {
    const socket = new FakeSocket();
    const scheduled: Array<() => void> = [];
    const client = new ManagedRoomBrainClient("room-1", {
      requestTicket: async () => ticket(),
      socketFactory: () => socket as unknown as WebSocket,
      schedule: (callback) => {
        scheduled.push(callback);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      cancelSchedule: () => {},
    });

    await client.start();
    client.stop();

    expect(socket.closeCalls.at(-1)?.code).toBe(1000);
    expect(scheduled).toHaveLength(0);
    expect(client.state.status).toBe("awaiting_snapshot");
  });
});
