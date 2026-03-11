import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// GET /api/submissions — list submissions (filterable)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const status = searchParams.get("status");
  const submittedBy = searchParams.get("submittedBy");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  // Build query with optional filters
  let query = `
    SELECT
      s.id, s.submission_type, s.status, s.url, s.original_headline,
      s.replacement, s.reasoning, s.author, s.trusted_skip,
      s.is_di, s.deliberate_lie_finding, s.survival_count,
      s.created_at, s.resolved_at,
      u.username AS submitted_by, u.display_name AS submitted_by_display_name,
      o.name AS org_name
    FROM submissions s
    JOIN users u ON u.id = s.submitted_by
    JOIN organizations o ON o.id = s.org_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (orgId) {
    query += ` AND s.org_id = $${paramIndex++}`;
    params.push(orgId);
  }
  if (status) {
    query += ` AND s.status = $${paramIndex++}`;
    params.push(status);
  }
  if (submittedBy) {
    query += ` AND u.username = $${paramIndex++}`;
    params.push(submittedBy.toLowerCase());
  }

  query += ` ORDER BY s.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);

  return ok({
    submissions: result.rows,
    limit,
    offset,
  });
}

// POST /api/submissions — file a correction or affirmation
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json();
  const { submissionType, url, originalHeadline, replacement, reasoning, author, orgId, evidence } = body;

  // Validate required fields
  if (!submissionType || !url || !originalHeadline || !reasoning || !orgId) {
    return err("submissionType, url, originalHeadline, reasoning, and orgId are required");
  }

  if (submissionType === "correction" && !replacement) {
    return err("Corrections require a replacement headline");
  }

  // Verify user is member of org
  const membership = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${orgId} AND user_id = ${session.sub} AND is_active = TRUE
  `;
  if (membership.rows.length === 0) {
    return err("You must be a member of this assembly to submit");
  }

  // Check member count for initial status
  const memberCount = await sql`
    SELECT COUNT(*) as count FROM organization_members
    WHERE org_id = ${orgId} AND is_active = TRUE
  `;
  const count = parseInt(memberCount.rows[0].count);
  const initialStatus = count < 5 ? "pending_jury" : "pending_review";

  // Check if user is trusted contributor (10+ streak)
  const user = await sql`SELECT current_streak, is_di FROM users WHERE id = ${session.sub}`;
  const trustedSkip = user.rows[0].current_streak >= 10;

  // Create submission
  const result = await sql`
    INSERT INTO submissions (
      submission_type, status, url, original_headline, replacement,
      reasoning, author, submitted_by, org_id, trusted_skip, is_di
    ) VALUES (
      ${submissionType}, ${initialStatus}, ${url}, ${originalHeadline},
      ${replacement || null}, ${reasoning}, ${author || null},
      ${session.sub}, ${orgId}, ${trustedSkip}, ${user.rows[0].is_di}
    ) RETURNING id, submission_type, status, created_at
  `;

  const sub = result.rows[0];

  // Insert evidence if provided
  if (evidence && Array.isArray(evidence)) {
    for (let i = 0; i < evidence.length; i++) {
      const e = evidence[i];
      if (e.url && e.explanation) {
        await sql`
          INSERT INTO submission_evidence (submission_id, url, explanation, sort_order)
          VALUES (${sub.id}, ${e.url}, ${e.explanation}, ${i})
        `;
      }
    }
  }

  // Audit log
  await sql`
    INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id)
    VALUES ('Submission filed', ${session.sub}, ${orgId}, 'submission', ${sub.id})
  `;

  return ok(sub, 201);
}
