import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const connectionString = process.env.TEST_POSTGRES_URL;

if (!connectionString) {
  throw new Error("TEST_POSTGRES_URL is required and must identify a disposable test database");
}

const parsedConnection = new URL(connectionString);
const databaseName = parsedConnection.pathname.replace(/^\//, "");
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!localHosts.has(parsedConnection.hostname.toLowerCase())) {
  throw new Error("Migration tests may run only against a loopback PostgreSQL server");
}
if (!/(?:_test|_ci)$/.test(databaseName)) {
  throw new Error(`Refusing to reset database '${databaseName}'; its name must end in _test or _ci`);
}

const client = new Client({ connectionString });
await client.connect();

try {
  // TEST_POSTGRES_URL is deliberately constrained above because this reset is
  // destructive. A clean schema catches assumptions hidden by developer data.
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");

  const schemaSql = await readFile(path.join(repositoryRoot, "db", "schema.sql"), "utf8");
  await client.query(schemaSql);

  const migrationDirectory = path.join(repositoryRoot, "db", "migrations");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter(filename => filename.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  assert.ok(migrationFiles.length > 0, "expected at least one database migration");
  for (const filename of migrationFiles) {
    const sql = await readFile(path.join(migrationDirectory, filename), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration failed: ${filename}`, { cause: error });
    }
  }

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
