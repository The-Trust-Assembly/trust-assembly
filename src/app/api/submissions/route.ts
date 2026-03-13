import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { isWildWestMode, getJurySize, JURY_POOL_MULTIPLIER } from "@/lib/jury-rules";

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

  // Anonymize submitter identity for submissions still under review
  const terminalStatuses = ["approved", "consensus", "rejected", "consensus_rejected"];
  const submissions = result.rows.map((row: Record<string, unknown>) => {
    if (!terminalStatuses.includes(row.status as string)) {
      return { ...row, submitted_by: null, submitted_by_display_name: null };
    }
    return row;
  });

  return ok({
    submissions,
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
  const wildWest = await isWildWestMode();
  const memberCount = await sql`
    SELECT COUNT(*) as count FROM organization_members
    WHERE org_id = ${orgId} AND is_active = TRUE
  `;
  const count = parseInt(memberCount.rows[0].count);
  // Wild West: only need 2 members (submitter + 1 reviewer); normal: need 5
  const initialStatus = count < (wildWest ? 2 : 5) ? "pending_jury" : "pending_review";

  // Check if user is trusted contributor (10+ streak) — disabled in Wild West mode
  const user = await sql`SELECT current_streak, is_di FROM users WHERE id = ${session.sub}`;
  const trustedSkip = !wildWest && user.rows[0].current_streak >= 10;

  // In Wild West mode, only 1 jury seat is needed
  const jurySeats = wildWest ? 1 : null;

  // Create submission
  const result = await sql`
    INSERT INTO submissions (
      submission_type, status, url, original_headline, replacement,
      reasoning, author, submitted_by, org_id, trusted_skip, is_di, jury_seats
    ) VALUES (
      ${submissionType}, ${initialStatus}, ${url}, ${originalHeadline},
      ${replacement || null}, ${reasoning}, ${author || null},
      ${session.sub}, ${orgId}, ${trustedSkip}, ${user.rows[0].is_di}, ${jurySeats}
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

  // ── Jury assignment (normal mode only) ──
  // In Wild West mode, any org member can vote without formal assignment.
  // In normal mode, we need to draw a jury from the org's active members.
  if (!wildWest && initialStatus === "pending_review") {
    const jurySize = getJurySize(count);
    const poolSize = jurySize * JURY_POOL_MULTIPLIER;

    // Update jury_seats on the submission so vote resolution knows the target
    await sql`
      UPDATE submissions SET jury_seats = ${jurySize} WHERE id = ${sub.id}
    `;

    // Draw eligible jurors: active org members who are NOT the submitter
    // and NOT the DI partner (if applicable)
    const diPartnerId = user.rows[0].is_di ? (await sql`SELECT di_partner_id FROM users WHERE id = ${session.sub}`).rows[0]?.di_partner_id : null;

    const pool = await sql`
      SELECT om.user_id
      FROM organization_members om
      WHERE om.org_id = ${orgId}
        AND om.is_active = TRUE
        AND om.user_id != ${session.sub}
        AND (${diPartnerId}::uuid IS NULL OR om.user_id != ${diPartnerId})
      ORDER BY RANDOM()
      LIMIT ${poolSize}
    `;

    for (const juror of pool.rows) {
      await sql`
        INSERT INTO jury_assignments (submission_id, user_id, role, in_pool, accepted)
        VALUES (${sub.id}, ${juror.user_id}, 'in_group', TRUE, FALSE)
        ON CONFLICT DO NOTHING
      `;
    }
  }

  // ── KV store sync ──
  // The browser extension reads from the KV store, so new submissions must
  // be written there for the full pipeline to work.
  try {
    const SK_SUBS = "ta-s-v5";
    const kvResult = await sql`SELECT value FROM kv_store WHERE key = ${SK_SUBS}`;
    const subs = kvResult.rows.length > 0 && kvResult.rows[0].value
      ? JSON.parse(kvResult.rows[0].value)
      : {};

    subs[sub.id] = {
      id: sub.id,
      submissionType: submissionType,
      status: initialStatus,
      url,
      originalHeadline,
      replacement: replacement || null,
      reasoning,
      author: author || null,
      submittedBy: session.sub,
      orgId,
      trustedSkip,
      isDi: user.rows[0].is_di,
      evidence: evidence || [],
      inlineEdits: [],
      createdAt: sub.created_at,
      resolvedAt: null,
      deliberateLie: false,
      auditTrail: [{ time: sub.created_at, action: "Submission filed" }],
    };

    const json = JSON.stringify(subs);
    await sql`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${SK_SUBS}, ${json}, now())
      ON CONFLICT (key)
      DO UPDATE SET value = ${json}, updated_at = now()
    `;
  } catch (e) {
    // KV sync is non-critical — don't fail the submission
    console.error("KV sync failed:", e);
  }

  return ok(sub, 201);
}
