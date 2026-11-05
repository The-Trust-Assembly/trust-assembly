import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export function validateDisposableDatabaseUrl(connectionString) {
  if (!connectionString) {
    throw new Error("TEST_POSTGRES_URL is required and must identify a disposable test database");
  }

  const parsedConnection = new URL(connectionString);
  const databaseName = parsedConnection.pathname.replace(/^\//, "");
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!localHosts.has(parsedConnection.hostname.toLowerCase())) {
    throw new Error("Database tests may run only against a loopback PostgreSQL server");
  }
  if (!/(?:_test|_ci)$/.test(databaseName)) {
    throw new Error(`Refusing to reset database '${databaseName}'; its name must end in _test or _ci`);
  }

  return { databaseName, parsedConnection };
}

export async function resetAndMigrateDatabase(client, repositoryRoot) {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");

  const schemaSql = await readFile(path.join(repositoryRoot, "db", "schema.sql"), "utf8");
  await client.query(schemaSql);

  const migrationDirectory = path.join(repositoryRoot, "db", "migrations");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter(filename => filename.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

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

  return migrationFiles;
}
