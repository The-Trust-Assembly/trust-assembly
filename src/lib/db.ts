import { sql as vercelSql } from "@vercel/postgres";
import type { VercelPoolClient } from "@vercel/postgres";
import { Pool as NodePostgresPool } from "pg";
import { isLocalPostgresUrl } from "@/lib/development-environment";

type Primitive = string | number | boolean | undefined | null;

const connectionString = process.env.POSTGRES_URL;

const useLocalPostgres = isLocalPostgresUrl(connectionString);
const globalForDatabase = globalThis as typeof globalThis & {
  trustAssemblyLocalPostgresPool?: NodePostgresPool;
};

function getLocalPool(): NodePostgresPool {
  if (!connectionString) {
    throw new Error("POSTGRES_URL is required to connect to PostgreSQL");
  }

  // Preserve the pool during Next.js development hot reloads so each reload
  // does not leave another set of connections open.
  globalForDatabase.trustAssemblyLocalPostgresPool ??= new NodePostgresPool({
    connectionString,
  });
  return globalForDatabase.trustAssemblyLocalPostgresPool;
}

async function localTaggedQuery(
  strings: TemplateStringsArray,
  ...values: Primitive[]
) {
  let query = strings[0] ?? "";
  for (let index = 1; index < strings.length; index += 1) {
    query += `$${index}${strings[index] ?? ""}`;
  }
  return getLocalPool().query(query, values);
}

const localSql = Object.assign(localTaggedQuery, {
  query: (query: string, values?: unknown[]) => getLocalPool().query(query, values),
  connect: () => getLocalPool().connect(),
});

/**
 * Database interface shared by production and local development.
 *
 * Hosted Vercel/Neon databases keep using @vercel/postgres. A localhost
 * POSTGRES_URL uses node-postgres because Neon's stateless HTTP query
 * transport cannot connect to a normal PostgreSQL server on port 5432.
 */
export const sql = (useLocalPostgres ? localSql : vercelSql) as typeof vercelSql;

/**
 * Execute a callback inside a real database transaction.
 *
 * Uses sql.connect() to get a dedicated pooled connection.
 *
 * Usage:
 *   const result = await withTransaction(async (client) => {
 *     await client.query('INSERT INTO ...', [params]);
 *     await client.query('UPDATE ...', [params]);
 *     return someValue;
 *   });
 */
export async function withTransaction<T>(
  fn: (client: VercelPoolClient) => Promise<T>
): Promise<T> {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Check whether a user is an active member of an organization. */
export async function checkOrgMembership(orgId: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${orgId} AND user_id = ${userId} AND is_active = TRUE
    LIMIT 1
  `;
  return result.rows.length > 0;
}
