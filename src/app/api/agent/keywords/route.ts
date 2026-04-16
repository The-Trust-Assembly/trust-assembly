import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";
import { generateKeywordsFromThesis } from "@/lib/agent/search";
import { estimateCost, DEFAULT_MODEL } from "@/lib/agent/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/agent/keywords
// -------------------------
// Takes a thesis + optional context and returns a list of editable
// search keyword phrases. The user edits these chips in the
// SentinelDashboard before running the pipeline.
//
// Uses Sonnet to generate 7–15 high-quality keywords (~$0.001 per call).
// Falls back to mechanical extraction if the Sonnet call fails.
//
// Body: { thesis: string, context?: { who?, what?, when?, where?, why? } }
// Response: { keywords: string[], usage?: {...}, estimatedCost?: number }
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json().catch(() => ({}));
    const thesis = typeof body.thesis === "string" ? body.thesis.trim() : "";

    if (!thesis) return err("thesis is required");
    if (thesis.length > 4000) return err("thesis must be 4000 characters or fewer");

    const context =
      body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? (body.context as Record<string, string | undefined>)
        : undefined;

    const { keywords, usage } = await generateKeywordsFromThesis(thesis, context);

    return ok({
      keywords,
      usage,
      estimatedCost: estimateCost(DEFAULT_MODEL, usage.inputTokens, usage.outputTokens),
    });
  } catch (e) {
    return serverError("/api/agent/keywords", e);
  }
}
