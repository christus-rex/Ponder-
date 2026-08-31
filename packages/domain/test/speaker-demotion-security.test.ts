import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(
  "services/room-brain-worker/src/index.ts",
  "utf8",
);
const auth = readFileSync(
  "packages/domain/src/room-brain-auth.ts",
  "utf8",
);
const codec = readFileSync(
  "packages/domain/src/room-brain-codec.ts",
  "utf8",
);
const demotionRoute = readFileSync(
  "app/api/rooms/[roomId]/participants/[userId]/demote/route.ts",
  "utf8",
);
const mediaSessionRoute = readFileSync(
  "app/api/rooms/[roomId]/media-session/route.ts",
  "utf8",
);

test("speaker demotion is backend-only and sequence guarded inside Room Brain", () => {
  assert.match(worker, /moderation-action/);
  assert.match(worker, /action !== "demote_speaker"/);
  assert.match(worker, /applyRoomBrainEnvelope\(protocol/);
  assert.match(worker, /expectedSequence/);
  assert.match(worker, /payload\.role !== "host"[\s\S]*payload\.role !== "moderator"/);

  assert.match(
    auth,
    /case 'demote_speaker':[\s\S]*trusted backend moderation/i,
  );
  assert.doesNotMatch(codec, /case 'demote_speaker'/);
});

test("host demotion revokes only the target user's tracked provider sessions", () => {
  assert.match(
    demotionRoute,
    /room\.created_by !== userData\.user\.id/,
  );
  assert.match(
    demotionRoute,
    /requestAuthoritativeSpeakerDemotion/,
  );
  assert.match(
    demotionRoute,
    /revokeTrackedMediaSessionsForUser[\s\S]*roomId[\s\S]*targetUserId/,
  );
});

test("provider exchange revalidates live Room Brain authority before RealtimeKit exchange", () => {
  const verifyIndex = mediaSessionRoute.indexOf("verifyTrustedMediaCapability");
  const revalidateIndex = mediaSessionRoute.indexOf(
    "requestAuthoritativeMediaGrant",
    verifyIndex + 1,
  );
  const exchangeIndex = mediaSessionRoute.indexOf(
    "exchangeTrustedMediaCapability",
    revalidateIndex + 1,
  );
  const trackIndex = mediaSessionRoute.indexOf(
    "replaceTrackedMediaProviderSession",
    exchangeIndex + 1,
  );
  const finalRevalidateIndex = mediaSessionRoute.indexOf(
    "requestAuthoritativeMediaGrant",
    trackIndex + 1,
  );
  const responseIndex = mediaSessionRoute.indexOf(
    "const publicCredentials",
    finalRevalidateIndex + 1,
  );

  assert.ok(verifyIndex >= 0);
  assert.ok(revalidateIndex > verifyIndex);
  assert.ok(exchangeIndex > revalidateIndex);
  assert.ok(trackIndex > exchangeIndex);
  assert.ok(finalRevalidateIndex > trackIndex);
  assert.ok(responseIndex > finalRevalidateIndex);
  assert.match(
    mediaSessionRoute,
    /capabilityToken: freshAuthorization\.token/,
  );
  assert.match(
    mediaSessionRoute,
    /error\.status === 409[\s\S]*Resync before establishing media/,
  );
  assert.match(
    mediaSessionRoute,
    /participantRevoker\.revokeParticipant[\s\S]*sessionStore\.markRevoked/,
  );
});
