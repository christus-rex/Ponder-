import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const webWorkflow = readFileSync(".github/workflows/deploy-cloudflare.yml", "utf8");
const roomBrainWorkflow = readFileSync(".github/workflows/deploy-room-brain.yml", "utf8");
const pagesWorkflow = readFileSync(".github/workflows/pages.yml", "utf8");
const webWrangler = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const roomBrainWrangler = JSON.parse(
  readFileSync("services/room-brain-worker/wrangler.jsonc", "utf8"),
);

test("web deployment uses checked-in config and uploads runtime secrets with the deployed version", () => {
  assert.doesNotMatch(webWorkflow, /Generate Cloudflare runtime configuration/);
  assert.match(webWorkflow, /npx opennextjs-cloudflare build/);
  assert.match(webWorkflow, /wrangler/);
  assert.match(webWorkflow, /--secrets-file/);
  assert.match(webWorkflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(webWorkflow, /MEDIA_SESSION_AUTH_SECRET/);
  assert.match(webWorkflow, /MEDIA_RECONCILIATION_SECRET/);
  assert.match(webWorkflow, /REALTIMEKIT_SUBSCRIBE_ONLY_PRESET/);
  assert.match(webWorkflow, /REALTIMEKIT_PUBLISHER_PRESET/);
  assert.match(webWorkflow, /NEXT_PUBLIC_ROOM_BRAIN_WS_URL/);
  assert.match(webWorkflow, /ROOM_BRAIN_ALLOWED_HOSTS/);

  assert.equal(webWrangler.build, undefined);
  assert.equal(webWrangler.vars, undefined);
  assert.deepEqual(
    new Set(webWrangler.secrets.required),
    new Set([
      "SUPABASE_SERVICE_ROLE_KEY",
      "ROOM_BRAIN_AUTH_SECRET",
      "MEDIA_SESSION_AUTH_SECRET",
      "MEDIA_RECONCILIATION_SECRET",
      "REALTIMEKIT_APP_ID",
      "CLOUDFLARE_REALTIME_API_TOKEN",
      "REALTIMEKIT_SUBSCRIBE_ONLY_PRESET",
      "REALTIMEKIT_PUBLISHER_PRESET",
      "OPENAI_API_KEY",
    ]),
  );
});

test("Room Brain has independent deployment ownership and required Worker secrets", () => {
  assert.match(
    roomBrainWorkflow,
    /--config services\/room-brain-worker\/wrangler\.jsonc/,
  );
  assert.match(roomBrainWorkflow, /--secrets-file/);
  assert.match(roomBrainWorkflow, /ROOM_BRAIN_AUTH_SECRET/);
  assert.match(roomBrainWorkflow, /MEDIA_SESSION_AUTH_SECRET/);
  assert.deepEqual(roomBrainWrangler.secrets.required, [
    "ROOM_BRAIN_AUTH_SECRET",
    "MEDIA_SESSION_AUTH_SECRET",
  ]);
});

test("GitHub Pages is explicitly a non-production static preview", () => {
  assert.match(
    pagesWorkflow,
    /Publish Ponder\+ Static Preview \(non-production\)/,
  );
});
