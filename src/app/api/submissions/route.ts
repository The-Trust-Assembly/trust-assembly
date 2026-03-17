import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { isWildWestMode, getJurySize, JURY_POOL_MULTIPLIER } from "@/lib/jury-rules";
import { validateFields, MAX_LENGTHS } from "@/lib/validation";

function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid", "ref", "source",
    ];
    trackingParams.forEach((p) => parsed.searchParams.delete(p));
    return parsed.toString();
  } catch {
    return raw;
  }
}

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
    LEFT JOIN users u ON u.id = s.submitted_by
    LEFT JOIN organizations o ON o.id = s.org_id
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
    const isTerminal = terminalStatuses.includes(row.status as string);
    return {
      ...row,
      submitted_by: isTerminal ? (row.submitted_by || "unknown") : null,
      submitted_by_display_name: isTerminal ? (row.submitted_by_display_name || "") : null,
      org_name: row.org_name || "Unknown Org",
    };
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
  const { submissionType, url, originalHeadline, replacement, reasoning, author, orgId, orgIds, evidence, inlineEdits } = body;

  // Support single orgId or multiple orgIds for multi-assembly submission
  const targetOrgIds: string[] = orgIds && Array.isArray(orgIds) && orgIds.length > 0
    ? orgIds
    : orgId ? [orgId] : [];

  // Validate required fields
  if (!submissionType || !url || !originalHeadline || !reasoning || targetOrgIds.length === 0) {
    return err("submissionType, url, originalHeadline, reasoning, and orgId (or orgIds) are required");
  }

  if (submissionType === "correction" && !replacement) {
    return err("Corrections require a replacement headline");
  }

  // Input length validation
  const lengthError = validateFields([
    ["originalHeadline", originalHeadline, MAX_LENGTHS.headline],
    ["replacement", replacement, MAX_LENGTHS.replacement],
    ["reasoning", reasoning, MAX_LENGTHS.reasoning],
    ["author", author, MAX_LENGTHS.author],
    ["url", url, MAX_LENGTHS.evidence_url],
  ]);
  if (lengthError) return err(lengthError);

  if (evidence && Array.isArray(evidence)) {
    for (const e of evidence) {
      const evError = validateFields([
        ["evidence url", e.url, MAX_LENGTHS.evidence_url],
        ["evidence explanation", e.explanation, MAX_LENGTHS.evidence_explanation],
      ]);
      if (evError) return err(evError);
    }
  }
  if (inlineEdits && Array.isArray(inlineEdits)) {
    for (const edit of inlineEdits) {
      const editError = validateFields([
        ["inline edit original", edit.original, MAX_LENGTHS.inline_edit_text],
        ["inline edit replacement", edit.replacement, MAX_LENGTHS.inline_edit_text],
        ["inline edit reasoning", edit.reasoning, MAX_LENGTHS.reasoning],
      ]);
      if (editError) return err(editError);
    }
  }

  // Verify user is member of all target orgs
  for (const targetOrg of targetOrgIds) {
    const membership = await sql`
      SELECT id FROM organization_members
      WHERE org_id = ${targetOrg} AND user_id = ${session.sub} AND is_active = TRUE
    `;
    if (membership.rows.length === 0) {
      return err("You must be a member of all selected assemblies to submit");
    }
  }

  const wildWest = await isWildWestMode();
  const user = await sql`SELECT current_streak, is_di, di_partner_id FROM users WHERE id = ${session.sub}`;
  const submitterIsDI = user.rows[0].is_di;
  const trustedSkip = !submitterIsDI && !wildWest && user.rows[0].current_streak >= 10;
  const jurySeats = wildWest ? 1 : null;

  const createdSubs: Record<string, unknown>[] = [];

  for (const targetOrg of targetOrgIds) {
    // Check member count for initial status
    const memberCount = await sql`
      SELECT COUNT(*) as count FROM organization_members
      WHERE org_id = ${targetOrg} AND is_active = TRUE
    `;
    const count = parseInt(memberCount.rows[0].count);
    // DI submissions require partner pre-approval before entering jury review
    const initialStatus = submitterIsDI ? "di_pending" : count < (wildWest ? 2 : 5) ? "pending_jury" : "pending_review";

    // Create submission (with normalized_url for indexed lookups)
    const normalizedUrl = normalizeUrl(url);
    const result = await sql`
      INSERT INTO submissions (
        submission_type, status, url, normalized_url, original_headline, replacement,
        reasoning, author, submitted_by, org_id, trusted_skip, is_di, di_partner_id, jury_seats
      ) VALUES (
        ${submissionType}, ${initialStatus}, ${url}, ${normalizedUrl}, ${originalHeadline},
        ${replacement || null}, ${reasoning}, ${author || null},
        ${session.sub}, ${targetOrg}, ${trustedSkip}, ${submitterIsDI}, ${user.rows[0].di_partner_id || null}, ${jurySeats}
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

    // Insert inline edits (body corrections) if provided
    if (inlineEdits && Array.isArray(inlineEdits)) {
      for (let i = 0; i < inlineEdits.length; i++) {
        const edit = inlineEdits[i];
        if (edit.original && edit.replacement) {
          await sql`
            INSERT INTO submission_inline_edits (submission_id, original_text, replacement_text, reasoning, sort_order)
            VALUES (${sub.id}, ${edit.original}, ${edit.replacement}, ${edit.reasoning || null}, ${i})
          `;
        }
      }
    }

    // Audit log
    await sql`
      INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id)
      VALUES ('Submission filed', ${session.sub}, ${targetOrg}, 'submission', ${sub.id})
    `;

    // ── Trusted contributor: auto-approve ──
    // Route through the same pipeline as jury-resolved submissions to
    // maintain a complete audit trail, update reputation consistently,
    // graduate vault entries, and trigger cross-group promotion.
    if (trustedSkip) {
      const now = new Date().toISOString();

      try {
        await sql`BEGIN`;

        await sql`UPDATE submissions SET status = 'approved', resolved_at = ${now} WHERE id = ${sub.id}`;

        // Reputation: increment wins and streak (consistent with vote-resolution)
        await sql`
          UPDATE users SET total_wins = total_wins + 1, current_streak = current_streak + 1
          WHERE id = ${session.sub}
        `;
        await sql`
          UPDATE organization_members SET assembly_streak = assembly_streak + 1
          WHERE org_id = ${targetOrg} AND user_id = ${session.sub} AND is_active = TRUE
        `;

        // Graduate linked vault entries if any
        const vaultTables = ["vault_entries", "arguments", "beliefs", "translations"];
        for (const table of vaultTables) {
          await sql.query(
            `UPDATE ${table} SET status = 'approved', approved_at = $1 WHERE submission_id = $2 AND status = 'pending'`,
            [now, sub.id],
          );
        }

        // Audit log entry for trusted auto-approval
        await sql`
          INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
          VALUES (
            'Submission resolved: APPROVED (trusted contributor auto-approve)',
            ${session.sub}, ${targetOrg}, 'submission', ${sub.id},
            ${JSON.stringify({ outcome: 'approved', trustedSkip: true })}
          )
        `;

        await sql`COMMIT`;
      } catch (e) {
        await sql`ROLLBACK`;
        console.error("Trusted auto-approve transaction failed:", e);
        throw e;
      }
    }

    // ── Jury assignment ──
    if (!trustedSkip && initialStatus === "pending_review") {
      const jurySize = wildWest ? 1 : getJurySize(count);
      // Wild West: add all eligible org members to pool so they can review
      const poolSize = wildWest ? count : jurySize * JURY_POOL_MULTIPLIER;

      await sql`
        UPDATE submissions SET jury_seats = ${jurySize} WHERE id = ${sub.id}
      `;

      const diPartnerId = user.rows[0].is_di ? (await sql`SELECT di_partner_id FROM users WHERE id = ${session.sub}`).rows[0]?.di_partner_id : null;

      const pool = await sql`
        SELECT om.user_id
        FROM organization_members om
        WHERE om.org_id = ${targetOrg}
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

    createdSubs.push(sub);
  }

  // Return single for backward compat, array for multi-org
  return ok(createdSubs.length === 1 ? createdSubs[0] : { submissions: createdSubs, count: createdSubs.length }, 201);
}
