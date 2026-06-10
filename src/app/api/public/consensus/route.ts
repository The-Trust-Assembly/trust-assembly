import { sql } from "@/lib/db";
import { ok, serverError } from "@/lib/api-utils";
import { computeScore } from "@/lib/scoring/engine";

export const dynamic = "force-dynamic";

// GET /api/public/consensus — Public feed of consensus-tier corrections.
// No authentication required. Returns the highest-trust content for
// anonymous browsing (app onboarding, discovery, adoption).
export async function GET() {
  try {
    const result = await sql`
      SELECT
        s.id, s.url, s.normalized_url, s.original_headline, s.replacement,
        s.submission_type, s.reasoning, s.status, s.author,
        s.created_at, s.resolved_at, s.slug, s.thumbnail_url,
        u.id AS submitter_id,
        u.username AS submitted_by, u.display_name AS submitted_by_display_name,
        u.total_wins, u.total_losses, u.current_streak,
        o.name AS org_name, o.id AS org_id
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE s.status IN ('consensus', 'approved')
      ORDER BY
        CASE WHEN s.status = 'consensus' THEN 0 ELSE 1 END,
        s.resolved_at DESC NULLS LAST
      LIMIT 50
    `;

    // Fetch evidence for these submissions
    const ids: string[] = result.rows.map((r: any) => r.id as string);
    let evidenceMap: Record<string, any[]> = {};
    if (ids.length > 0) {
      const evidence = await sql.query(
        `SELECT submission_id, url, explanation
         FROM submission_evidence
         WHERE submission_id = ANY($1)`,
        [ids]
      );
      evidence.rows.forEach((e: any) => {
        if (!evidenceMap[e.submission_id]) evidenceMap[e.submission_id] = [];
        evidenceMap[e.submission_id].push({ url: e.url, explanation: e.explanation });
      });
    }

    // System Submitter scores (spec A11: the extension/public surfaces
    // run on System-scope trust). Side-by-side with the legacy
    // trustScore until the cutover. Fail-soft pre-migration-027.
    const submitterScores: Record<string, { displayedPercent: number; rawPoints: number; pointsPossible: number }> = {};
    try {
      const submitterIds = [...new Set(result.rows.map((r: any) => r.submitter_id).filter(Boolean))];
      if (submitterIds.length > 0) {
        const tallies = await sql.query(
          `SELECT user_id, SUM(points_earned) AS earned, SUM(points_possible) AS possible,
                  SUM(rescue_bonus) AS bonus, SUM(deception_findings) AS deceptions
           FROM citizen_scores
           WHERE user_id = ANY($1) AND role = 'submitter' AND scope = 'system'
           GROUP BY user_id`,
          [submitterIds]
        );
        for (const row of tallies.rows) {
          const score = computeScore({
            pointsEarned: Number(row.earned),
            pointsPossible: Number(row.possible),
            rescueBonus: Number(row.bonus),
            deceptionFindings: Number(row.deceptions),
          });
          submitterScores[row.user_id] = {
            displayedPercent: score.displayedPercent,
            rawPoints: score.rawPoints,
            pointsPossible: score.pointsPossible,
          };
        }
      }
    } catch { /* scoring not migrated yet */ }

    const submissions = result.rows.map((s: any) => ({
      id: s.id,
      url: s.url,
      originalHeadline: s.original_headline,
      replacement: s.replacement,
      submissionType: s.submission_type,
      reasoning: s.reasoning,
      status: s.status,
      author: s.author,
      createdAt: s.created_at,
      resolvedAt: s.resolved_at,
      slug: s.slug,
      thumbnailUrl: s.thumbnail_url,
      submittedBy: s.submitted_by,
      submittedByDisplayName: s.submitted_by_display_name,
      orgName: s.org_name,
      orgId: s.org_id,
      trustScore: 100 + Math.sqrt(Math.max(0, s.total_wins || 0)),
      systemSubmitterScore: submitterScores[s.submitter_id] || null,
      evidence: evidenceMap[s.id] || [],
    }));

    return ok({
      submissions,
      total: submissions.length,
    });
  } catch (e) {
    return serverError("GET /api/public/consensus", e);
  }
}
