import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

export async function GET() {
  const result = await sql`
    SELECT
      s.id, s.slug, s.original_headline, s.replacement, s.reasoning,
      s.resolved_at, s.created_at,
      o.name AS org_name
    FROM submissions s
    LEFT JOIN organizations o ON o.id = s.org_id
    WHERE s.status IN ('approved', 'consensus')
    ORDER BY s.resolved_at DESC NULLS LAST
    LIMIT 50
  `;

  const items = result.rows.map((row: Record<string, unknown>) => {
    const slug = row.slug || row.id;
    const title = row.replacement
      ? `Correction: ${row.original_headline}`
      : `Affirmation: ${row.original_headline}`;
    const description = (row.reasoning as string)?.slice(0, 500) || "";
    const pubDate = new Date(row.resolved_at as string || row.created_at as string).toUTCString();
    const category = row.org_name || "The General Public";

    return `    <item>
      <title><![CDATA[${title}]]></title>
      <description><![CDATA[${description}]]></description>
      <link>${APP_URL}/correction/${slug}</link>
      <guid isPermaLink="true">${APP_URL}/correction/${slug}</guid>
      <pubDate>${pubDate}</pubDate>
      <category><![CDATA[${category}]]></category>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The Trust Assembly — Verified Corrections</title>
    <link>${APP_URL}</link>
    <description>Corrections and affirmations that have survived adversarial jury review by citizens of The Trust Assembly.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${APP_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
    },
  });
}
