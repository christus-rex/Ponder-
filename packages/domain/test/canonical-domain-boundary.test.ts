import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const models = readFileSync("packages/domain/src/models.ts", "utf8");
const index = readFileSync("packages/domain/src/index.ts", "utf8");
const domainDoc = readFileSync("docs/DOMAIN_MODEL.md", "utf8");
const architectureDoc = readFileSync("docs/ARCHITECTURE.md", "utf8");
const experimentsDoc = readFileSync("docs/EXPERIMENTS.md", "utf8");

test("canonical domain exports do not contain the obsolete worlds/demo-economy model", () => {
  assert.doesNotMatch(models, /\bWorld(Id|Visibility)?\b/);
  assert.doesNotMatch(models, /\bGift(CatalogItem|Event)\b/);
  assert.doesNotMatch(models, /\bLedgerEntry\b/);
  assert.doesNotMatch(models, /PONDER_DEMO/);
  assert.doesNotMatch(index, /economy\.ts/);
});

test("canonical architecture documents the real Room Brain and RealtimeKit authority chain", () => {
  assert.match(architectureDoc, /Room Brain/);
  assert.match(architectureDoc, /RealtimeKit/);
  assert.match(architectureDoc, /browser cannot submit role, preset, provider host, provider secret, or meeting ID/i);
  assert.match(domainDoc, /entry states:[\s\S]*active[\s\S]*ejected/i);
  assert.doesNotMatch(domainDoc, /PONDER_DEMO/);
});

test("prototype surfaces are explicitly quarantined as non-canonical", () => {
  assert.match(experimentsDoc, /not.*alternate production architectures/i);
  assert.match(experimentsDoc, /demo\//);
  assert.match(experimentsDoc, /preview\//);
  assert.match(experimentsDoc, /Base Sepolia/);
});
