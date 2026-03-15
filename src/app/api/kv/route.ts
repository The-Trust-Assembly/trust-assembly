import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-utils";

// Key-value store backed by PostgreSQL
// This bridges the frontend's sG/sS storage pattern to a real database
//
// SECURITY: The KV store is a DERIVED VIEW of the relational tables.
// All legitimate writes happen server-side through vote-resolution,
// submission creation, and admin backfill routes. The POST endpoint
// is restricted to admin users only.

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

// Keys that contain critical data and should ONLY be written by server-side
// pipelines (vote-resolution, submission creation, admin backfill).
// The browser extension reads from these — a forged write here means forged
// corrections appearing for every user on every matching URL.
const PROTECTED_KEYS = [
  "ta-s-v5",   // All submissions (the most critical key)
];

export async function POST(request: NextRequest) {
  // Authentication required for all writes.
  const { getCurrentUserFromRequest } = await import("@/lib/auth");
  const session = await getCurrentUserFromRequest(request);
  if (!session) return forbidden("Authentication required");

  const body = await request.json();
  const { key, value } = body;
  if (!key) return err("key is required");

  // Protected keys require admin access. These contain the data that the
  // browser extension serves to users — allowing any authenticated user to
  // overwrite them would let a single compromised account forge verdicts.
  if (PROTECTED_KEYS.includes(key)) {
    const admin = await requireAdmin(request);
    if (!admin) {
      return forbidden(
        `Key "${key}" is protected. Submissions data is written exclusively ` +
        `through server-side pipelines (POST /api/submissions, vote resolution). ` +
        `Direct KV writes to this key require admin access.`
      );
    }
    // Audit log admin writes to protected keys
    await sql`
      INSERT INTO audit_log (action, user_id, entity_type, metadata)
      VALUES ('Admin: KV store write (protected key)', ${admin.sub}, 'kv_store', ${JSON.stringify({ key, adminUsername: admin.username })})
    `;
  }

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
