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

// Submission statuses that indicate review is complete — submitter identity
// can be revealed. Submissions still under review must have their submitter
// identity stripped to prevent bias (M3: submitter anonymity).
const RESOLVED_STATUSES = new Set(["approved", "rejected", "consensus"]);

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return err("key is required");

  // Ensure table exists (idempotent)
  await ensureTable();

  const result = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
  if (result.rows.length === 0) {
    return ok({ key, value: null });
  }

  let value = result.rows[0].value;

  // M3: Protect submitter anonymity for non-resolved submissions.
  // Unauthenticated reads of the submissions blob get submittedBy and
  // anonMap stripped from submissions still under review. Authenticated
  // users (the SPA) get the full data for business logic.
  if (key === "ta-s-v5" && value) {
    const { getCurrentUserFromRequest } = await import("@/lib/auth");
    const session = await getCurrentUserFromRequest(request);
    if (!session) {
      try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (parsed && typeof parsed === "object") {
          const redacted: Record<string, unknown> = {};
          for (const [id, sub] of Object.entries(parsed)) {
            const s = sub as Record<string, unknown>;
            if (!RESOLVED_STATUSES.has(s.status as string)) {
              // Strip identity fields from in-review submissions
              const { submittedBy, anonMap, ...rest } = s;
              redacted[id] = rest;
            } else {
              redacted[id] = s;
            }
          }
          value = JSON.stringify(redacted);
        }
      } catch {
        // If parsing fails, return as-is rather than breaking
      }
    }
  }

  return ok({ key, value });
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
