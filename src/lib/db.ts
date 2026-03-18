import { sql } from "@vercel/postgres";
import type { VercelPoolClient } from "@vercel/postgres";

// Re-export the sql tagged template from @vercel/postgres.
// Vercel Postgres reads POSTGRES_URL from environment automatically.
// For local dev, set POSTGRES_URL in .env.local.
//
// IMPORTANT: The sql`` tagged template uses the neon() HTTP driver under the
// hood. Each sql`` call creates a new stateless HTTP request — there is NO
// persistent connection. This means BEGIN/COMMIT/ROLLBACK across separate
// sql`` calls are NO-OPS (each runs on a different connection).
//
// For real transactions, use withTransaction() below, which calls
// sql.connect() to get a dedicated pooled connection.
export { sql };

/**
 * Execute a callback inside a real database transaction.
 *
 * Uses sql.connect() to get a dedicated pooled connection (NOT the stateless
 * neon HTTP driver). BEGIN/COMMIT/ROLLBACK actually work on this connection.
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
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
