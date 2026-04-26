import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// Credit cost based on scope + platform count
function calculateRunCost(scope: string, keywords?: string[] | null): number {
  const baseCost =
    scope === "single" ? 1
    : scope === "top3" ? 1
    : scope === "top10" ? 2
    : scope === "pages5" ? 3
    : scope === "max" ? 3
    : scope === "30d" ? 2
    : 1;

  // Estimate platform count from keywords: count unique site: prefixes
  if (keywords && keywords.length > 0) {
    const sitePrefixes = new Set(
      keywords
        .map((k) => k.match(/^site:(\S+)/)?.[1])
        .filter(Boolean)
    );
    const platformCount = Math.max(1, sitePrefixes.size + (keywords.some((k) => !k.startsWith("site:")) ? 1 : 0));
    return baseCost + Math.max(0, platformCount - 1);
  }
  return baseCost;
}

// POST /api/agent/run
// ---------------------
// Starts a Trust Assembly Agent fact-checking run. Checks credits,
// deducts the cost, then inserts a queued row into agent_runs.
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return forbidden("Login required");

  try {
    const body = await request.json().catch(() => ({}));
    const thesis = typeof body.thesis === "string" ? body.thesis.trim() : "";
    const scope = typeof body.scope === "string" ? body.scope.trim() : "";
    const rawContext = body.context && typeof body.context === "object" ? body.context : {};

    const keywords = Array.isArray(body.keywords)
      ? (body.keywords as unknown[]).filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      : null;

    const context = {
      ...(rawContext || {}),
      ...(keywords && keywords.length > 0 ? { keywords } : {}),
    };
    const hasContext = Object.keys(context).length > 0;

    if (!thesis) return err("thesis is required", 400);
    if (thesis.length > 4000) return err("thesis must be 4000 characters or fewer", 400);
    if (!scope) return err("scope is required", 400);

    // Check credits
    const cost = calculateRunCost(scope, keywords);
    const creditResult = await sql`
      SELECT agent_credits FROM users WHERE id = ${session.sub} LIMIT 1
    `;
    const currentCredits = creditResult.rows[0]?.agent_credits ?? 0;

    if (currentCredits < cost) {
      return err(
        `Not enough credits. This run costs ${cost} credit${cost === 1 ? "" : "s"} but you have ${currentCredits}. Purchase more credits to continue.`,
        402
      );
    }

    // Deduct credits
    await sql`
      UPDATE users SET agent_credits = agent_credits - ${cost} WHERE id = ${session.sub}
    `;

    const result = await sql`
      INSERT INTO agent_runs (user_id, thesis, scope, context, status, stage_message)
      VALUES (${session.sub}, ${thesis}, ${scope}, ${hasContext ? JSON.stringify(context) : null}, 'queued', 'Queued — waiting for pipeline worker')
      RETURNING id, status, created_at
    `;

    const row = result.rows[0];
    return ok({
      runId: row.id,
      status: row.status,
      createdAt: row.created_at,
      creditsCost: cost,
      creditsRemaining: currentCredits - cost,
    });
  } catch (e) {
    return serverError("/api/agent/run", e);
  }
}
