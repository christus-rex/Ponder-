import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260831061000_room_media_provider_sessions.sql",
  "utf8",
);
const mediaSessionRoute = readFileSync(
  "app/api/rooms/[roomId]/media-session/route.ts",
  "utf8",
);

test("provider participant revocation handles are isolated from browser roles", () => {
  assert.match(
    migration,
    /alter table public\.room_media_provider_sessions enable row level security/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.room_media_provider_sessions from anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete[\s\S]*room_media_provider_sessions to service_role/i,
  );
});

test("provider session registry enforces one tracked participant per room user", () => {
  assert.match(
    migration,
    /primary key \(room_id, user_id\)/i,
  );
  assert.match(
    migration,
    /unique \(provider, provider_participant_id\)/i,
  );
});

test("media session endpoint persists provider participant IDs but does not return them to clients", () => {
  assert.match(
    mediaSessionRoute,
    /providerParticipantId: credentials\.providerParticipantId/i,
  );
  const responseBlock = mediaSessionRoute.match(
    /return NextResponse\.json\([\s\S]*?participantToken: credentials\.participantToken[\s\S]*?expiresAt: credentials\.expiresAt[\s\S]*?\);/i,
  )?.[0];
  assert.ok(responseBlock);
  assert.doesNotMatch(responseBlock, /providerParticipantId/);
});
