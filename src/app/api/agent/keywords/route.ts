import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
// Short run — just a single LLM call in Stage C; generous ceiling
export const maxDuration = 60;

// POST /api/agent/keywords
// -------------------------
// Takes a thesis + optional context and returns a list of editable
// search keyword phrases. The user edits these chips before running
// the pipeline.
//
// Body: { thesis: string, context?: { who?, what?, when?, where?, why? } }
// Response: { keywords: string[] }
//
// STAGE B: Returns mock keywords derived from the thesis. No LLM call.
// STAGE C: Will use Sonnet 4.6 to generate 7–15 high-quality keywords
// (~$0.001 per call) per the pipeline architecture in the requirements.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json().catch(() => ({}));
    const thesis = typeof body.thesis === "string" ? body.thesis.trim() : "";

    if (!thesis) return err("thesis is required");
    if (thesis.length > 4000) return err("thesis must be 4000 characters or fewer");

    // --- MOCK (Stage B): Extract a few candidate phrases from the thesis ---
    // This is just to get the UI flowing end-to-end. Stage C replaces this
    // with a real Sonnet call that generates genuinely useful keywords.
    const words = thesis
      .toLowerCase()
      .replace(/[^\w\s'-]/g, " ")
      .split(/\s+/)
      .filter((w: string) => w.length > 3 && !STOPWORDS.has(w));

    // Deduplicate while preserving order
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w);
        unique.push(w);
      }
    }

    const top = unique.slice(0, 8);
    const mockKeywords: string[] = [];

    // Seed with a few 2-3 word combinations
    for (let i = 0; i < Math.min(top.length, 5); i++) {
      const a = top[i];
      const b = top[(i + 1) % top.length];
      mockKeywords.push(`${a} ${b}`);
    }
    // Plus a few single-word keywords for broader matches
    for (const w of top.slice(0, 3)) {
      mockKeywords.push(w);
    }

    if (mockKeywords.length === 0) {
      // Fallback if the thesis was mostly stopwords
      mockKeywords.push(thesis.split(/\s+/).slice(0, 5).join(" "));
    }

    return ok({
      keywords: mockKeywords,
      note: "Stage B stub — these are mechanically extracted from your thesis. Stage C will replace this with Sonnet-generated keywords.",
    });
  } catch (e) {
    return serverError("/api/agent/keywords", e);
  }
}

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "are", "was", "were",
  "have", "has", "had", "not", "but", "from", "they", "their", "them",
  "what", "when", "where", "which", "who", "whom", "will", "would",
  "can", "could", "should", "about", "after", "before", "been",
  "being", "does", "into", "more", "most", "over", "same", "some",
  "such", "than", "then", "there", "these", "those", "through",
  "under", "until", "very", "while", "also", "because", "even",
  "each", "other", "many", "much",
]);
