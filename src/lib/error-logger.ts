// ============================================================
// Error Logger — writes structured errors to client_errors table
// with deduplication (100-instance cap) and never-throw guarantee.
// ============================================================

import { sql } from "@/lib/db";

/** Fields that should be stripped from request bodies before logging */
const SENSITIVE_FIELDS = new Set([
  "password", "password_hash", "token", "secret", "api_key",
  "authorization", "access_token", "refresh_token", "apikey",
  "passwd", "credential", "private_key", "session_token",
]);

/** Max length for any single string field stored in client_errors */
const MAX_FIELD_LENGTH = 5000;

type ErrorType = "api_error" | "transaction_error" | "validation_error" | "auth_error" | "client_error";

export interface LogErrorParams {
  userId?: string | null;
  sessionInfo?: string | null;
  errorType: ErrorType;
  error: Error | string;
  apiRoute: string;
  sourceFile: string;
  sourceFunction: string;
  lineContext?: string;
  requestBody?: object | null;
  entityType?: string;
  entityId?: string;
  httpMethod: string;
  httpStatus: number;
  requestUrl?: string;
}

/**
 * Sanitize an object by removing sensitive fields and truncating long values.
 */
function sanitizeBody(obj: unknown): object | null {
  if (!obj || typeof obj !== "object") return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "string" && value.length > MAX_FIELD_LENGTH) {
      result[key] = value.slice(0, MAX_FIELD_LENGTH) + "...[truncated]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeBody(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Truncate a string to MAX_FIELD_LENGTH */
function truncate(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.length > MAX_FIELD_LENGTH ? s.slice(0, MAX_FIELD_LENGTH) + "...[truncated]" : s;
}

/**
 * Log an error to the client_errors table.
 *
 * Implements deduplication: if the same (api_route, source_function, error_message)
 * pattern already has 100+ unresolved entries in the last 30 days, increments
 * duplicate_count on the most recent row instead of inserting a new one.
 *
 * NEVER throws — swallows its own errors and console.error's them.
 */
export async function logError(params: LogErrorParams): Promise<void> {
  try {
    const errorMessage = truncate(
      params.error instanceof Error ? params.error.message : String(params.error)
    ) ?? "Unknown error";

    const errorStack = truncate(
      params.error instanceof Error ? params.error.stack ?? null : null
    );

    const sanitizedBody = params.requestBody ? sanitizeBody(params.requestBody) : null;

    // Deduplication check: same pattern with 100+ unresolved entries?
    const dedupCheck = await sql`
      SELECT id, duplicate_count FROM client_errors
      WHERE api_route = ${params.apiRoute}
        AND source_function = ${params.sourceFunction}
        AND error_message = ${errorMessage}
        AND resolved = FALSE
        AND created_at > now() - interval '30 days'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (dedupCheck.rows.length > 0 && dedupCheck.rows[0].duplicate_count >= 99) {
      // Cap reached — increment counter on existing row
      await sql`
        UPDATE client_errors
        SET duplicate_count = duplicate_count + 1,
            last_duplicate_at = now()
        WHERE id = ${dedupCheck.rows[0].id}
      `;
      return;
    }

    // Insert new error entry
    await sql`
      INSERT INTO client_errors (
        user_id, session_info, error_type, error_message, error_stack,
        api_route, source_file, source_function, line_context,
        request_body, entity_type, entity_id,
        http_method, http_status, request_url
      ) VALUES (
        ${params.userId ?? null},
        ${truncate(params.sessionInfo) ?? null},
        ${params.errorType},
        ${errorMessage},
        ${errorStack},
        ${params.apiRoute},
        ${params.sourceFile},
        ${params.sourceFunction},
        ${truncate(params.lineContext) ?? null},
        ${sanitizedBody ? JSON.stringify(sanitizedBody) : null}::jsonb,
        ${params.entityType ?? null},
        ${params.entityId ?? null},
        ${params.httpMethod},
        ${params.httpStatus},
        ${params.requestUrl}
      )
    `;
  } catch (e) {
    // Never let error logging break the request
    console.error("[error-logger] Failed to log error:", e);
  }
}
