import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const discover = readFileSync("app/discover/page.tsx", "utf8");
const roomPage = readFileSync("app/rooms/[roomId]/page.tsx", "utf8");
const roomClient = readFileSync("components/LiveRoomClient.tsx", "utf8");
const mediaAuthorization = readFileSync(
  "lib/realtime/roomMediaAuthorization.ts",
  "utf8",
);

test("discovery creates and enters canonical live rooms", () => {
  assert.match(discover, /CreateRoomPanel/);
  assert.match(discover, /href=\{[^}]*room\.id/);
  assert.doesNotMatch(discover, /Enter room<\/button>/);
});

test("live room page is authenticated and only renders open rooms", () => {
  assert.match(roomPage, /supabase\.auth\.getUser/);
  assert.match(roomPage, /current_user_can_enter/);
  assert.match(roomPage, /room\.status !== "open"/);
  assert.match(roomPage, /<LiveRoomClient/);
});

test("live room client composes Room Brain, coordinator, and RealtimeKit provider", () => {
  assert.match(roomClient, /new ManagedRoomBrainClient/);
  assert.match(roomClient, /new RoomMediaSessionCoordinator/);
  assert.match(roomClient, /new RealtimeKitMediaProvider/);
  assert.match(roomClient, /coordinator\.updateRoomBrainState\(state\)/);
  assert.match(roomClient, /setMicrophoneRequested/);
  assert.match(roomClient, /setCameraRequested/);
  assert.match(roomClient, /type: "request_seat"/);
  assert.match(roomClient, /type: "grant_seat"/);
  assert.match(roomClient, /expectedSequence: room\.sequence/);
});

test("browser media authorization completes capability and provider exchanges without sending role or preset", () => {
  const authorizationIndex = mediaAuthorization.indexOf("/media-authorization");
  const sessionIndex = mediaAuthorization.indexOf("/media-session");
  assert.ok(authorizationIndex >= 0);
  assert.ok(sessionIndex > authorizationIndex);
  assert.match(
    mediaAuthorization,
    /body: JSON\.stringify\(\{ authoritySequence: request\.authoritySequence \}\)/,
  );
  assert.match(
    mediaAuthorization,
    /capabilityToken: capability\.token[\s\S]*authoritySequence: request\.authoritySequence/,
  );

  const requestBodies =
    mediaAuthorization.match(/body: JSON\.stringify\([\s\S]*?\),/g) ?? [];
  assert.equal(requestBodies.length, 2);
  assert.doesNotMatch(requestBodies.join("\n"), /\brole\b|\bpreset\b/);
});

test("provider token expiry is normalized to coordinator milliseconds", () => {
  assert.match(mediaAuthorization, /expiresAt: provider\.expiresAt \* 1000/);
});
