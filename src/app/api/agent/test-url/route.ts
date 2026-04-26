import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";
import { fetchArticle } from "@/lib/agent/fetch";

export const dynamic = "force-dynamic";

// POST /api/agent/test-url
// --------------------------
// Tests whether a URL can be fetched and parsed by the agent pipeline.
// No credits consumed, no LLM calls — just the fetch + cheerio step.
//
// Body: { url: string } or { urls: string[] }
// Response: { results: [{ url, success, headline?, wordCount?, error? }] }
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return forbidden("Login required");

  try {
    const body = await request.json().catch(() => ({}));

    let urls: string[] = [];
    if (typeof body.url === "string") urls = [body.url.trim()];
    else if (Array.isArray(body.urls)) {
      urls = body.urls
        .filter((u: unknown): u is string => typeof u === "string" && u.trim().length > 0)
        .map((u: string) => u.trim());
    }

    if (urls.length === 0) return err("url or urls is required");
    if (urls.length > 10) return err("Maximum 10 URLs per test");

    const results = [];

    for (const url of urls) {
      const fetchResult = await fetchArticle(url);

      if (fetchResult.success) {
        const text = fetchResult.article.text;
        const wordCount = text.split(/\s+/).length;
        const tooShort = wordCount < 50;

        results.push({
          url,
          success: !tooShort,
          headline: fetchResult.article.headline || null,
          wordCount,
          preview: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
          ...(tooShort ? {
            error: `Only ${wordCount} words extracted. This page likely requires JavaScript to render (Twitter, Instagram) or is behind a login wall. Submit this URL manually instead.`,
          } : {}),
        });
      } else {
        const errMsg = fetchResult.error.error;
        let advice = "Submit this URL manually instead.";
        if (errMsg.includes("403")) advice = "This site blocked our request. Submit this URL manually instead.";
        else if (errMsg.includes("404")) advice = "This page doesn't exist. Check the URL.";
        else if (errMsg.includes("timeout") || errMsg.includes("Timeout")) advice = "The page took too long to respond. Try again or submit manually.";

        results.push({
          url,
          success: false,
          error: `${errMsg}. ${advice}`,
        });
      }
    }

    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return ok({ results, passed, failed });
  } catch (e) {
    return serverError("/api/agent/test-url", e);
  }
}
