import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/deploy-supabase-migrations.yml",
  "utf8",
);
const webDeployWorkflow = readFileSync(
  ".github/workflows/deploy-cloudflare.yml",
  "utf8",
);
const config = readFileSync("supabase/config.toml", "utf8");

test("Supabase production migration workflow plans before any apply", () => {
  const firstDryRun = workflow.indexOf("supabase db push --linked --dry-run");
  const apply = workflow.lastIndexOf("supabase db push --linked");
  assert.ok(firstDryRun >= 0);
  assert.ok(apply > firstDryRun);
  assert.match(workflow, /inputs\.apply == true/);
  assert.match(workflow, /environment: production-database/);
  assert.match(workflow, /supabase migration list/);
});

test("Supabase migration deployment cannot silently rewrite history or reset production", () => {
  assert.doesNotMatch(workflow, /migration repair/);
  assert.doesNotMatch(workflow, /db reset/);
  assert.doesNotMatch(workflow, /--include-all/);
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN/);
  assert.match(workflow, /SUPABASE_DB_PASSWORD/);
  assert.match(workflow, /wjqcjlcmgeujndxvtprj/);
});

test("web deployment cannot outrun production Supabase migrations", () => {
  const schemaGate = webDeployWorkflow.indexOf(
    "Require current production migration history",
  );
  const deploy = webDeployWorkflow.indexOf(
    "Deploy authenticated Ponder+ Worker",
  );

  assert.ok(schemaGate >= 0);
  assert.ok(deploy > schemaGate);
  assert.match(webDeployWorkflow, /supabase\/setup-cli@v1/);
  assert.match(webDeployWorkflow, /supabase migration list/);
  assert.match(
    webDeployWorkflow,
    /node scripts\/verify-supabase-migrations-current\.mjs/,
  );
  assert.match(webDeployWorkflow, /SUPABASE_ACCESS_TOKEN/);
  assert.match(webDeployWorkflow, /SUPABASE_DB_PASSWORD/);
});

test("Supabase CLI project configuration is committed without secrets", () => {
  assert.match(config, /project_id = "ponder-plus"/);
  assert.doesNotMatch(config, /password|access_token|service_role/i);
});
