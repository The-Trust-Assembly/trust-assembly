import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

// Key-value store backed by PostgreSQL
// This bridges the frontend's sG/sS storage pattern to a real database

export async function GET(request: NextRequest) {
  // Reads are unauthenticated — the app needs to read users/session data
  // to bootstrap login. All data on this platform is public by design.
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return err("key is required");

  // Ensure table exists (idempotent)
  await ensureTable();

  const result = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
  if (result.rows.length === 0) {
    return ok({ key, value: null });
  }
  return ok({ key, value: result.rows[0].value });
}

export async function POST(request: NextRequest) {
  // Writes are unauthenticated — the frontend manages its own auth logic
  // via session tokens in the KV store itself. The login/register flow
  // needs to write session data before a server-side cookie may exist.
  const body = await request.json();
  const { key, value } = body;
  if (!key) return err("key is required");

  await ensureTable();

  await sql`
    INSERT INTO kv_store (key, value, updated_at)
    VALUES (${key}, ${value}, now())
    ON CONFLICT (key)
    DO UPDATE SET value = ${value}, updated_at = now()
  `;

  return ok({ key, saved: true });
}

let tableChecked = false;
async function ensureTable() {
  if (tableChecked) return;
  await sql`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  tableChecked = true;
}
