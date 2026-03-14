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
  const user = await sql`SELECT current_streak, is_di FROM users WHERE id = ${session.sub}`;
  const trustedSkip = !wildWest && user.rows[0].current_streak >= 10;
  const jurySeats = wildWest ? 1 : null;

  const createdSubs: Record<string, unknown>[] = [];

  for (const targetOrg of targetOrgIds) {
    // Check member count for initial status
    const memberCount = await sql`
      SELECT COUNT(*) as count FROM organization_members
      WHERE org_id = ${targetOrg} AND is_active = TRUE
    `;
    const count = parseInt(memberCount.rows[0].count);
    const initialStatus = count < (wildWest ? 2 : 5) ? "pending_jury" : "pending_review";

    // Create submission
    const result = await sql`
      INSERT INTO submissions (
        submission_type, status, url, original_headline, replacement,
        reasoning, author, submitted_by, org_id, trusted_skip, is_di, jury_seats
      ) VALUES (
        ${submissionType}, ${initialStatus}, ${url}, ${originalHeadline},
        ${replacement || null}, ${reasoning}, ${author || null},
        ${session.sub}, ${targetOrg}, ${trustedSkip}, ${user.rows[0].is_di}, ${jurySeats}
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
    if (trustedSkip) {
      await sql`UPDATE submissions SET status = 'approved', resolved_at = NOW() WHERE id = ${sub.id}`;
      await sql`UPDATE users SET total_wins = total_wins + 1, current_streak = current_streak + 1 WHERE id = ${session.sub}`;
    }

    // ── Jury assignment (normal mode only) ──
    if (!trustedSkip && !wildWest && initialStatus === "pending_review") {
      const jurySize = getJurySize(count);
      const poolSize = jurySize * JURY_POOL_MULTIPLIER;

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

    // ── KV store sync ──
    try {
      const SK_SUBS = "ta-s-v5";
      const kvResult = await sql`SELECT value FROM kv_store WHERE key = ${SK_SUBS}`;
      const subs = kvResult.rows.length > 0 && kvResult.rows[0].value
        ? JSON.parse(kvResult.rows[0].value)
        : {};

      const editsList = (inlineEdits && Array.isArray(inlineEdits))
        ? inlineEdits.filter((e: Record<string, unknown>) => e.original && e.replacement).map((e: Record<string, unknown>) => ({
            original: e.original,
            replacement: e.replacement,
            reasoning: e.reasoning || null,
          }))
        : [];

      // Get org name for display
      const orgRow = await sql`SELECT name FROM organizations WHERE id = ${targetOrg}`;
      const orgName = orgRow.rows[0]?.name || "";

      // Get jury pool usernames for KV store
      const juryPool = await sql`
        SELECT u.username FROM jury_assignments ja
        JOIN users u ON u.id = ja.user_id
        WHERE ja.submission_id = ${sub.id}
      `;
      const jurorUsernames = juryPool.rows.map((r: Record<string, unknown>) => r.username as string);

      // Build anon map
      const anonMap: Record<string, string> = {};
      anonMap[session.sub] = `Citizen-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      jurorUsernames.forEach((j: string, i: number) => { anonMap[j] = `Juror-${String.fromCharCode(65 + i)}`; });

      const jurySize = (!wildWest && initialStatus === "pending_review") ? getJurySize(count) : (wildWest ? 1 : 0);

      subs[sub.id] = {
        id: sub.id,
        submissionType: submissionType,
        status: trustedSkip ? "approved" : initialStatus,
        url,
        originalHeadline,
        replacement: replacement || null,
        reasoning,
        author: author || null,
        submittedBy: session.sub,
        orgId: targetOrg,
        orgName,
        trustedSkip,
        isDI: user.rows[0].is_di,
        diPartner: null,
        evidence: evidence || [],
        inlineEdits: editsList,
        standingCorrection: body.standingCorrection || null,
        standingCorrections: body.standingCorrections || [],
        argumentEntry: body.argumentEntry || null,
        argumentEntries: body.argumentEntries || [],
        beliefEntry: body.beliefEntry || null,
        beliefEntries: body.beliefEntries || [],
        translationEntry: body.translationEntry || null,
        translationEntries: body.translationEntries || [],
        linkedVaultEntries: body.linkedVaultEntries || [],
        jurors: jurorUsernames,
        jurySeed: Math.floor(Math.random() * 10000),
        jurySeats: jurySize,
        acceptedJurors: [],
        acceptedAt: {},
        votes: {},
        crossGroupJurors: [],
        crossGroupVotes: {},
        crossGroupSeed: 0,
        crossGroupAcceptedJurors: [],
        crossGroupAcceptedAt: {},
        crossGroupJurySize: 0,
        anonMap,
        createdAt: sub.created_at,
        resolvedAt: trustedSkip ? sub.created_at : null,
        deliberateLie: false,
        auditTrail: [{ time: sub.created_at, action: trustedSkip
          ? "🛡 Submitted (Trusted Contributor — jury skipped, disputable)"
          : initialStatus === "pending_review"
          ? `Submission received. Jury pool: ${jurorUsernames.length} jurors — ${jurySize} seats.`
          : `Submission received. Queued — ${count} members, 5 needed.` }],
      };

      const json = JSON.stringify(subs);
      await sql`
        INSERT INTO kv_store (key, value, updated_at)
        VALUES (${SK_SUBS}, ${json}, now())
        ON CONFLICT (key)
        DO UPDATE SET value = ${json}, updated_at = now()
      `;
    } catch (e) {
      console.error("KV sync failed:", e);
    }

    createdSubs.push(sub);
  }

  // Return single for backward compat, array for multi-org
  return ok(createdSubs.length === 1 ? createdSubs[0] : { submissions: createdSubs, count: createdSubs.length }, 201);
}
