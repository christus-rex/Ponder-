# Room Brain edge runtime

Ponder+ now has a deployable edge architecture for the Room Brain control channel.

## Trust flow

```text
authenticated browser
  -> POST /api/rooms/:roomId/realtime-token
  -> Next.js verifies Supabase user + room access
  -> backend signs a 60-second HMAC ticket
  -> browser opens WebSocket with:
       ponder-v1
       ponder-auth.<ticket>
  -> edge Worker verifies signature + room binding
  -> Worker routes to the room's Durable Object
  -> Durable Object serializes verified identity onto the socket
  -> Room Brain transport accepts commands only for that identity
```

The 60-second ticket limits the handshake/replay window. It does **not** expire an already accepted WebSocket session.

## Server-only configuration

The same secret must be configured in the Next.js deployment and the Cloudflare Worker:

```text
ROOM_BRAIN_AUTH_SECRET=<32+ random characters>
```

The web app also needs the public WebSocket Worker URL:

```text
NEXT_PUBLIC_ROOM_BRAIN_WS_URL=wss://<worker-host>
```

Never expose `ROOM_BRAIN_AUTH_SECRET` through a `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variable.

## Cloudflare Worker

Configuration lives in:

```text
services/room-brain-worker/
  src/index.ts
  src/runtime.d.ts
  tsconfig.json
  wrangler.jsonc
```

The Worker uses one Durable Object identity per room ID.

The Durable Object uses the WebSocket Hibernation API and serialized WebSocket attachments so verified connection identity survives hibernation. Ephemeral Room Brain state is persisted in Durable Object storage.

## Deployment

Cloudflare Wrangler 4.127.1 is the current release used by this runbook.

From the repository root:

```bash
npx wrangler@4.127.1 deploy --config services/room-brain-worker/wrangler.jsonc
```

Configure the Worker secret with Wrangler or the Cloudflare dashboard before deployment:

```bash
npx wrangler@4.127.1 secret put ROOM_BRAIN_AUTH_SECRET \
  --config services/room-brain-worker/wrangler.jsonc
```

Deployment should not proceed until the backend is configured with the exact same secret.

## Current role model

- room creator -> `host`
- authenticated non-creator joining an open room -> `viewer`
- moderator/speaker promotion remains Room Brain state, not client authority

Future media publishing authorization should consult authoritative Room Brain state before granting microphone/camera publishing rights.
