const DEFAULT_ROOM_BRAIN_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function roomBrainMediaGrantUrl(
  websocketBase: string,
  roomId: string,
  allowedHosts: readonly string[] = [],
): string {
  return roomBrainServerHttpUrl(
    websocketBase,
    roomId,
    "media-grant",
    allowedHosts,
  );
}

export function roomBrainModerationActionUrl(
  websocketBase: string,
  roomId: string,
  allowedHosts: readonly string[] = [],
): string {
  return roomBrainServerHttpUrl(
    websocketBase,
    roomId,
    "moderation-action",
    allowedHosts,
  );
}

function roomBrainServerHttpUrl(
  websocketBase: string,
  roomId: string,
  action: "media-grant" | "moderation-action",
  allowedHosts: readonly string[],
): string {
  const url = new URL(websocketBase);
  const production = process.env.NODE_ENV === "production";

  if (production && url.protocol !== "wss:") {
    throw new Error("Room Brain must use wss in production");
  }

  if (url.protocol === "wss:") url.protocol = "https:";
  else if (url.protocol === "ws:") url.protocol = "http:";
  else {
    throw new Error("Unsupported Room Brain URL protocol");
  }

  const configuredHosts = allowedHosts
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const permittedHosts = new Set(
    production ? configuredHosts : [...DEFAULT_ROOM_BRAIN_HOSTS, ...configuredHosts],
  );

  if (!permittedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Room Brain host is not allowlisted");
  }

  url.username = "";
  url.password = "";
  url.pathname =
    `${url.pathname.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}/${action}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
