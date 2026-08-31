import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ticketRoute = readFileSync(
  "app/api/rooms/[roomId]/realtime-token/route.ts",
  "utf8",
);
const mediaAuthorizationRoute = readFileSync(
  "app/api/rooms/[roomId]/media-authorization/route.ts",
  "utf8",
);
const mediaSessionRoute = readFileSync(
  "app/api/rooms/[roomId]/media-session/route.ts",
  "utf8",
);
const ejectRoute = readFileSync(
  "app/api/rooms/[roomId]/participants/[userId]/eject/route.ts",
  "utf8",
);
const worker = readFileSync(
  "services/room-brain-worker/src/index.ts",
  "utf8",
);
const liveRoomClient = readFileSync(
  "components/LiveRoomClient.tsx",
  "utf8",
);

test("Room Brain ticket issuance cannot reactivate an ejected membership from the browser", () => {
  assert.match(ticketRoute, /ensureActiveMembership/);
  assert.match(ticketRoute, /membershipState === "ejected"/);
  assert.doesNotMatch(ticketRoute, /\.from\("room_members"\)[\s\S]*?\.upsert\(/);
});

test("both media authorization stages require active non-ejected membership", () => {
  for (const source of [mediaAuthorizationRoute, mediaSessionRoute]) {
    assert.match(source, /\.from\("room_members"\)/);
    assert.match(source, /\.eq\("entry_state", "active"\)/);
    assert.match(source, /\.is\("left_at", null\)/);
  }
});

test("durable ejection precedes Room Brain and SFU cleanup", () => {
  const persistIndex = ejectRoute.indexOf("hostEjectMember");
  const roomBrainIndex = ejectRoute.indexOf(
    "requestAuthoritativeParticipantEjection",
    persistIndex + 1,
  );
  const mediaIndex = ejectRoute.indexOf(
    "revokeTrackedMediaSessionsForUser",
    roomBrainIndex + 1,
  );

  assert.ok(persistIndex >= 0);
  assert.ok(roomBrainIndex > persistIndex);
  assert.ok(mediaIndex > roomBrainIndex);
  assert.match(ejectRoute, /room\.created_by !== userData\.user\.id/);
  assert.match(ejectRoute, /ejected: true[\s\S]*cleanupPending: true/);
});

test("Room Brain ejection removes authority and closes every target socket", () => {
  assert.match(worker, /action !== "demote_speaker"[\s\S]*action !== "eject_participant"/);
  assert.match(worker, /type: "eject_participant"/);
  assert.match(worker, /closeParticipantSockets\(targetUserId\)/);
  assert.match(worker, /hibernatingSocket\.close\(4003, "Ejected from room"\)/);
});

test("live-room host removal uses the backend endpoint with the current sequence", () => {
  assert.match(liveRoomClient, /\/eject/);
  assert.match(liveRoomClient, /expectedSequence: room\.sequence/);
  assert.match(liveRoomClient, /reason: "Removed by room host"/);
  assert.match(liveRoomClient, /Remove from room/);
});
