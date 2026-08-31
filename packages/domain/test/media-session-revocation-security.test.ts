import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260831093446_room_media_provider_sessions.sql",
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

test("provider session registry serializes current-generation replacement without losing historical handles", () => {
  assert.match(
    migration,
    /create unique index room_media_provider_sessions_current_user_idx[\s\S]*on public\.room_media_provider_sessions\(room_id, user_id\)[\s\S]*where is_current and revoked_at is null/i,
  );
  assert.match(
    migration,
    /unique \(provider, provider_participant_id\)/i,
  );
  assert.match(
    migration,
    /create or replace function public\.register_room_media_provider_session/i,
  );
  assert.match(
    migration,
    /pg_advisory_xact_lock[\s\S]*hashtextextended/i,
  );
  assert.match(
    migration,
    /revoke execute on function public\.register_room_media_provider_session[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.register_room_media_provider_session[\s\S]*to service_role/i,
  );
});

test("media session endpoint persists provider participant IDs but does not return them to clients", () => {
  assert.match(
    mediaSessionRoute,
    /providerParticipantId: credentials\.providerParticipantId/i,
  );
  const responseBlock = mediaSessionRoute.match(
    /const publicCredentials = \{[\s\S]*?\};[\s\S]*?return NextResponse\.json\(publicCredentials/i,
  )?.[0];
  assert.ok(responseBlock);
  assert.match(responseBlock, /participantToken: credentials\.participantToken/i);
  assert.match(responseBlock, /expiresAt: credentials\.expiresAt/i);
  assert.doesNotMatch(responseBlock, /providerParticipantId/);
});
