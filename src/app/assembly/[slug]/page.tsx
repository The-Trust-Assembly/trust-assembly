import { Metadata } from "next";
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

type Props = { params: Promise<{ slug: string }> };

async function getOrg(slug: string) {
  const result = await sql`
    SELECT
      o.id, o.slug, o.name, o.description, o.charter, o.is_general_public,
      o.enrollment_mode, o.created_at,
      u.username AS created_by,
      (SELECT COUNT(*) FROM organization_members om WHERE om.org_id = o.id AND om.is_active = TRUE) AS member_count,
      (SELECT COUNT(*) FROM submissions s WHERE s.org_id = o.id AND s.status IN ('approved', 'consensus')) AS correction_count,
      (SELECT COUNT(*) FROM stories st WHERE st.org_id = o.id AND st.status IN ('approved', 'consensus')) AS story_count
    FROM organizations o
    LEFT JOIN users u ON u.id = o.created_by
    WHERE o.slug = ${slug} OR o.id::text = ${slug}
    LIMIT 1
  `;
  return result.rows[0] || null;
}

async function getRecentCorrections(orgId: string) {
  const result = await sql`
    SELECT s.id, s.slug, s.original_headline, s.replacement, s.status,
           s.submission_type, s.created_at,
           u.username AS submitted_by
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.org_id = ${orgId} AND s.status IN ('approved', 'consensus')
    ORDER BY s.resolved_at DESC NULLS LAST
    LIMIT 10
  `;
  return result.rows;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const org = await getOrg(slug);
  if (!org) return { title: "Assembly Not Found — The Trust Assembly" };

  const title = `${org.name} — The Trust Assembly`;
  const description = (org.description as string)?.slice(0, 160) || `${org.name} is an assembly on The Trust Assembly civic deliberation platform.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/assembly/${org.slug || slug}`,
      siteName: "The Trust Assembly",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: {
      canonical: `${APP_URL}/assembly/${org.slug || slug}`,
    },
  };
}

export default async function AssemblyPage({ params }: Props) {
  const { slug } = await params;
  const org = await getOrg(slug);
  if (!org) notFound();

  const recentCorrections = await getRecentCorrections(org.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.name,
    description: org.description || org.charter,
    url: `${APP_URL}/assembly/${org.slug || slug}`,
    foundingDate: org.created_at,
    parentOrganization: {
      "@type": "Organization",
      name: "The Trust Assembly",
      url: APP_URL,
    },
    member: {
      "@type": "QuantitativeValue",
      value: parseInt(org.member_count as string),
      unitText: "members",
    },
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav style={{ marginBottom: "1.5rem", fontSize: "0.875rem" }}>
        <a href={APP_URL} style={{ color: "#2563eb" }}>The Trust Assembly</a>
        {" → "}
        <span>Assembly</span>
      </nav>

      <article>
        <header>
          <h1 style={{ fontSize: "1.75rem", lineHeight: 1.3, margin: "0 0 0.5rem" }}>
            {org.name}
          </h1>

          <div style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1.5rem" }}>
            {org.member_count} member{parseInt(org.member_count as string) !== 1 ? "s" : ""}
            {" · "}
            {org.correction_count} approved correction{parseInt(org.correction_count as string) !== 1 ? "s" : ""}
            {parseInt(org.story_count as string) > 0 && ` · ${org.story_count} stor${parseInt(org.story_count as string) !== 1 ? "ies" : "y"}`}
            {" · "}
            Founded by {org.created_by || "unknown"}
            {" · "}
            {new Date(org.created_at as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </header>

        {org.description && (
          <section>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>About</h2>
            <p style={{ lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{org.description}</p>
          </section>
        )}

        {org.charter && (
          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Charter</h2>
            <p style={{ lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{org.charter}</p>
          </section>
        )}

        {recentCorrections.length > 0 && (
          <section style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
              Recent Approved Corrections
            </h2>
            {recentCorrections.map((sub: Record<string, unknown>) => (
              <div key={sub.id as string} style={{ borderLeft: "3px solid #e5e7eb", paddingLeft: "1rem", marginBottom: "1.25rem" }}>
                <h3 style={{ fontSize: "1rem", margin: "0 0 0.25rem" }}>
                  <a href={`${APP_URL}/correction/${sub.slug || sub.id}`} style={{ color: "#2563eb" }}>
                    {sub.original_headline as string}
                  </a>
                </h3>
                {sub.replacement ? (
                  <p style={{ color: "#166534", fontSize: "0.9rem", margin: "0.25rem 0" }}>
                    → {String(sub.replacement)}
                  </p>
                ) : null}
                <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.25rem 0 0" }}>
                  {String(sub.submission_type)} · {String(sub.status).replace(/_/g, " ")}
                  {" · "}
                  {new Date(sub.created_at as string).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                </p>
              </div>
            ))}
          </section>
        )}
      </article>

      <footer style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid #e5e7eb", fontSize: "0.8rem", color: "#9ca3af" }}>
        <p>
          The Trust Assembly is a civic deliberation platform where truth is the only thing that survives adversarial review.
        </p>
      </footer>
    </main>
  );
}
