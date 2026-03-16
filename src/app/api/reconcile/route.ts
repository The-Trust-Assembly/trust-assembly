import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err } from "@/lib/api-utils";

// POST /api/reconcile — Migrate KV store records to relational tables.
// Admin-only. Reads data from kv_store table and inserts missing records
// into the proper relational tables. Idempotent — safe to run multiple times.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const report: string[] = [];
  let migratedCount = 0;

  try {
    // ── Migrate submissions from KV ──
    const kvSubs = await sql`SELECT value FROM kv_store WHERE key LIKE 'ta-s-%'`;
    if (kvSubs.rows.length > 0 && kvSubs.rows[0].value) {
      const subsObj = JSON.parse(kvSubs.rows[0].value);
      for (const [subId, sub] of Object.entries(subsObj as Record<string, Record<string, unknown>>)) {
        // Check if submission already exists in relational table
        const existing = await sql`SELECT id FROM submissions WHERE id = ${subId}`;
        if (existing.rows.length > 0) continue;

        // Look up user ID by username
        const submitter = sub.submittedBy as string;
        if (!submitter) continue;
        const userResult = await sql`SELECT id FROM users WHERE username = ${submitter.toLowerCase()}`;
        if (userResult.rows.length === 0) {
          report.push(`SKIP submission ${subId}: submitter @${submitter} not found in users table`);
          continue;
        }
        const userId = userResult.rows[0].id;

        // Look up org
        const orgId = sub.orgId as string;
        if (!orgId) continue;
        const orgResult = await sql`SELECT id FROM organizations WHERE id = ${orgId}`;
        if (orgResult.rows.length === 0) {
          report.push(`SKIP submission ${subId}: org ${orgId} not found`);
          continue;
        }

        try {
          await sql`
            INSERT INTO submissions (
              id, submission_type, status, url, original_headline, replacement,
              reasoning, author, submitted_by, org_id, trusted_skip, is_di,
              jury_seats, created_at, resolved_at
            ) VALUES (
              ${subId},
              ${(sub.submissionType as string) || 'correction'},
              ${(sub.status as string) || 'pending_review'},
              ${(sub.url as string) || ''},
              ${(sub.originalHeadline as string) || ''},
              ${(sub.replacement as string) || null},
              ${(sub.reasoning as string) || ''},
              ${(sub.author as string) || null},
              ${userId},
              ${orgId},
              ${(sub.trustedSkip as boolean) || false},
              ${(sub.isDI as boolean) || false},
              ${(sub.jurySeats as number) || null},
              ${(sub.createdAt as string) || new Date().toISOString()},
              ${(sub.resolvedAt as string) || null}
            )
            ON CONFLICT (id) DO NOTHING
          `;
          migratedCount++;
          report.push(`OK submission ${subId}: migrated from KV`);
        } catch (e) {
          report.push(`ERR submission ${subId}: ${(e as Error).message}`);
        }
      }
    }

    // ── Migrate audit entries from KV ──
    const kvAudit = await sql`SELECT value FROM kv_store WHERE key LIKE 'ta-a-%'`;
    if (kvAudit.rows.length > 0 && kvAudit.rows[0].value) {
      const auditEntries = JSON.parse(kvAudit.rows[0].value);
      if (Array.isArray(auditEntries)) {
        for (const entry of auditEntries) {
          if (!entry.action || !entry.time) continue;
          // Check for approximate duplicate (same action within 1 second)
          const existing = await sql`
            SELECT id FROM audit_log
            WHERE action = ${entry.action}
              AND created_at BETWEEN ${new Date(new Date(entry.time).getTime() - 1000).toISOString()}
                             AND ${new Date(new Date(entry.time).getTime() + 1000).toISOString()}
            LIMIT 1
          `;
          if (existing.rows.length > 0) continue;

          try {
            await sql`
              INSERT INTO audit_log (action, entity_type, created_at)
              VALUES (${entry.action}, 'kv_migration', ${entry.time})
            `;
            migratedCount++;
          } catch (e) {
            report.push(`ERR audit entry: ${(e as Error).message}`);
          }
        }
        report.push(`Processed ${auditEntries.length} audit entries from KV`);
      }
    }

    // ── Report on other KV keys ──
    const allKeys = await sql`SELECT key, LENGTH(value) AS size FROM kv_store ORDER BY key`;
    report.push(`\n--- KV Store Contents ---`);
    for (const row of allKeys.rows) {
      report.push(`  ${row.key}: ${row.size} bytes`);
    }

    await sql`
      INSERT INTO audit_log (action, user_id, entity_type, metadata)
      VALUES (
        'KV store reconciliation completed',
        ${admin.sub},
        'kv_migration',
        ${JSON.stringify({ migratedCount, reportLines: report.length })}
      )
    `;

    return ok({
      success: true,
      migratedCount,
      report,
    });
  } catch (e) {
    return err(`Reconciliation failed: ${(e as Error).message}`, 500);
  }
}
