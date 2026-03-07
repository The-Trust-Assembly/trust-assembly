import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

// GET /api/corrections?url=<url> — browser extension endpoint
// Reads from the KV store (where the React SPA stores all data)
// and returns corrections, affirmations, and translations for a given URL.

const VER = "v6";
const SK_SUBS = `ta-s-${VER}`;
const SK_USERS = `ta-u-${VER}`;
const SK_ORGS = `ta-o-${VER}`;
const SK_TRANSLATIONS = `ta-trans-${VER}`;

async function kvGet(key: string): Promise<unknown> {
  const result = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
  if (result.rows.length === 0 || !result.rows[0].value) return null;
  return JSON.parse(result.rows[0].value);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return err("url query parameter is required");
  }

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
    const matching = Object.values(subs).filter(
      (s: Record<string, unknown>) =>
        s.url === url &&
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
