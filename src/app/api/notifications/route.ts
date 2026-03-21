import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

// GET /api/notifications — shorthand for /api/users/me/notifications
// Returns lifecycle notifications, pending jury assignments,
// membership applications, and recent submission status updates.
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  // Lifecycle notifications from the notifications table
  const notifResult = await sql`
    SELECT id, type, title, body, entity_type, entity_id, "read", created_at
    FROM notifications
    WHERE user_id = ${session.sub}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  // Pending jury assignments (submissions needing vote)
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
        WHERE jv.submission_id = ja.submission_id
          AND jv.user_id = ja.user_id
          AND jv.role = ja.role
      )
      AND (s.status IN ('pending_review', 'cross_review') OR ja.dispute_id IS NOT NULL OR ja.concession_id IS NOT NULL)
    ORDER BY ja.assigned_at DESC
    LIMIT 20
  `;

  // Pending membership applications (for assemblies user founded)
  const applicationsResult = await sql`
    SELECT
      ma.id, ma.user_id, ma.status, ma.created_at,
      u.username, u.display_name,
      ma.org_id, o.name AS org_name
    FROM membership_applications ma
    LEFT JOIN users u ON u.id = ma.user_id
    LEFT JOIN organizations o ON o.id = ma.org_id
    LEFT JOIN organization_members om ON om.org_id = ma.org_id
      AND om.user_id = ${session.sub}
      AND om.is_founder = TRUE
      AND om.is_active = TRUE
    WHERE ma.status = 'pending'
      AND ma.founder_approved = FALSE
    ORDER BY ma.created_at DESC
    LIMIT 20
  `;

  // Recent submission status updates (last 7 days)
  const submissionUpdates = await sql`
    SELECT
      s.id, s.submission_type, s.status, s.original_headline,
      s.url, s.resolved_at,
      o.name AS org_name
    FROM submissions s
    LEFT JOIN organizations o ON o.id = s.org_id
    WHERE s.submitted_by = ${session.sub}
      AND s.status IN ('approved', 'consensus', 'rejected', 'consensus_rejected')
      AND s.resolved_at > NOW() - INTERVAL '7 days'
    ORDER BY s.resolved_at DESC
    LIMIT 10
  `;

  const juryItems = juryResult.rows.map((r: Record<string, unknown>) => ({
    ...r,
    org_name: r.org_name || "Unknown Org",
  }));
  const appItems = applicationsResult.rows.map((r: Record<string, unknown>) => ({
    ...r,
    username: r.username || "unknown",
    display_name: r.display_name || "",
    org_name: r.org_name || "Unknown Org",
  }));
  const updateItems = submissionUpdates.rows.map((r: Record<string, unknown>) => ({
    ...r,
    org_name: r.org_name || "Unknown Org",
  }));

  return ok({
    totalPending: juryItems.length + appItems.length,
    notifications: notifResult.rows,
    jury: {
      count: juryItems.length,
      items: juryItems,
    },
    applications: {
      count: appItems.length,
      items: appItems,
    },
    updates: {
      count: updateItems.length,
      items: updateItems,
    },
  });
}

// PATCH /api/notifications — mark all as read
export async function PATCH(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  await sql`
    UPDATE notifications SET "read" = TRUE
    WHERE user_id = ${session.sub} AND "read" = FALSE
  `;

  return ok({ success: true });
}
