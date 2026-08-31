import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MIGRATION_VERSION = /^\d{14}$/;
const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;

export function verifyMigrationHistory(output) {
  const rows = [];

  for (const rawLine of output.replace(ANSI_ESCAPE, "").split(/\r?\n/)) {
    if (!rawLine.includes("|")) continue;
    const columns = rawLine.split("|").map((value) => value.trim());
    if (columns.length < 2) continue;

    const local = columns[0] ?? "";
    const remote = columns[1] ?? "";
    if (!MIGRATION_VERSION.test(local) && !MIGRATION_VERSION.test(remote)) continue;

    rows.push({ local, remote });
  }

  if (rows.length === 0) {
    throw new Error(
      "Supabase migration history could not be parsed; refusing production deploy.",
    );
  }

  const mismatches = rows.filter(
    ({ local, remote }) => local !== remote || !local || !remote,
  );
  if (mismatches.length > 0) {
    const summary = mismatches
      .map(
        ({ local, remote }) =>
          `local=${local || "missing"}, remote=${remote || "missing"}`,
      )
      .join("; ");
    throw new Error(
      `Production Supabase migration history is not current: ${summary}`,
    );
  }

  return rows.map(({ local }) => local);
}

function main() {
  const path = process.argv[2];
  if (!path) {
    throw new Error("Migration history file path is required.");
  }

  const versions = verifyMigrationHistory(readFileSync(path, "utf8"));
  console.log(
    `Production Supabase migration history is current (${versions.length} migrations).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
