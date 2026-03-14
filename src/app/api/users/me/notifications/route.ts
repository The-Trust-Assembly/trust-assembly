import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

const SK_USERS = "ta-u-v5";

async function kvGet(key: string): Promise<unknown> {
  const result = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
  if (result.rows.length === 0 || !result.rows[0].value) return null;
  return JSON.parse(result.rows[0].value);
}

// GET /api/users/me/notifications — pending items for the current user
// Returns counts and summaries of:
//   - KV store notifications (lifecycle events from the webapp)
//   - Jury assignments awaiting vote
//   - Membership applications awaiting founder approval
//   - User's own submissions with status updates
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  // 0. KV store notifications (created by createNotification in the webapp)
  let kvNotifications: Record<string, unknown>[] = [];
  try {
    const users = (await kvGet(SK_USERS)) as Record<string, Record<string, unknown>> | null;
    if (users) {
      // Find user by session sub (user ID) — need to look up username first
      const userRow = await sql`SELECT username FROM users WHERE id = ${session.sub}`;
      if (userRow.rows.length > 0) {
        const username = userRow.rows[0].username;
        const u = users[username];
        if (u && Array.isArray(u.notifications)) {
          kvNotifications = u.notifications as Record<string, unknown>[];
        }
      }
    }
  } catch (e) {
    console.error("KV notification read failed:", e);
  }

  // 1. Pending jury assignments (submissions needing vote)
  const juryResult = await sql`
    SELECT
      ja.id, ja.submission_id, ja.dispute_id, ja.concession_id,
      ja.role, ja.assigned_at,
      s.original_headline AS headline,
      s.submission_type,
      s.url,
      o.name AS org_name
    FROM jury_assignments ja
    LEFT JOIN submissions s ON s.id = ja.submission_id
    LEFT JOIN organizations o ON o.id = s.org_id
    WHERE ja.user_id = ${session.sub}
      AND ja.accepted = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM jury_votes jv
        WHERE jv.assignment_id = ja.id
      )
      AND (s.status IN ('pending_review', 'cross_review') OR ja.dispute_id IS NOT NULL OR ja.concession_id IS NOT NULL)
    ORDER BY ja.assigned_at DESC
    LIMIT 20
  `;

  // 2. Pending membership applications (for assemblies user founded)
  const applicationsResult = await sql`
    SELECT
      ma.id, ma.user_id, ma.status, ma.created_at,
      u.username, u.display_name,
      o.id AS org_id, o.name AS org_name
    FROM membership_applications ma
    JOIN users u ON u.id = ma.user_id
    JOIN organizations o ON o.id = ma.org_id
    JOIN organization_members om ON om.org_id = ma.org_id
      AND om.user_id = ${session.sub}
      AND om.is_founder = TRUE
      AND om.is_active = TRUE
    WHERE ma.status = 'pending'
      AND ma.founder_approved = FALSE
    ORDER BY ma.created_at DESC
    LIMIT 20
  `;

  // 3. User's own recent submission status updates (approved/rejected in last 7 days)
  const submissionUpdates = await sql`
    SELECT
      s.id, s.submission_type, s.status, s.original_headline,
      s.url, s.resolved_at,
      o.name AS org_name
    FROM submissions s
    JOIN organizations o ON o.id = s.org_id
    WHERE s.submitted_by = ${session.sub}
      AND s.status IN ('approved', 'consensus', 'rejected', 'consensus_rejected')
      AND s.resolved_at > NOW() - INTERVAL '7 days'
    ORDER BY s.resolved_at DESC
    LIMIT 10
  `;

  const juryCount = juryResult.rows.length;
  const applicationCount = applicationsResult.rows.length;
  const updateCount = submissionUpdates.rows.length;

  return ok({
    totalPending: juryCount + applicationCount,
    notifications: kvNotifications,
    jury: {
      count: juryCount,
      items: juryResult.rows,
    },
    applications: {
      count: applicationCount,
      items: applicationsResult.rows,
    },
    updates: {
      count: updateCount,
      items: submissionUpdates.rows,
    },
  });
}
