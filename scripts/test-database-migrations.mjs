import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  resetAndMigrateDatabase,
  validateDisposableDatabaseUrl,
} from "./test-database-helpers.mjs";

const { Client } = pg;
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const connectionString = process.env.TEST_POSTGRES_URL;

if (!connectionString) {
  throw new Error("TEST_POSTGRES_URL is required and must identify a disposable test database");
}

const { databaseName } = validateDisposableDatabaseUrl(connectionString);

const client = new Client({ connectionString });
await client.connect();

try {
  // TEST_POSTGRES_URL is deliberately constrained above because this reset is
  // destructive. A clean schema catches assumptions hidden by developer data.
  const migrationFiles = await resetAndMigrateDatabase(client, repositoryRoot);
  assert.ok(migrationFiles.length > 0, "expected at least one database migration");

  const requiredTables = [
    "users",
    "organizations",
    "organization_members",
    "submissions",
    "submission_evidence",
    "jury_assignments",
    "jury_votes",
    "agent_runs",
    "agent_instances",
    "site_flags",
    "agent_run_artifacts",
    "agent_prompts",
  ];
  const tableResult = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const existingTables = new Set(tableResult.rows.map(row => row.table_name));
  assert.deepEqual(
    requiredTables.filter(table => !existingTables.has(table)),
    [],
    "schema and migrations must create every required table",
  );

  const columnResult = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name = ANY($1::text[])`,
    [["email_verified", "is_admin", "agent_credits"]],
  );
  const existingColumns = new Set(columnResult.rows.map(row => row.column_name));
  assert.deepEqual(
    ["email_verified", "is_admin", "agent_credits"].filter(column => !existingColumns.has(column)),
    [],
    "users must include current authentication and agent columns",
  );

  console.log(`Database schema and ${migrationFiles.length} migrations passed on ${databaseName}.`);
} finally {
  await client.end();
}
