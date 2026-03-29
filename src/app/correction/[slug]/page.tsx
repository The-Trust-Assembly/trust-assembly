import { Metadata } from "next";
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trustassembly.org";

type Props = { params: Promise<{ slug: string }> };

async function getSubmission(slug: string) {
  // Try slug first, fall back to UUID for backward compat
  const result = await sql`
    SELECT
      s.id, s.slug, s.submission_type, s.status, s.url,
      s.original_headline, s.replacement, s.reasoning, s.author,
      s.survival_count, s.created_at, s.resolved_at,
      u.username AS submitted_by, u.display_name AS submitted_by_display_name,
      o.name AS org_name, o.slug AS org_slug
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    LEFT JOIN organizations o ON o.id = s.org_id
    WHERE s.slug = ${slug} OR s.id::text = ${slug}
    LIMIT 1
  `;
  return result.rows[0] || null;
}

async function getEvidence(submissionId: string) {
  const result = await sql`
    SELECT url, explanation, sort_order
    FROM submission_evidence
    WHERE submission_id = ${submissionId}
    ORDER BY sort_order
  `;
  return result.rows;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sub = await getSubmission(slug);
  if (!sub) return { title: "Correction Not Found — The Trust Assembly" };

  const typeLabel = sub.submission_type === "correction" ? "Correction" : "Affirmation";
  const title = `${typeLabel}: ${sub.original_headline} — The Trust Assembly`;
  const description = sub.reasoning?.slice(0, 160) || `A ${typeLabel.toLowerCase()} submitted to The Trust Assembly for adversarial review.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/correction/${sub.slug || slug}`,
      siteName: "The Trust Assembly",
      type: "article",
      authors: [`Trust Assembly — ${sub.org_name || "The General Public"}`],
      publishedTime: sub.resolved_at || sub.created_at,
    },
    twitter: {
      card: "summary",
      title,
      description,
      site: "@TrustAssembly",
    },
    alternates: {
      canonical: `${APP_URL}/correction/${sub.slug || slug}`,
    },
  };
}

export default async function CorrectionPage({ params }: Props) {
  const { slug } = await params;
  const sub = await getSubmission(slug);
  if (!sub) notFound();

  const evidence = await getEvidence(sub.id);
  const typeLabel = sub.submission_type === "correction" ? "Correction" : "Affirmation";
  const statusLabel = (sub.status as string).replace(/_/g, " ");

  // JSON-LD structured data for LLM and search engine consumption
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ClaimReview",
    url: `${APP_URL}/correction/${sub.slug || slug}`,
    claimReviewed: sub.original_headline,
    author: {
      "@type": "Organization",
      name: "The Trust Assembly",
      url: APP_URL,
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: sub.status === "consensus" ? 1 : sub.status === "approved" ? 2 : 4,
      bestRating: 5,
      worstRating: 1,
      alternateName: sub.submission_type === "correction" ? "Misleading" : "Accurate",
      ratingExplanation: sub.reasoning,
    },
    itemReviewed: {
      "@type": "CreativeWork",
      url: sub.url,
      author: sub.author ? { "@type": "Person", name: sub.author } : undefined,
    },
    datePublished: sub.created_at,
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
        <span>{typeLabel}</span>
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
            background: sub.status === "consensus" ? "#dcfce7" : sub.status === "approved" ? "#dbeafe" : "#f3f4f6",
            color: sub.status === "consensus" ? "#166534" : sub.status === "approved" ? "#1e40af" : "#374151",
            marginBottom: "0.75rem",
          }}>
            {statusLabel}
          </span>

          <h1 style={{ fontSize: "1.75rem", lineHeight: 1.3, margin: "0.75rem 0" }}>
            {typeLabel}: {sub.original_headline}
          </h1>

          {sub.replacement && (
            <p style={{ fontSize: "1.1rem", color: "#166534", fontStyle: "italic", margin: "0.5rem 0 1rem" }}>
              Proposed correction: {sub.replacement}
            </p>
          )}

          <div style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1.5rem" }}>
            {sub.author && <span>Article by {sub.author} · </span>}
            Submitted by {sub.submitted_by || "anonymous"} · {sub.org_name}
            {" · "}
            {new Date(sub.created_at as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            {sub.survival_count > 0 && ` · Survived ${sub.survival_count} challenge${sub.survival_count > 1 ? "s" : ""}`}
          </div>
        </header>

        <section>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Reasoning</h2>
          <p style={{ lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{sub.reasoning}</p>
        </section>

        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Original Article</h2>
          <a href={sub.url as string} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>
            {sub.url}
          </a>
        </section>

        {evidence.length > 0 && (
          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Evidence</h2>
            <ol style={{ paddingLeft: "1.25rem" }}>
              {evidence.map((e: Record<string, unknown>, i: number) => (
                <li key={i} style={{ marginBottom: "0.75rem" }}>
                  <a href={e.url as string} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>
                    {e.url as string}
                  </a>
                  <p style={{ margin: "0.25rem 0 0", color: "#374151" }}>{e.explanation as string}</p>
                </li>
              ))}
            </ol>
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
