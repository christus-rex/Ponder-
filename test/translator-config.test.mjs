import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTranslationSessionRequest,
  normalizeTargetLanguage,
  safetyIdentifier,
} from "../demo/translator-config.mjs";

test("normalizes supported language codes", () => {
  assert.equal(normalizeTargetLanguage(" ES "), "es");
});

test("rejects unsupported language codes", () => {
  assert.throws(() => normalizeTargetLanguage("xx"), RangeError);
});

test("builds the dedicated realtime translation session shape", () => {
  assert.deepEqual(buildTranslationSessionRequest("fr"), {
    session: {
      model: "gpt-realtime-translate",
      audio: {
        output: {
          language: "fr",
        },
      },
    },
  });
});

test("safety identifiers are stable hashes rather than raw IDs", () => {
  const raw = "user-123";
  const hashed = safetyIdentifier(raw);

  assert.equal(hashed, safetyIdentifier(raw));
  assert.notEqual(hashed, raw);
  assert.match(hashed, /^[a-f0-9]{64}$/);
});
