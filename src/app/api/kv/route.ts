import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-utils";

// Key-value store backed by PostgreSQL
// DEPRECATED: All production read paths now use relational tables directly.
// This endpoint is retained only for legacy SPA compatibility.
// Track usage to determine when it can be removed.

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return err("key is required");

  console.warn(`[DEPRECATED] KV GET: key="${key}" — migrate to relational endpoints`);

  // Ensure table exists (idempotent)
  await ensureTable();

  const result = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
  if (result.rows.length === 0) {
    return new Response(JSON.stringify({ key, value: null }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Sunset": "2026-06-01",
        "Deprecation": "true",
      },
    });
  }

  return new Response(JSON.stringify({ key, value: result.rows[0].value }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Sunset": "2026-06-01",
      "Deprecation": "true",
    },
  });
}

export async function POST(request: NextRequest) {
  // Authentication required for all writes — admin only.
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("KV store writes require admin access. This endpoint is deprecated.");

  console.warn(`[DEPRECATED] KV POST by admin ${admin.username} — migrate to relational endpoints`);

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

  // Audit log
  await sql`
    INSERT INTO audit_log (action, user_id, entity_type, metadata)
    VALUES ('Admin: KV store write (deprecated)', ${admin.sub}, 'kv_store', ${JSON.stringify({ key, adminUsername: admin.username })})
  `;

  return new Response(JSON.stringify({ key, saved: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Sunset": "2026-06-01",
      "Deprecation": "true",
    },
  });
}

// Table is created by db/schema.sql — no runtime DDL needed.
// Retained as a no-op for existing call sites until this route is removed.
async function ensureTable() {}
