import { MetadataRoute } from "next";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: APP_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  // Approved/consensus corrections
  const submissions = await sql`
    SELECT slug, resolved_at, created_at
    FROM submissions
    WHERE status IN ('approved', 'consensus') AND slug IS NOT NULL
    ORDER BY resolved_at DESC NULLS LAST
    LIMIT 1000
  `;
  for (const row of submissions.rows) {
    entries.push({
      url: `${APP_URL}/correction/${row.slug}`,
      lastModified: new Date(row.resolved_at || row.created_at),
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }

  // Approved/consensus stories
  const stories = await sql`
    SELECT slug, approved_at, created_at
    FROM stories
    WHERE status IN ('approved', 'consensus') AND slug IS NOT NULL
    ORDER BY approved_at DESC NULLS LAST
    LIMIT 500
  `;
  for (const row of stories.rows) {
    entries.push({
      url: `${APP_URL}/story/${row.slug}`,
      lastModified: new Date(row.approved_at || row.created_at),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  // Organizations
  const orgs = await sql`
    SELECT slug, created_at
    FROM organizations
    WHERE slug IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 200
  `;
  for (const row of orgs.rows) {
    entries.push({
      url: `${APP_URL}/assembly/${row.slug}`,
      lastModified: new Date(row.created_at),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}
