import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// POST /api/diagnostic/client-log — receive client action logs
// Any authenticated user can submit their action log for diagnostics.
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized("Authentication required");

  const body = await request.json();
  const entries = body.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return err("entries must be a non-empty array");
  }

  // Cap at 200 entries per flush to prevent abuse
  const capped = entries.slice(0, 200);

  // Extract error entries for prominent storage
  const errors = capped.filter((e: Record<string, unknown>) => e.ok === false);
  const summary = {
    totalEntries: capped.length,
    errorCount: errors.length,
    categories: [...new Set(capped.map((e: Record<string, unknown>) => e.category))],
    screens: [...new Set(capped.map((e: Record<string, unknown>) => e.screen).filter(Boolean))],
    errors: errors.slice(0, 20).map((e: Record<string, unknown>) => ({
      action: e.action,
      error: e.error,
      screen: e.screen,
      component: e.component,
      ts: e.ts,
    })),
    flushedAt: new Date().toISOString(),
    username: session.username,
  };

  try {
    await sql`
      INSERT INTO audit_log (action, user_id, entity_type, metadata, created_at)
      VALUES (
        'client_action_log_flush',
        ${session.sub},
        'client_action_log',
        ${JSON.stringify(summary)},
        now()
      )
    `;
  } catch (e) {
    console.error("[diagnostic/client-log] Failed to store:", e);
    return err("Failed to store client log");
  }

  return ok({ stored: true, entryCount: capped.length, errorCount: errors.length });
}
