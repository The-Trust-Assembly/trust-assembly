// ============================================================
// Activity Logger — records every meaningful backend action
// for the diagnostic report. Uses the audit_log table with
// structured metadata so errors are human-readable.
// ============================================================

import { sql } from "@/lib/db";

export interface ActionContext {
  userId?: string | null;
  username?: string | null;
  orgId?: string | null;
  entityType: string;       // "submission" | "dispute" | "vote" | "org" | "user" | "vault" | ...
  entityId?: string | null;
  action: string;            // human-readable: "submit_correction", "cast_vote", "join_org"
  status: "success" | "error" | "denied";
  durationMs?: number;
  errorMessage?: string | null;
  errorStack?: string | null;
  requestMethod?: string;
  requestPath?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log a backend action to audit_log with structured metadata.
 * Never throws — swallows errors so logging never breaks the request.
 */
export async function logAction(ctx: ActionContext): Promise<void> {
  try {
    const meta = {
      status: ctx.status,
      durationMs: ctx.durationMs ?? null,
      errorMessage: ctx.errorMessage ?? null,
      errorStack: ctx.errorStack ? ctx.errorStack.split("\n").slice(0, 5).join("\n") : null,
      requestMethod: ctx.requestMethod ?? null,
      requestPath: ctx.requestPath ?? null,
      ...(ctx.metadata ?? {}),
    };

    await sql`
      INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata, created_at)
      VALUES (
        ${ctx.action},
        ${ctx.userId ?? null},
        ${ctx.orgId ?? null},
        ${ctx.entityType},
        ${ctx.entityId ?? null},
        ${JSON.stringify(meta)},
        now()
      )
    `;
  } catch (e) {
    // Never let logging break the request
    console.error("[activity-logger] Failed to write audit entry:", e);
  }
}

/**
 * Wrap an async handler with automatic timing + error logging.
 * Returns the handler's result on success, or re-throws after logging on failure.
 */
export async function withActionLog<T>(
  ctx: Omit<ActionContext, "status" | "durationMs" | "errorMessage" | "errorStack">,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await logAction({
      ...ctx,
      status: "success",
      durationMs: Date.now() - start,
    });
    return result;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    await logAction({
      ...ctx,
      status: "error",
      durationMs: Date.now() - start,
      errorMessage: err.message,
      errorStack: err.stack ?? null,
    });
    throw e;
  }
}
