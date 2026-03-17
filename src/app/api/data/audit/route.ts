import { sql } from "@/lib/db";
import { ok } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/data/audit — returns audit log entries as an array
// in the format the v5 SPA expects: [{ time, action }, ...]
// Merges two sources:
//   1. Relational audit_log table (new entries from API endpoints)
//   2. Legacy KV store key "ta-a-v5" (migrated historical data)
export async function GET() {
  // 1. Relational audit_log entries
  const result = await sql`
    SELECT
      al.action, al.created_at,
      u.username
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at ASC
    LIMIT 5000
  `;

  const relationalEntries = result.rows.map((row: Record<string, unknown>) => ({
    time: row.created_at,
    action: row.action as string,
  }));

  // 2. Legacy KV store entries (migrated from the old KV-backed audit log)
  let kvEntries: Array<{ time: unknown; action: string }> = [];
  try {
    const kvResult = await sql`SELECT value FROM kv_store WHERE key = 'ta-a-v5'`;
    if (kvResult.rows.length > 0 && kvResult.rows[0].value) {
      const raw = kvResult.rows[0].value;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        kvEntries = parsed.filter((e: Record<string, unknown>) => e && e.action);
      }
    }
  } catch {
    // KV table may not exist or data may be malformed — skip gracefully
  }

  // Merge: KV entries first (historical), then relational (newer).
  // Deduplicate by checking if a relational entry already covers the same action+time.
  const relSet = new Set(
    relationalEntries.map(e => `${e.action}::${String(e.time)}`)
  );
  const uniqueKv = kvEntries.filter(
    e => !relSet.has(`${e.action}::${String(e.time)}`)
  );

  const all = [...uniqueKv, ...relationalEntries];
  // Sort chronologically (oldest first) — the SPA reverses to show newest first
  all.sort((a, b) => new Date(String(a.time)).getTime() - new Date(String(b.time)).getTime());

  return ok(all);
}
