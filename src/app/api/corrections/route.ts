import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

// GET /api/corrections?url=<url> — browser extension endpoint
// Reads from the KV store (where the React SPA stores all data)
// and returns corrections, affirmations, and translations for a given URL.
//
// ── PRIVACY BY DESIGN ──
// This endpoint is intentionally STATELESS and BLIND.
// We do NOT log, store, or record:
//   - The queried URL
//   - The requester's IP address
//   - Any request headers, user-agent strings, or fingerprints
//   - Any association between a user account and the URLs they query
//
// The URL is used solely as an in-memory filter key against existing
// submission data, then discarded. No database writes occur.
// No analytics. No telemetry. No server-side query cache.
//
// The only URLs stored on our servers are article URLs that submitters
// voluntarily publish when creating corrections. A reader's browsing
// activity must never be observable by Trust Assembly.

const VER = "v5";
const SK_SUBS = `ta-s-${VER}`;
const SK_USERS = `ta-u-${VER}`;
const SK_ORGS = `ta-o-${VER}`;
const SK_TRANSLATIONS = `ta-trans-${VER}`;

async function kvGet(key: string): Promise<unknown> {
  const result = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
  if (result.rows.length === 0 || !result.rows[0].value) return null;
  return JSON.parse(result.rows[0].value);
}

function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    // Strip www. prefix so www.bbc.com and bbc.com match
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    // Strip fragment and trailing slash from pathname
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    // Remove common tracking query params but keep meaningful ones
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return err("url query parameter is required");
  }

  const normalizedUrl = normalizeUrl(url);

  try {
    const [subsRaw, usersRaw, orgsRaw, transRaw] = await Promise.all([
      kvGet(SK_SUBS),
      kvGet(SK_USERS),
      kvGet(SK_ORGS),
      kvGet(SK_TRANSLATIONS),
    ]);

    const subs = (subsRaw as Record<string, Record<string, unknown>>) || {};
    const users = (usersRaw as Record<string, Record<string, unknown>>) || {};
    const orgs = (orgsRaw as Record<string, Record<string, unknown>>) || {};
    const trans = (transRaw as Record<string, Record<string, unknown>>) || {};

    // Find submissions matching this URL with approved/consensus status
    // Normalize both sides so trailing slashes, fragments, and tracking
    // params don't cause mismatches.
    const matching = Object.values(subs).filter(
      (s: Record<string, unknown>) =>
        normalizeUrl(s.url as string) === normalizedUrl &&
        (s.status === "approved" || s.status === "consensus")
    );

    const corrections: unknown[] = [];
    const affirmations: unknown[] = [];

    for (const sub of matching) {
      const submitter = users[sub.submittedBy as string] as Record<string, unknown> | undefined;
      const org = orgs[sub.orgId as string] as Record<string, unknown> | undefined;
      const totalReviews = ((submitter?.wins as number) || 0) + ((submitter?.losses as number) || 0);
      const trustScore = totalReviews > 0
        ? Math.round(((submitter?.wins as number) || 0) / totalReviews * 100)
        : null;

      const item = {
        id: sub.id,
        submissionType: sub.submissionType,
        originalHeadline: sub.originalHeadline,
        replacement: sub.replacement,
        author: sub.author,
        reasoning: sub.reasoning,
        evidence: sub.evidence || [],
        submittedBy: sub.submittedBy,
        orgId: sub.orgId || "",
        orgName: org?.name || "",
        status: sub.status,
        trustScore,
        profile: {
          displayName: submitter?.displayName || submitter?.username || "",
          gender: submitter?.gender,
          age: submitter?.age,
          country: submitter?.country,
          state: submitter?.state,
          politicalAffiliation: submitter?.politicalAffiliation,
          currentStreak: submitter?.streak || 0,
        },
      };

      if (sub.submissionType === "affirmation") {
        affirmations.push(item);
      } else {
        corrections.push(item);
      }
    }

    // Get approved translations (these apply globally, not per-URL)
    const translations = Object.values(trans)
      .filter((t: Record<string, unknown>) => t.status === "approved")
      .map((t: Record<string, unknown>) => ({
        id: t.id,
        original: t.original,
        translated: t.translated,
        type: t.type,
        orgName: (orgs[t.orgId as string] as Record<string, unknown>)?.name || "",
        status: t.status,
      }));

    return ok({
      corrections,
      affirmations,
      translations,
      meta: {
        totalReviews: corrections.length + affirmations.length,
        highestConsensus: matching.some((s) => s.status === "consensus"),
      },
    });
  } catch (e) {
    console.error("Error fetching corrections:", e);
    return err("Internal error", 500);
  }
}
