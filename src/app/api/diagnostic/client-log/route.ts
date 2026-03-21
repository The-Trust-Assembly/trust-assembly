import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { logError } from "@/lib/error-logger";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_PAYLOAD_BYTES = 50 * 1024; // 50KB

// POST /api/diagnostic/client-log — receive client action logs
// Any authenticated user can submit their action log for diagnostics.
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized("Authentication required");

  // Per-user rate limit: 5 flushes per 10-minute window
  const rateCheck = checkRateLimit(
    `client-log:${session.sub}`,
    5,
    10 * 60 * 1000,
  );
  if (!rateCheck.allowed) {
    return err(`Rate limit exceeded. Retry after ${rateCheck.retryAfterSeconds}s`, 429);
  }

  // Payload size limit
  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return err("Payload too large (max 50KB)", 413);
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_PAYLOAD_BYTES) {
      return err("Payload too large (max 50KB)", 413);
    }
    body = JSON.parse(text);
  } catch {
    return err("Invalid JSON body");
  }

  const entries = body.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return err("entries must be a non-empty array");
  }

  // Cap at 200 entries per flush to prevent abuse
  const capped = entries.slice(0, 200);

  // Truncate any field values longer than 5,000 characters
  const sanitized = capped.map((e: Record<string, unknown>) => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(e)) {
      if (typeof value === "string" && value.length > 5000) {
        clean[key] = value.slice(0, 5000) + "...[truncated]";
      } else {
        clean[key] = value;
      }
    }
    return clean;
  });

  // Extract error entries for prominent storage
  const errors = sanitized.filter((e: Record<string, unknown>) => e.ok === false);
  const summary = {
    totalEntries: sanitized.length,
    errorCount: errors.length,
    categories: [...new Set(sanitized.map((e: Record<string, unknown>) => e.category))],
    screens: [...new Set(sanitized.map((e: Record<string, unknown>) => e.screen).filter(Boolean))],
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

  // Also write error entries to client_errors for unified admin visibility
  if (errors.length > 0) {
    for (const errorEntry of errors.slice(0, 20)) {
      await logError({
        userId: session.sub,
        sessionInfo: session.username,
        errorType: "client_error",
        error: String(errorEntry.error ?? errorEntry.action ?? "Client-side error"),
        apiRoute: "/api/diagnostic/client-log",
        sourceFile: String(errorEntry.component ?? "client"),
        sourceFunction: String(errorEntry.action ?? "unknown"),
        lineContext: errorEntry.screen ? `Screen: ${errorEntry.screen}` : undefined,
        httpMethod: "POST",
        httpStatus: 0, // client-side errors don't have an HTTP status
        requestUrl: String(errorEntry.screen ?? "/"),
      });
    }
  }

  return ok({ stored: true, entryCount: sanitized.length, errorCount: errors.length });
}
