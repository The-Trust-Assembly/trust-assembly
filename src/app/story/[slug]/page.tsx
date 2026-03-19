import { Metadata } from "next";
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

type Props = { params: Promise<{ slug: string }> };

async function getStory(slug: string) {
  const result = await sql`
    SELECT
      st.id, st.slug, st.title, st.description, st.status, st.org_id,
      st.created_at, st.approved_at, st.resolved_at,
      u.username AS submitted_by,
      o.name AS org_name, o.slug AS org_slug
    FROM stories st
    LEFT JOIN users u ON u.id = st.submitted_by
    LEFT JOIN organizations o ON o.id = st.org_id
    WHERE st.slug = ${slug} OR st.id::text = ${slug}
    LIMIT 1
  `;
  return result.rows[0] || null;
}

async function getLinkedSubmissions(storyId: string) {
  const result = await sql`
    SELECT
      sub.id, sub.slug, sub.submission_type, sub.status, sub.url,
      sub.original_headline, sub.replacement, sub.reasoning, sub.author,
      sub.created_at,
      u.username AS submitted_by,
      ss.status AS tag_status
    FROM story_submissions ss
    JOIN submissions sub ON sub.id = ss.submission_id
    LEFT JOIN users u ON u.id = sub.submitted_by
    WHERE ss.story_id = ${storyId} AND ss.status = 'approved'
    ORDER BY sub.created_at DESC
  `;
  return result.rows;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = await getStory(slug);
  if (!story) return { title: "Story Not Found — The Trust Assembly" };

  const title = `${story.title} — The Trust Assembly`;
  const description = (story.description as string)?.slice(0, 160) || "A story tracked by The Trust Assembly.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/story/${story.slug || slug}`,
      siteName: "The Trust Assembly",
      type: "article",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: {
      canonical: `${APP_URL}/story/${story.slug || slug}`,
    },
  };
}

export default async function StoryPage({ params }: Props) {
  const { slug } = await params;
  const story = await getStory(slug);
  if (!story) notFound();

  const submissions = await getLinkedSubmissions(story.id);
  const statusLabel = (story.status as string).replace(/_/g, " ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: story.title,
    description: story.description,
    url: `${APP_URL}/story/${story.slug || slug}`,
    datePublished: story.created_at,
    dateModified: story.approved_at || story.created_at,
    author: {
      "@type": "Person",
      name: story.submitted_by || "anonymous",
    },
    publisher: {
      "@type": "Organization",
      name: "The Trust Assembly",
      url: APP_URL,
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
        <a href={`${APP_URL}/assembly/${story.org_slug || ""}`} style={{ color: "#2563eb" }}>{story.org_name}</a>
        {" → "}
        <span>Story</span>
      </nav>

      <article>
        <header>
          <span style={{
            display: "inline-block",
            padding: "0.25rem 0.75rem",
            borderRadius: "1rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            textTransform: "uppercase",
            background: story.status === "consensus" ? "#dcfce7" : story.status === "approved" ? "#dbeafe" : "#f3f4f6",
            color: story.status === "consensus" ? "#166534" : story.status === "approved" ? "#1e40af" : "#374151",
            marginBottom: "0.75rem",
          }}>
            {statusLabel}
          </span>

          <h1 style={{ fontSize: "1.75rem", lineHeight: 1.3, margin: "0.75rem 0" }}>
            {story.title}
          </h1>

          <div style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1.5rem" }}>
            Submitted by {story.submitted_by || "anonymous"} · {story.org_name}
            {" · "}
            {new Date(story.created_at as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </header>

        <section>
          <p style={{ lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{story.description}</p>
        </section>

        {submissions.length > 0 && (
          <section style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
              Linked Corrections ({submissions.length})
            </h2>
            {submissions.map((sub: Record<string, unknown>) => (
              <div key={sub.id as string} style={{ borderLeft: "3px solid #e5e7eb", paddingLeft: "1rem", marginBottom: "1.5rem" }}>
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
                  {sub.author ? ` · by ${String(sub.author)}` : null}
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
