import assert from "node:assert/strict";
import test from "node:test";
import { verifyMigrationHistory } from "../scripts/verify-supabase-migrations-current.mjs";

const header = `\n  Local          | Remote         | Time (UTC)\n ----------------|----------------|---------------------\n`;

test("accepts matching local and remote migration history", () => {
  const output = `${header} 20260830193000 | 20260830193000 | 2026-08-30 19:30:00\n 20260831092000 | 20260831092000 | 2026-08-31 09:20:00\n`;
  assert.deepEqual(verifyMigrationHistory(output), [
    "20260830193000",
    "20260831092000",
  ]);
});

test("rejects a local migration that has not reached production", () => {
  const output = `${header} 20260830193000 | 20260830193000 | 2026-08-30 19:30:00\n 20260831092000 |                | 2026-08-31 09:20:00\n`;
  assert.throws(
    () => verifyMigrationHistory(output),
    /remote=missing/,
  );
});

test("rejects production migration history not represented locally", () => {
  const output = `${header} 20260830193000 | 20260830193000 | 2026-08-30 19:30:00\n                | 20260831092000 | 2026-08-31 09:20:00\n`;
  assert.throws(
    () => verifyMigrationHistory(output),
    /local=missing/,
  );
});

test("fails closed if Supabase CLI output format cannot be parsed", () => {
  assert.throws(
    () => verifyMigrationHistory("Connected to project, but no table was emitted."),
    /could not be parsed/,
  );
});

test("ignores ANSI color codes around migration versions", () => {
  const output = `${header} \u001b[32m20260830193000\u001b[0m | \u001b[32m20260830193000\u001b[0m | 2026-08-30 19:30:00\n`;
  assert.deepEqual(verifyMigrationHistory(output), ["20260830193000"]);
});
